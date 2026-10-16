# CueMol command

The packaged `cuemol` command uses the application's own Electron runtime.
It does not require a separate Node.js installation. `tritium_cli` remains
available as a compatibility entry point for the console.

```sh
cuemol                              # Open the GUI
cuemol structure.cif                # Open a file through the GUI
cuemol gui structure.pdb
cuemol console                     # Interactive console
cuemol -c 'help'                    # Run one native console command
cuemol console --dialect pymol -c 'fetch 1crn'
cuemol mcp                         # MCP over stdio
cuemol console --headless -c 'help' # Console without a GUI window
cuemol mcp --headless              # MCP without a GUI window
cuemol skill                       # Agent instructions as Markdown
cuemol skill --install ~/.agents/skills
cuemol self-upgrade                 # Update a managed installation
```

Use `cuemol -- FILE` for a file whose name matches a subcommand. GUI file
opening can show an options dialog. For unattended loading, use the console
or MCP. `cuemol console --help` documents scripts and console options.

## Configuration, history, and startup commands

CueMol creates `~/.config/cuemol/` for user configuration on every platform.
`XDG_CONFIG_HOME` changes its parent directory; `CUEMOL_CONFIG_DIR` overrides
the complete path. The directory contains:

- `cuemolrc`: optional commands run when a new app session starts.
- `console-history`: terminal command history, recalled with Up/Down across sessions.
- `gui/` and `headless/`: preferences, user styles, actions, GUI console history,
  and other Electron profile files for each session type.
- `local-api.json` and `local-api-headless.json`: active connection information.

On the first default-path launch, existing GUI preferences and console history
are copied from the previous locations without deleting the originals or
overwriting current settings. An explicit `CUEMOL_CONFIG_DIR` starts an isolated
configuration and does not import the old profile.

For example, create `~/.config/cuemol/cuemolrc` with:

```text
# Start in the native CueMol dialect; switch using a standalone mode name.
pymol
bg_color white
native
```

The file starts in native mode. Standalone `pymol` and `native` lines switch
the syntax for subsequent commands. Relative paths start at the configuration
directory; `cd` carries across mode switches. Startup commands run after the
initial scene exists, before shell-opened files and CLI/MCP requests, including
in headless sessions. Reconnecting to an existing session does not run them
again. An error stops the rest of the file, appears in the GUI console and CLI
diagnostics, and leaves CueMol available. Python code is not supported.

## MCP

Configure an MCP client with:

```json
{
  "mcpServers": {
    "cuemol": { "command": "cuemol", "args": ["mcp"] }
  }
}
```

`cuemol mcp` starts the GUI if needed and requests MCP access for the current
app session. A running app receives the request through its single-instance
handler. Saved plugin preferences are unchanged. `cuemol mcp --no-launch`
requires an already running app with MCP access enabled.

The stdio bridge forwards the app's tool schemas and tool results through its
authenticated loopback HTTP endpoint. Only protocol messages go to stdout;
startup diagnostics go to stderr. Closing stdin or sending SIGINT/SIGTERM
closes the bridge and leaves the GUI running. `CUEMOL_LOCAL_API_INFO` overrides
the connection-info file for an isolated app instance.
Set `CUEMOL_LAUNCH_LOG` to a file path to capture a launched app's stdout and
stderr when diagnosing startup or worker failures.

## Without GUI windows

Add `--headless` to `console` or `mcp`. The same molecular engine runs in a
hidden window, including view capture and rendering. This session has its own
settings directory, connection-info file, and automatically allocated local
port, so it can run alongside the normal GUI. Repeated headless commands share
that background session. `CUEMOL_HEADLESS_DATA_DIR` overrides its settings
directory; `CUEMOL_LOCAL_API_INFO` still overrides its connection-info file.

On Linux without `DISPLAY` or `WAYLAND_DISPLAY`, the command starts `xvfb-run`
automatically and uses Electron's bundled SwiftShader CPU renderer. Install
Xvfb, xauth, and Electron's system libraries first; on
Ubuntu, the virtual-display packages are `xvfb` and `xauth`. A physical display
or desktop login is unnecessary, and rendering does not require a GPU. This follows Electron's
[headless runtime requirements](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci).
macOS and Windows use their existing desktop session without showing a window.

Supply file paths explicitly: native file dialogs are unavailable in headless
mode. Save outputs before ending the session. Closing an MCP connection or
exiting the console leaves the session running; stop it explicitly with:

```sh
cuemol console --headless --no-launch -c 'quit --force'
```

`quit --force` discards unsaved scene changes. Plain `quit` fails in headless
mode because it cannot display the save-confirmation dialog.

## Agent instructions

`cuemol skill` prints the bundled [SKILL.md](skills/cuemol/SKILL.md).
`--install DIRECTORY` creates `DIRECTORY/cuemol/SKILL.md`. Reinstalling identical
content succeeds; customized content is never overwritten.

## Updating

`cuemol self-upgrade` checks the latest GitHub release, updates only to a newer
four-component CueMol version, and verifies the downloaded artifact's SHA-256.
For a command-archive installation it reuses the existing install directories.
For a wheel it installs the matching wheel into the command's Python environment
using that environment's pip, or `uv pip --python` when pip is absent.

Running applications retain their current version until restarted. The GUI's
bundle-replacement updater is disabled for these managed installations. A
command inside a conventional desktop installer does not manage that install;
use the desktop distribution's update mechanism instead.

## Development

From `tritium`, run `pnpm --filter @cuemol/tritium-cli build` and
`pnpm --filter @cuemol/tritium-cli test`. Set `TRITIUM_CLI_DEV_APP` to the built
`react-gui` directory when running a CLI bundle with Node during development.
