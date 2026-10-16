# Command distributions

Releases built with the command packaging workflow provide a full GUI bundle
in both command archives and platform-specific wheels. Older releases without
these assets cannot be installed through these commands.

## Install with curl

On macOS arm64 or Linux x64:

```sh
curl -LsSf https://raw.githubusercontent.com/CueMol/cuemol2/develop/install.sh | sh
```

The script resolves the latest GitHub release and verifies the archive against
its `.sha256` sidecar before installing. No administrator privileges, signing
identity, Node.js, or Python are needed. macOS bundles retain the existing
ad-hoc signature; no developer certificate or notarization service is required
to build them. Operating-system policies still apply.

The default command directory is `~/.local/bin`. Application versions live in
`${XDG_DATA_HOME:-~/.local/share}/cuemol`. Add the printed command directory to
`PATH` if needed. The installer does not edit shell startup files.

Download the script first to inspect it or choose installation options:

```sh
curl -LsSf https://raw.githubusercontent.com/CueMol/cuemol2/develop/install.sh -o install.sh
CUEMOL_INSTALL_DIR="$HOME/bin" CUEMOL_DATA_DIR="$HOME/.local/share/cuemol" sh install.sh
```

`CUEMOL_VERSION` pins a four-component release version, with or without `v`.
`CUEMOL_RELEASE_BASE_URL` selects a release mirror with the same URL layout.
An unrelated existing `cuemol` command is never replaced. Updates create a new
version directory and replace the command symlink only after verification.

## Install with pip

Python 3.12 or later is required. Download the wheel matching your platform
from [GitHub Releases](https://github.com/CueMol/cuemol2/releases), then install
that file in your Python environment:

```sh
python -m pip install ./cuemol-*.whl
cuemol --version
cuemol
```

Keep only the intended CueMol wheel in the directory when using this glob.
`pip install` also accepts the wheel's GitHub release download URL. The project
does not publish these desktop wheels to PyPI automatically; `pip install
cuemol` by name is not the release installation procedure.

You can also install directly from a published Git tag:

```sh
CUEMOL_TAG=vX.Y.Z.BUILD
uv pip install "git+https://github.com/CueMol/cuemol2.git@$CUEMOL_TAG"
```

Replace the placeholder with a release tag that provides desktop wheels and
contains this packaging configuration. The build verifies that the checkout
matches that version's tag, downloads its platform wheel, verifies SHA-256,
and includes the complete GUI in the installed wheel. No compiler is needed.
Git and network access are needed during installation; startup stays offline.
Unreleased commits, modified checkouts, unsupported platforms, and releases
without matching wheels are rejected rather than using another version's GUI.
`CUEMOL_RELEASE_BASE_URL` also selects a mirror for Git installations.

| Host | Wheel platform tag |
| --- | --- |
| macOS 15 or later, Apple Silicon | `macosx_15_0_arm64` |
| Linux x64, Ubuntu 22.04 build environment | `linux_x86_64` |
| Windows x64 | `win_amd64` |

Linux wheels are not manylinux wheels. The system GUI libraries required by
Electron are needed; `--headless` uses Xvfb when no desktop is available.
The wheel contains the GUI,
Electron, native libraries, data, and CLI; launching it never downloads a
runtime. This desktop distribution is separate from the `cuemol2` Python API.

The bundled archive is extracted into a versioned local cache on first use,
preserving executable permissions and macOS framework symlinks.
`CUEMOL_CACHE_DIR` overrides that location. Uninstall with `python -m pip
uninstall cuemol`; versioned cache entries can be removed after the associated
applications exit.

## Update and use

```sh
cuemol self-upgrade
cuemol --help
cuemol skill
```

Updates retain the installation method and location. Restart running CueMol
applications to use the new version. See the [command guide](../cli/README.md)
for MCP configuration and console usage.

## Build

Use the existing [`package.sh`](package.sh) flow after building the native
runtime, with `uv` and Python 3.12 or later available. Each supported release
target produces its conventional desktop installer plus:

- `CueMol3-VERSION-PLATFORM-Command.tar.gz` and its SHA-256 sidecar.
- `cuemol-VERSION-py3-none-PLATFORM.whl` and its SHA-256 sidecar.

`afterPack` records the actual app output layout in `release/command-build.json`.
`package-command.py` archives the finished app after signing, builds the wheel
from that same archive, and writes checksums. No runtime binary is stored in
the source package. The release jobs attach these artifacts to GitHub Releases.
The [packaging checks](tests/README.md) verify the installed wheel offline.
