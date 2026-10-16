"""Exercise a real VCS install and reject mismatched release artifacts."""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

from test_commands import ROOT, PACKAGING, builder


spec = importlib.util.spec_from_file_location("release_hook", PACKAGING / "python" / "hatch_build.py")
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
VERSION = "2.4.0.546"


def git(root, *args):
    return subprocess.run(
        ["git", "-c", "user.name=Packaging test", "-c", "user.email=packaging@example.invalid",
         *args], cwd=root, check=True, capture_output=True, text=True,
    )


@pytest.fixture
def checkout(tmp_path):
    root = tmp_path / "source repository"
    root.mkdir()
    for name in ("pyproject.toml", "LICENSE", "src/_version.h",
                 "tritium/packaging/python/README.md", "tritium/packaging/python/hatch_build.py",
                 "tritium/packaging/python/cuemol_launcher/__init__.py"):
        destination = root / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, destination)
    (root / "src/_version.h").write_text(f'#define QM_VERSION "{VERSION}"\n')
    git(root, "init")
    git(root, "add", ".")
    git(root, "commit", "--no-gpg-sign", "-m", "Create release fixture")
    git(root, "tag", "v" + VERSION)
    return root


@pytest.fixture
def release(tmp_path, monkeypatch):
    platform_tag = hook.release_platform()
    platform, arch = next(key for key, value in builder.PLATFORMS.items() if value[1] == platform_tag)
    app = tmp_path / "app"
    runtime = app / "CueMol3.app" / "Contents" if platform == "darwin" else app
    executable = "CueMol3.exe" if platform == "win32" else "CueMol3"
    binary = runtime / "MacOS" / executable if platform == "darwin" else runtime / executable
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_bytes(b"GUI runtime fixture")
    binary.chmod(0o755)
    cli = runtime / ("Resources" if platform == "darwin" else "resources") / "cli" / "cuemol.mjs"
    cli.parent.mkdir(parents=True)
    cli.write_text("CLI fixture")
    manifest = tmp_path / "command-build.json"
    manifest.write_text(json.dumps({"platform": platform, "arch": arch, "version": VERSION,
                                    "appDir": "app", "product": "CueMol3", "executable": executable}))
    _, wheel = builder.build(manifest)
    mirror = tmp_path / "release mirror"
    assets = mirror / "download" / ("v" + VERSION)
    assets.mkdir(parents=True)
    published = assets / wheel.name
    shutil.copyfile(wheel, published)
    builder.checksum(published)
    monkeypatch.setenv("CUEMOL_RELEASE_BASE_URL", mirror.as_uri())
    return published


def test_uv_git_install_bundles_release_gui(checkout, release, tmp_path):
    venv = tmp_path / "installed"
    subprocess.run(["uv", "venv", "--python", sys.executable, str(venv)], check=True, capture_output=True)
    python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    result = subprocess.run(
        ["uv", "pip", "install", "--python", str(python), "--no-cache", "--no-deps",
         "git+" + checkout.as_uri() + "@v" + VERSION], capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    env = {**os.environ, "CUEMOL_CACHE_DIR": str(tmp_path / "offline cache")}
    code = (
        "import json; from pathlib import Path; import cuemol_launcher as c; "
        "p=Path(c.__file__).parent; m=json.loads((p/'runtime.json').read_text()); "
        "r=c.unpack_runtime(p,m); print(m['version']); print((r/m['executable']).read_text())"
    )
    output = subprocess.check_output([str(python), "-c", code], env=env, text=True)
    assert output.splitlines() == [VERSION, "GUI runtime fixture"]


def test_checkout_must_match_clean_version_tag(checkout):
    hook.check_release_checkout(checkout, VERSION)
    (checkout / "src/_version.h").write_text("modified")
    with pytest.raises(RuntimeError, match="clean published tag"):
        hook.check_release_checkout(checkout, VERSION)
    git(checkout, "add", ".")
    git(checkout, "commit", "--no-gpg-sign", "-m", "Unreleased change")
    with pytest.raises(RuntimeError, match="clean published tag"):
        hook.check_release_checkout(checkout, VERSION)


def test_git_install_rejects_corrupted_release(release, tmp_path):
    release.write_bytes(b"corrupted release")
    destination = tmp_path / "payload"
    destination.mkdir()
    with pytest.raises(RuntimeError, match="SHA-256 mismatch"):
        hook.fetch_release_payload(VERSION, hook.release_platform(), destination)
    assert not (destination / "runtime.tar.gz").exists()
