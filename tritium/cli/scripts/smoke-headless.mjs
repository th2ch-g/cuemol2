/** Exercise console, MCP, molecule loading, and view capture without GUI windows. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const [command, ...prefix] = process.argv.slice(2)
if (!command) throw new Error('Usage: smoke-headless.mjs COMMAND [PREFIX_ARGS...]')
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cuemol-headless-'))
const env = {
  ...process.env,
  CUEMOL_CONFIG_DIR: directory,
  CUEMOL_HEADLESS_DATA_DIR: path.join(directory, 'profile'),
  CUEMOL_LOCAL_API_INFO: path.join(directory, 'local-api.json'),
}
// Test the automatic virtual display path, even on a desktop Linux runner.
if (process.platform === 'linux') {
  delete env.DISPLAY
  delete env.WAYLAND_DISPLAY
}
const run = promisify(execFile)
const client = new Client({ name: 'cuemol-headless-smoke', version: '1' })
let completed = false
try {
  await fs.writeFile(path.join(directory, 'cuemolrc'), 'create_scene name="Startup smoke"\npymol\nbg_color white\nnative\n')
  const { stdout } = await run(command, [...prefix, 'console', '--headless', '-c', 'help'], { env, timeout: 120_000 })
  assert.match(stdout, /help/i)
  const scenes = await run(command, [...prefix, 'console', '--headless', '-c', 'list_scenes'], { env, timeout: 30_000 })
  assert.match(scenes.stdout, /Startup smoke/)
  assert.equal((scenes.stdout.match(/Startup smoke/g) || []).length, 1)
  const transport = new StdioClientTransport({ command, args: [...prefix, 'mcp', '--headless'], env, stderr: 'inherit' })
  await client.connect(transport, { timeout: 120_000 })
  assert.ok((await client.listTools()).tools.some(tool => tool.name === 'load_file'))
  const file = path.join(directory, 'ligand.pdb')
  await fs.writeFile(file,
    'HETATM    1  C1  LIG A   1       0.000   0.000   0.000  1.00 20.00           C\n' +
    'HETATM    2  O1  LIG A   1       1.200   0.000   0.000  1.00 20.00           O\nEND\n')
  const loaded = await client.callTool({ name: 'load_file', arguments: {
    path: file, rendererType: null, selection: null, name: 'Headless smoke ligand',
    rendererName: null, preset: null, centerView: true, mapCenterPolicy: null,
  } })
  assert.ok(!loaded.isError, JSON.stringify(loaded))
  const captured = await client.callTool({ name: 'capture_view', arguments: { longSide: 256 } })
  assert.ok(!captured.isError, JSON.stringify(captured))
  assert.ok(captured.content.some(item => item.type === 'image' && item.data.length > 100))
  completed = true
} finally {
  await client.close()
  try {
    await run(command, [...prefix, 'console', '--headless', '--no-launch', '-c', 'quit --force'], { env, timeout: 30_000 })
  } catch (error) {
    if (completed) throw error
    console.error('Could not stop the failed smoke-test session:', error.message)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}
if (completed) console.log('Headless console, MCP, molecule load, and capture passed.')
