"""Bundle a local runtime or the complete GUI from the checked-out release tag."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.error import HTTPError
from urllib.request import urlopen
import zipfile

from hatchling.builders.hooks.plugin.interface import BuildHookInterface
from packaging.tags import sys_tags


RELEASE_BASE = "https://github.com/CueMol/cuemol2/releases"
SUPPORTED_PLATFORMS = {"macosx_15_0_arm64", "linux_x86_64", "win_amd64"}


def release_platform():
    for tag in sys_tags():
        if tag.platform in SUPPORTED_PLATFORMS:
            return tag.platform
    raise RuntimeError("No CueMol desktop release supports this platform.")


def check_release_checkout(root, version):
    tag = "v" + version
    try:
        def revision(ref):
            return subprocess.check_output(
                ["git", "rev-parse", "--verify", ref], cwd=root, stderr=subprocess.DEVNULL, text=True,
            ).strip()
        matches = revision("HEAD") == revision("refs/tags/" + tag + "^{commit}")
        clean = subprocess.run(["git", "diff", "--quiet", "HEAD"], cwd=root, check=False).returncode == 0
    except (OSError, subprocess.CalledProcessError):
        matches = clean = False
    if not matches or not clean:
        raise RuntimeError(
            f"Git installation requires the clean published tag {tag}. "
            "Development commits must be built with tritium/packaging/package.sh."
        )


def fetch_release_payload(version, platform_tag, destination):
    name = f"cuemol-{version}-py3-none-{platform_tag}.whl"
    base = os.environ.get("CUEMOL_RELEASE_BASE_URL", RELEASE_BASE).rstrip("/")
    url = f"{base}/download/v{version}/{name}"
    wheel = destination / name
    try:
        with urlopen(url + ".sha256", timeout=30) as response:
            expected = response.read(4096).decode("ascii").split()[0]
        if not re.fullmatch(r"[0-9a-fA-F]{64}", expected):
            raise RuntimeError("Invalid release wheel SHA-256 sidecar.")
        with urlopen(url, timeout=30) as response, wheel.open("wb") as output:
            shutil.copyfileobj(response, output)
    except HTTPError as error:
        if error.code == 404:
            raise RuntimeError(f"Release v{version} has no desktop wheel for {platform_tag}.") from error
        raise
    with wheel.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != expected.lower():
        raise RuntimeError("Release wheel SHA-256 mismatch.")
    with zipfile.ZipFile(wheel) as bundle:
        metadata = json.loads(bundle.read("cuemol_launcher/runtime.json"))
        if metadata["version"] != version or metadata["platform_tag"] != platform_tag:
            raise RuntimeError("Release wheel does not match the requested version and platform.")
        for name in ("runtime.tar.gz", "runtime.json"):
            with bundle.open("cuemol_launcher/" + name) as source, (destination / name).open("wb") as output:
                shutil.copyfileobj(source, output)
    with (destination / "runtime.tar.gz").open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != metadata["sha256"]:
            raise RuntimeError("Bundled runtime SHA-256 mismatch.")
    return metadata


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        package = Path(self.root) / "cuemol_launcher"
        if (package / "runtime.tar.gz").is_file():
            metadata = json.loads((package / "runtime.json").read_text())
        else:
            if self.target_name != "wheel":
                raise RuntimeError("Install a published Git tag or build a platform wheel.")
            root = Path(self.root)
            version = re.search(r'QM_VERSION "([^"]+)"', (root / "src/_version.h").read_text())[1]
            check_release_checkout(root, version)
            self._temporary = tempfile.TemporaryDirectory(prefix="cuemol-release-")
            try:
                package = Path(self._temporary.name)
                metadata = fetch_release_payload(version, release_platform(), package)
                for name in ("runtime.tar.gz", "runtime.json"):
                    build_data["force_include"][str(package / name)] = "cuemol_launcher/" + name
            except Exception:
                self._temporary.cleanup()
                raise
        build_data["pure_python"] = False
        build_data["tag"] = "py3-none-" + metadata["platform_tag"]

    def finalize(self, version, build_data, artifact_path):
        if hasattr(self, "_temporary"):
            self._temporary.cleanup()
