---
name: cuemol
description: Load, inspect, style, and render molecular structures in CueMol using its CLI or MCP server. Use for CueMol scenes, molecular visualization, and CueMol automation.
---

# CueMol

Use the installed `cuemol` command. The distribution includes the GUI and its
runtime; Node.js and a separately installed CueMol application are not needed.
`cuemol self-upgrade` updates the installation from GitHub Releases when the
user asks to update CueMol. Restart an existing GUI to use the new version.

## Choose an interface

- `cuemol` opens the GUI; `cuemol structure.cif` opens a file.
- `cuemol console` starts an interactive console and opens the GUI if needed.
- `cuemol console -c 'help'` lists command subjects. Read `help syntax` and
  `help <command>` before composing unfamiliar commands. Redirected help is
  Markdown. Relative file paths are resolved against the CLI working directory.
- `cuemol console --dialect pymol -c 'fetch 1crn; show cartoon'` uses the
  supported PyMOL dialect. Consult its `help`; it is not the complete PyMOL API.
- `cuemol mcp` runs an MCP stdio server. Configure the client with command
  `cuemol` and arguments `["mcp"]`. It starts the GUI and enables MCP access for
  that app session, without changing saved plugin preferences.
  Use `--no-launch` to require an already running MCP-enabled app.
- Add `--headless` to `console` or `mcp` to use a separate background session
  without GUI windows. Linux without a display requires `xvfb-run` and `xauth`.
  Supply explicit file paths. After saving requested outputs, stop the session
  with `cuemol console --headless --no-launch -c 'quit --force'`; this discards
  any remaining unsaved scene changes.

Configuration and persistent console history live under `~/.config/cuemol/`
(`CUEMOL_CONFIG_DIR` overrides it). `cuemolrc` runs once when an app session
starts, before CLI/MCP requests. It starts in native mode; standalone `pymol`
and `native` lines switch syntax. Relative startup paths use the configuration
directory. Inspect user startup commands when diagnosing unexpected initial
state, and use an isolated configuration for disposable tests.

## Work with a scene

For MCP, list the tools and use their current schemas and descriptions. Inspect
the scene before changing existing objects; node names and IDs are scene-local.
Use file paths accessible on the machine running CueMol. For unattended CLI
loads, use the console's `load` command; opening a file through the GUI may show
its options dialog.

New molecular files use a cartoon for protein, a ribbon for nucleic acid, and
ball-and-stick for other atoms, including ligands, ions, and water. An explicit
renderer or a saved GUI choice takes precedence. Loading a saved scene preserves
its renderer setup.

Use the render and capture tools to check the resulting image. A successful
command or load is not evidence that the intended representation is visible.
Save the scene when the requested output includes an editable visualization.

`cuemol skill` prints this document. `cuemol skill --install DIRECTORY` writes
`DIRECTORY/cuemol/SKILL.md` for an agent's skill discovery directory and refuses
to overwrite customized instructions.
