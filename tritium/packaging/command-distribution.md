# Command distributions

Releases built with the command packaging workflow provide a full GUI bundle
in command archives. Older releases without
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

`afterPack` records the actual app output layout in `release/command-build.json`.
`package-command.py` archives the finished app after signing and writes a
checksum. No runtime binary is stored in the source package. The release jobs
attach these artifacts to GitHub Releases.
