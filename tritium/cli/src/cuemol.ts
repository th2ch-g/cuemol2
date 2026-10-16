#!/usr/bin/env node
/**
 * @file cuemol.ts
 * @description The public command: GUI, console, MCP and agent instructions.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { main as consoleMain } from './console'
import { ensureApp, launchApp, readInfo } from './connection'
import { serveMcp } from './mcp'
import { selfUpgrade } from './upgrade'
import skill from '../skills/cuemol/SKILL.md'

declare const __CUEMOL_VERSION__: string

const USAGE = `Usage: cuemol [FILES...]
       cuemol gui [FILES...]
       cuemol console [--headless] [--dialect native|pymol] [-c COMMANDS | SCRIPT]
       cuemol mcp [--headless] [--no-launch]
       cuemol skill [--install DIRECTORY]
       cuemol self-upgrade

Running without a subcommand opens the GUI. Use -- before a filename matching a subcommand.
console starts the app if needed; -c is also accepted directly after cuemol.
mcp serves MCP over stdio and starts the GUI with MCP access for this session.
--headless runs console/MCP in a separate session without visible windows.
Headless Linux without a display requires xvfb-run and xauth.
skill prints the agent instructions as Markdown, without starting the GUI.
self-upgrade updates the installation from GitHub Releases.
--help shows this help; --version prints the bundled CueMol version.
`

/** Run one public command. GUI arguments are paths, never shell commands. */
async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args
  if (command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE)
    return 0
  }
  if (command === '--version') {
    process.stdout.write(`${__CUEMOL_VERSION__}\n`)
    return 0
  }
  if (command === 'console') return consoleMain(rest)
  if (command === 'self-upgrade') {
    if (rest.length) throw new Error('Usage: cuemol self-upgrade')
    return selfUpgrade(__CUEMOL_VERSION__)
  }
  if (command === '-c' || command === '--command' || command === '--dialect' || command === '--headless') return consoleMain(args)
  if (command === 'skill') {
    if (rest.length === 0) process.stdout.write(skill)
    else if (rest.length === 2 && rest[0] === '--install') {
      const destination = path.join(path.resolve(rest[1]), 'cuemol', 'SKILL.md')
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      // Do not replace instructions the user has customized.
      if (fs.existsSync(destination) && fs.readFileSync(destination, 'utf8') === skill) return 0
      fs.writeFileSync(destination, skill, { flag: 'wx' })
      process.stdout.write(`Installed ${destination}\n`)
    } else throw new Error('Usage: cuemol skill [--install DIRECTORY]')
    return 0
  }
  if (command === 'mcp') {
    if (rest.some((arg) => arg !== '--no-launch' && arg !== '--headless')) throw new Error('Usage: cuemol mcp [--headless] [--no-launch]')
    if (rest.includes('--headless')) process.env.CUEMOL_HEADLESS = '1'
    if (!rest.includes('--no-launch')) await ensureApp({ endpoint: 'mcp' })
    const info = readInfo(undefined, 'mcp')
    if (info instanceof Error) throw info
    await serveMcp(info, __CUEMOL_VERSION__)
    return 0
  }
  const files = command === 'gui' || command === '--' ? rest : args
  if (command !== '--' && files.some((arg) => arg.startsWith('-'))) throw new Error(USAGE)
  const paths = files.map((file) => path.resolve(file))
  for (const file of paths) {
    if (!fs.statSync(file).isFile()) throw new Error(`Not a file: ${file}`)
  }
  await launchApp(paths)
  return 0
}

void main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code },
  (error: unknown) => {
    process.stderr.write(`cuemol: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  },
)
