"""Install a release wheel offline and run its bundled command on the build host."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile


def check(wheel):
    with zipfile.ZipFile(wheel) as package:
        version = json.loads(package.read("cuemol_launcher/runtime.json"))["version"]
    with tempfile.TemporaryDirectory(prefix="cuemol-smoke-") as directory:
        root = Path(directory)
        venv = root / "venv"
        subprocess.run(["uv", "venv", "--python", sys.executable, str(venv)], check=True)
        scripts = venv / ("Scripts" if os.name == "nt" else "bin")
        python = scripts / ("python.exe" if os.name == "nt" else "python")
        subprocess.run(["uv", "pip", "install", "--python", str(python), "--no-index", "--no-deps", str(wheel)], check=True)
        command = str(scripts / ("cuemol.exe" if os.name == "nt" else "cuemol"))
        env = {**os.environ, "CUEMOL_CACHE_DIR": str(root / "cache")}
        actual = subprocess.check_output([command, "--version"], env=env, text=True, timeout=180).strip()
        if actual != version:
            raise RuntimeError(f"Command version {actual!r} differs from wheel version {version!r}")
        skill = subprocess.check_output([command, "skill"], env=env, text=True, timeout=30)
        if not skill.startswith("---\n") or "name: cuemol" not in skill:
            raise RuntimeError("The bundled skill is missing")
    print(f"Offline wheel smoke test passed: {wheel.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wheel", type=Path)
    check(parser.parse_args().wheel.resolve())
