"""Build a command archive and a self-contained wheel from an electron-builder app."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile


PLATFORMS = {
    ("darwin", "arm64"): ("macOS-arm64", "macosx_15_0_arm64"),
    ("linux", "x64"): ("Linux-x64", "linux_x86_64"),
    ("win32", "x64"): ("Windows-x64", "win_amd64"),
}


def checksum(path):
    with path.open("rb") as source:
        value = hashlib.file_digest(source, "sha256").hexdigest()
    path.with_name(path.name + ".sha256").write_text(value + "  " + path.name + "\n")
    return value


def build(manifest_path):
    manifest = json.loads(manifest_path.read_text())
    platform, arch = manifest["platform"], manifest["arch"]
    label, wheel_platform = PLATFORMS[(platform, arch)]
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", version):
        raise ValueError("Expected a four-component CueMol version")
    output = manifest_path.parent
    app_dir = (output / manifest["appDir"]).resolve()
    product = manifest["product"]
    if platform == "darwin":
        source = app_dir / (product + ".app")
        runtime_dir = "runtime/" + source.name
        executable = runtime_dir + "/Contents/MacOS/" + product
        cli = runtime_dir + "/Contents/Resources/cli/cuemol.mjs"
    else:
        source = app_dir
        runtime_dir = "runtime"
        executable = runtime_dir + "/" + manifest["executable"]
        cli = runtime_dir + "/resources/cli/cuemol.mjs"
    for entry in (executable, cli):
        if not (source / Path(entry).relative_to(runtime_dir)).is_file():
            raise ValueError("Packaged application is missing " + entry)

    archive = output / ("CueMol3-" + version + "-" + label + "-Command.tar.gz")
    with tempfile.TemporaryDirectory(prefix="cuemol-package-") as directory:
        staging = Path(directory)
        bin_dir = staging / "bin"
        bin_dir.mkdir()
        launcher = bin_dir / "cuemol"
        launcher.write_text(
            '#!/bin/sh\nset -eu\nself=$0\n'
            'while [ -L "$self" ]; do\n'
            '  link=$(readlink "$self")\n'
            '  case $link in /*) self=$link ;; *) self=$(dirname "$self")/$link ;; esac\n'
            'done\n'
            'root=$(cd "$(dirname "$self")/.." && pwd)\n'
            'export CUEMOL_MANAGED_INSTALL=1\n'
            'export CUEMOL_INSTALL_ROOT="$root"\n'
            'ELECTRON_RUN_AS_NODE=1 exec "$root/' + executable + '" "$root/' + cli + '" "$@"\n'
        )
        launcher.chmod(0o755)
        license_file = Path(__file__).resolve().parents[2] / "LICENSE"
        with tarfile.open(archive, "w:gz", dereference=False) as bundle:
            bundle.add(source, arcname=runtime_dir)
            bundle.add(bin_dir, arcname="bin")
            bundle.add(license_file, arcname="LICENSE")
        metadata = {
            "version": version, "platform_tag": wheel_platform,
            "executable": executable, "cli": cli, "sha256": checksum(archive),
        }
        project = staging / "python"
        shutil.copytree(Path(__file__).parent / "python", project, ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copyfile(license_file, project / "LICENSE")
        package = project / "cuemol_launcher"
        shutil.copyfile(archive, package / "runtime.tar.gz")
        (package / "runtime.json").write_text(json.dumps(metadata, indent=2) + "\n")
        subprocess.run([sys.executable, "-m", "hatchling", "build", "-t", "wheel"], cwd=project, check=True)
        wheels = list((project / "dist").glob("*.whl"))
        if len(wheels) != 1:
            raise RuntimeError("Expected exactly one wheel")
        wheel = output / wheels[0].name
        shutil.copyfile(wheels[0], wheel)
        checksum(wheel)
    return archive, wheel


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="command-build.json written by afterPack")
    for artifact in build(parser.parse_args().manifest.resolve()):
        print(artifact.name)
