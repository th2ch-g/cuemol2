import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { PassThrough } from 'node:stream'
import { commandHistory } from './history'
import { infoFilePath } from './connection'

const directories: string[] = []
function temporaryHome() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-history-'))
  directories.push(directory)
  return directory
}
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }) })

describe('persistent console history', () => {
  it('imports old commands and recalls a previous session with the Up key', () => {
    const home = temporaryHome()
    const legacy = path.join(home, '.tritium_cli_history')
    fs.writeFileSync(legacy, 'help\nlist_scenes\n')
    const first = commandHistory(home, {})
    expect(first.load()).toEqual(['list_scenes', 'help'])
    first.append('fetch 1crn')
    const second = commandHistory(home, {})
    const prompt = readline.createInterface({ input: new PassThrough(), output: new PassThrough(), terminal: true, history: second.load() })
    try {
      prompt.write(null, { name: 'up' })
      expect(prompt.line).toBe('fetch 1crn')
    } finally { prompt.close() }
    expect(fs.readFileSync(legacy, 'utf8')).toBe('help\nlist_scenes\n')
    expect(fs.readFileSync(path.join(home, '.config', 'cuemol', 'console-history'), 'utf8')).toContain('fetch 1crn')
  })

  it('isolates an explicit config directory and retains concurrent session appends', () => {
    const home = temporaryHome()
    fs.writeFileSync(path.join(home, '.tritium_cli_history'), 'private old command\n')
    const env = { CUEMOL_CONFIG_DIR: path.join(home, 'isolated') }
    const first = commandHistory(home, env)
    const second = commandHistory(home, env)
    expect(first.load()).toEqual([])
    first.append('help')
    second.append('list_scenes')
    expect(first.load()).toEqual(['list_scenes', 'help'])
    expect(infoFilePath(env)).toBe(path.join(env.CUEMOL_CONFIG_DIR, 'local-api.json'))
    expect(infoFilePath({ XDG_CONFIG_HOME: home })).toBe(path.join(home, 'cuemol', 'local-api.json'))
  })
})
