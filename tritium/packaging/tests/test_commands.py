"""Check offline wheel packaging, installation integrity, and update isolation."""

import importlib.util
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tarfile
import zipfile

import pytest


ROOT = Path(__file__).resolve().parents[3]
PACKAGING = ROOT / "tritium" / "packaging"
sys.path.insert(0, str(PACKAGING / "python"))
import cuemol_launcher as launcher

spec = importlib.util.spec_from_file_location("package_command", PACKAGING / "package-command.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


@pytest.fixture
def bundle(tmp_path):
    app = tmp_path / "app"
    cli = app / "resources" / "cli" / "cuemol.mjs"
    cli.parent.mkdir(parents=True)
    cli.write_text("fixture")
    executable = app / "cuemol3"
    executable.write_text('#!/bin/sh\nprintf "%s\\n" "fixture GUI runtime"\n')
    executable.chmod(0o755)
    manifest = tmp_path / "command-build.json"
    manifest.write_text(json.dumps({
        "platform": "linux", "arch": "x64", "version": "2.4.0.546",
        "appDir": "app", "product": "CueMol3", "executable": "cuemol3",
    }))
    return builder.build(manifest)


def test_wheel_contains_gui_and_platform_metadata(bundle, tmp_path, monkeypatch):
    archive, wheel = bundle
    assert wheel.name == "cuemol-2.4.0.546-py3-none-linux_x86_64.whl"
    with zipfile.ZipFile(wheel) as packaged:
        assert "cuemol_launcher/runtime.tar.gz" in packaged.namelist()
        assert any(name.endswith("/licenses/LICENSE") for name in packaged.namelist())
        wheel_info = packaged.read("cuemol-2.4.0.546.dist-info/WHEEL").decode()
        assert "Root-Is-Purelib: false" in wheel_info
        packaged.extractall(tmp_path / "installed")
    package = tmp_path / "installed" / "cuemol_launcher"
    metadata = json.loads((package / "runtime.json").read_text())
    monkeypatch.setenv("CUEMOL_CACHE_DIR", str(tmp_path / "cache with spaces"))
    runtime = launcher.unpack_runtime(package, metadata)
    assert (runtime / metadata["executable"]).read_text().startswith("#!/bin/sh")
    assert (runtime / metadata["cli"]).read_text() == "fixture"
    assert launcher.unpack_runtime(package, metadata) == runtime
    assert launcher.digest(archive) == metadata["sha256"]


def test_unpack_rejects_corruption_and_preserves_symlinks(tmp_path, monkeypatch):
    monkeypatch.setenv("CUEMOL_CACHE_DIR", str(tmp_path / "cache"))
    executable = tmp_path / "app"
    executable.write_text("executable")
    executable.chmod(0o755)
    with tarfile.open(tmp_path / "runtime.tar.gz", "w:gz") as archive:
        archive.add(executable, arcname="runtime/app")
        if os.name != "nt":
            link = tarfile.TarInfo("runtime/current")
            link.type = tarfile.SYMTYPE
            link.linkname = "app"
            archive.addfile(link)
    metadata = {"version": "1.0.0.1", "executable": "runtime/app", "cli": "runtime/app", "sha256": "bad"}
    with pytest.raises(RuntimeError, match="SHA-256"):
        launcher.unpack_runtime(tmp_path, metadata)
    metadata["sha256"] = launcher.digest(tmp_path / "runtime.tar.gz")
    runtime = launcher.unpack_runtime(tmp_path, metadata)
    if os.name != "nt":
        assert (runtime / "runtime/current").is_symlink()
        assert os.access(runtime / "runtime/app", os.X_OK)


@pytest.mark.skipif(os.name == "nt", reason="POSIX installer")
def test_installer_handles_spaces_and_keeps_previous_install_on_hash_failure(bundle, tmp_path):
    label = {("Darwin", "arm64"): "macOS-arm64", ("Linux", "x86_64"): "Linux-x64"}.get((platform.system(), platform.machine()))
    if not label:
        pytest.skip("Unsupported installer platform")
    archive, _ = bundle
    release = tmp_path / "mirror" / "download" / "v2.4.0.546"
    release.mkdir(parents=True)
    asset = release / f"CueMol3-2.4.0.546-{label}-Command.tar.gz"
    asset.write_bytes(archive.read_bytes())
    builder.checksum(asset)
    bindir = tmp_path / "bin with spaces"
    env = {**os.environ, "CUEMOL_VERSION": "2.4.0.546", "CUEMOL_INSTALL_DIR": str(bindir),
           "CUEMOL_DATA_DIR": str(tmp_path / "data with spaces"),
           "CUEMOL_RELEASE_BASE_URL": (tmp_path / "mirror").as_uri()}
    subprocess.run(["sh", str(ROOT / "install.sh")], env=env, check=True, capture_output=True)
    command = bindir / "cuemol"
    original = command.resolve()
    assert subprocess.check_output([str(command), "--version"], text=True).strip() == "fixture GUI runtime"
    asset.write_bytes(b"corrupt download")
    result = subprocess.run(["sh", str(ROOT / "install.sh")], env=env, capture_output=True, text=True)
    assert result.returncode != 0
    assert "SHA-256 mismatch" in result.stderr
    assert command.resolve() == original


@pytest.mark.parametrize("corrupt", [False, True])
@pytest.mark.parametrize("backend", ["pip", "uv"])
def test_upgrade_verifies_wheel_and_uses_current_interpreter(monkeypatch, corrupt, backend):
    metadata = {"version": "1.0.0.1", "platform_tag": "linux_x86_64"}
    filename = "cuemol-2.4.0.546-py3-none-linux_x86_64.whl"
    wheel_bytes = b"wheel fixture"
    release = {"tag_name": "v2.4.0.546", "assets": [
        {"name": name, "browser_download_url": "https://example.invalid/" + name}
        for name in (filename, filename + ".sha256")
    ]}
    expected = "invalid" if corrupt else launcher.hashlib.sha256(wheel_bytes).hexdigest()
    def fetch(url, **kwargs):
        if url.endswith("/latest"):
            return io.BytesIO(json.dumps(release).encode())
        return io.BytesIO(expected.encode() if url.endswith(".sha256") else wheel_bytes)
    calls = []
    monkeypatch.setattr(launcher, "urlopen", fetch)
    monkeypatch.setattr(launcher.importlib.util, "find_spec", lambda name: object() if backend == "pip" else None)
    monkeypatch.setattr(launcher.shutil, "which", lambda name: "uv-command")
    monkeypatch.setattr(launcher.subprocess, "call", lambda args: calls.append(args) or 0)
    if corrupt:
        with pytest.raises(RuntimeError, match="SHA-256"):
            launcher.self_upgrade(metadata)
        assert not calls
    else:
        assert launcher.self_upgrade(metadata) == 0
        expected_command = [sys.executable, "-m", "pip", "install", "--upgrade"] if backend == "pip" else [
            "uv-command", "pip", "install", "--python", sys.executable, "--upgrade",
        ]
        assert calls[0][:-1] == expected_command


def test_upgrade_does_not_downgrade(monkeypatch):
    monkeypatch.setattr(launcher, "urlopen", lambda *a, **kw: io.BytesIO(b'{"tag_name":"v1.0.0.1"}'))
    assert launcher.self_upgrade({"version": "2.0.0.1"}) == 0
