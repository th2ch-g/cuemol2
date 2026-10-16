# Command distribution checks

Run the archive, installer, and wheel regression tests from the repository root:

```sh
uv run --no-project --python 3.12 --with pytest --with 'hatchling>=1.27,<2' \
  python -m pytest tritium/packaging/tests -q
```

The VCS test installs a temporary tagged Git repository through `uv pip`, using
a local release mirror, and verifies offline access to the bundled GUI. It also
checks rejection of modified/unreleased checkouts and corrupted downloads.

`package.sh` also installs each freshly built wheel into a temporary environment
with `--no-index --no-deps`, then runs the bundled executable's `--version` and
`skill` commands. This catches missing runtime libraries, executable permissions,
or version mismatches on the build host without requiring a display.

For an existing artifact:

```sh
uv run --no-project --python 3.12 python tritium/packaging/smoke-wheel.py path/to/cuemol.whl
```

These checks do not replace a GUI load/render check on each release platform.
The Linux build additionally runs `cli/scripts/smoke-headless.mjs` with display
variables removed to exercise automatic Xvfb startup, console, MCP, molecule
loading, and view capture.
