"""Launch the bundled CueMol application without downloading a runtime."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import re
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import urlopen


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def cache_directory():
    override = os.environ.get("CUEMOL_CACHE_DIR")
    if override:
        return Path(override).expanduser()
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Caches"
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return base / "cuemol"


def unpack_runtime(package, metadata):
    """Atomically unpack the checked archive, preserving framework symlinks."""
    checksum = metadata["sha256"]
    cache = cache_directory()
    destination = cache / (metadata["version"] + "-" + checksum[:16])
    marker = destination / ".complete"
    if marker.is_file() and marker.read_text() == checksum:
        return destination
    archive = package / "runtime.tar.gz"
    if digest(archive) != checksum:
        raise RuntimeError("The bundled CueMol archive failed its SHA-256 check. Reinstall the wheel.")
    cache.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".unpack-", dir=cache))
    try:
        with tarfile.open(archive, "r:gz") as bundle:
            bundle.extractall(staging, filter="data")
        for key in ("executable", "cli"):
            if not (staging / metadata[key]).is_file():
                raise RuntimeError("The CueMol archive is missing " + key)
        (staging / ".complete").write_text(checksum)
        try:
            staging.rename(destination)
        except OSError:
            # Another process may have completed the same immutable cache entry.
            if not marker.is_file() or marker.read_text() != checksum:
                raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return destination


def self_upgrade(metadata):
    """Install a verified release wheel into the interpreter running this command."""
    with urlopen("https://api.github.com/repos/CueMol/cuemol2/releases/latest", timeout=30) as response:
        release = json.load(response)
    version = release["tag_name"].removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", version):
        raise RuntimeError("The release has an invalid CueMol version.")
    if tuple(map(int, version.split('.'))) <= tuple(map(int, metadata["version"].split('.'))):
        print("CueMol " + metadata["version"] + " is already up to date.")
        return 0
    filename = "cuemol-" + version + "-py3-none-" + metadata["platform_tag"] + ".whl"
    assets = {asset["name"]: asset["browser_download_url"] for asset in release["assets"]}
    if filename not in assets or filename + ".sha256" not in assets:
        raise RuntimeError("The latest release has no complete wheel for this platform.")
    with tempfile.TemporaryDirectory(prefix="cuemol-upgrade-") as directory:
        wheel = Path(directory) / filename
        with urlopen(assets[filename], timeout=120) as source, wheel.open("wb") as target:
            shutil.copyfileobj(source, target)
        with urlopen(assets[filename + ".sha256"], timeout=30) as response:
            expected = response.read().decode("ascii").split()[0]
        if digest(wheel) != expected:
            raise RuntimeError("The downloaded wheel failed its SHA-256 check.")
        if importlib.util.find_spec("pip") is not None:
            command = [sys.executable, "-m", "pip", "install", "--upgrade", str(wheel)]
        elif uv := shutil.which("uv"):
            command = [uv, "pip", "install", "--python", sys.executable, "--upgrade", str(wheel)]
        else:
            raise RuntimeError("This Python environment needs pip or uv to update CueMol.")
        status = subprocess.call(command)
        if status == 0:
            print("Installed CueMol " + version + ". Restart any running CueMol app to use it.")
        return status


def main():
    package = Path(__file__).resolve().parent
    try:
        metadata = json.loads((package / "runtime.json").read_text())
        if sys.argv[1:] == ["self-upgrade"]:
            return self_upgrade(metadata)
        runtime = unpack_runtime(package, metadata)
        command = [str(runtime / metadata["executable"]), str(runtime / metadata["cli"]), *sys.argv[1:]]
        env = {**os.environ, "ELECTRON_RUN_AS_NODE": "1", "CUEMOL_MANAGED_INSTALL": "1"}
        if os.name == "nt":
            return subprocess.call(command, env=env)
        os.execve(command[0], command, env)
    except (OSError, ValueError, tarfile.TarError, RuntimeError) as error:
        print("cuemol: " + str(error), file=sys.stderr)
        return 1
