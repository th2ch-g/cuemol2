# CueMol desktop distribution

This wheel includes the CueMol GUI, Electron, native libraries, data, and the
`cuemol` command. It is separate from the `cuemol2` Python API distribution.
Python 3.12 or later is required. No Node.js installation is needed.

Install the wheel for your OS from the CueMol GitHub release with
`pip install <wheel-file-or-URL>`. Run `cuemol --help` for the command interface,
`cuemol skill` for agent instructions, or `cuemol self-upgrade` to update this
Python environment to the latest released wheel.

For a published tag containing this packaging configuration and desktop wheels,
`uv pip install "git+https://github.com/CueMol/cuemol2.git@vX.Y.Z.BUILD"` downloads
and verifies that release's GUI during installation. Replace the version
placeholder with the intended tag. Development commits require a source build.

The complete application archive is inside the wheel. On first use it is
unpacked locally, without a download, into a versioned cache. This preserves
macOS framework symlinks and executable permissions, which wheel installers do
not preserve as an application bundle. `CUEMOL_CACHE_DIR` overrides the cache
directory. Old cache entries can be removed after the corresponding app exits.

Use `cuemol console --headless` or `cuemol mcp --headless` without GUI windows.
On Linux without a desktop, install Xvfb and xauth first. Linux wheels target the same
Ubuntu 22.04 build as the desktop distribution; they are tagged `linux_x86_64`,
not advertised as manylinux. macOS wheels require macOS 15 or later on arm64.
Windows wheels target x64. GitHub Releases is the distribution source; installing
by name from PyPI requires a separate maintainer publication.
