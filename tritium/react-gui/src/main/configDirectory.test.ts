import { afterEach, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { importLegacyProfile } from './configDirectory'
import { readStartupScripts } from './startupScripts'

const directories: string[] = []
function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-config-'))
  directories.push(directory)
  return directory
}
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }) })

it('imports settings and GUI history once without overwriting destination or deleting source', () => {
  const root = temporaryDirectory()
  const source = path.join(root, 'legacy')
  const destination = path.join(root, 'config', 'gui')
  fs.mkdirSync(path.join(source, 'Local Storage'), { recursive: true })
  fs.writeFileSync(path.join(source, 'Local Storage', 'history'), 'previous commands')
  fs.writeFileSync(path.join(source, 'app-state.json'), '{"theme":"light"}')
  fs.writeFileSync(path.join(source, 'user_styles.xml'), '<styles/>')
  fs.mkdirSync(destination, { recursive: true })
  fs.writeFileSync(path.join(destination, 'app-state.json'), '{"theme":"dark"}')
  importLegacyProfile(source, destination)
  expect(fs.readFileSync(path.join(destination, 'app-state.json'), 'utf8')).toContain('dark')
  expect(fs.readFileSync(path.join(destination, 'Local Storage', 'history'), 'utf8')).toBe('previous commands')
  expect(fs.readFileSync(path.join(source, 'user_styles.xml'), 'utf8')).toBe('<styles/>')
  fs.rmSync(path.join(destination, 'user_styles.xml'))
  importLegacyProfile(source, destination)
  expect(fs.existsSync(path.join(destination, 'user_styles.xml'))).toBe(false)
})

it('reads only cuemolrc and reports an unreadable file without failing app boot', () => {
  const root = temporaryDirectory()
  expect(readStartupScripts(root)).toEqual([])
  fs.writeFileSync(path.join(root, 'cuemolrc'), 'pymol\nbg_color white\n')
  fs.writeFileSync(path.join(root, 'cuemolrc.pml'), 'not executed')
  expect(readStartupScripts(root)).toEqual([{ name: 'cuemolrc', cwd: root, text: 'pymol\nbg_color white\n' }])
  fs.rmSync(path.join(root, 'cuemolrc'))
  fs.mkdirSync(path.join(root, 'cuemolrc'))
  expect(readStartupScripts(root)[0].error).toBeTruthy()
})
