// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { default: afterPack } = require('../../../build/afterPack.js')
const builderRequire = createRequire(require.resolve('electron-builder'))
const { AppInfo } = builderRequire('app-builder-lib/out/appInfo.js')
const { Arch } = require('electron-builder')
const directories: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it.each(['linux', 'win32'])('records the packaged %s layout and full release version', async (platform) => {
  const projectDir = mkdtempSync(path.join(tmpdir(), 'cuemol-afterpack-'))
  directories.push(projectDir)
  const appOutDir = path.join(projectDir, 'release', 'app')
  const cliDir = path.join(appOutDir, 'resources', 'cli')
  mkdirSync(cliDir, { recursive: true })
  for (const command of ['cuemol', 'tritium_cli']) writeFileSync(path.join(cliDir, command + '.mjs'), '')
  const info = {
    metadata: { name: 'cuemol', version: '2.4.0', cuemolVersion: '2.4.0.546' },
    config: { productName: 'CueMol3', directories: { output: 'release' } },
  }
  vi.stubEnv('CUEMOL_PACKAGE_COMMANDS', '1')
  await afterPack({
    appOutDir, electronPlatformName: platform, arch: Arch.x64,
    packager: { projectDir, info, config: info.config, appInfo: new AppInfo(info), executableName: 'cuemol3' },
  })
  expect(JSON.parse(readFileSync(path.join(projectDir, 'release', 'command-build.json'), 'utf8'))).toEqual({
    platform, arch: 'x64', version: '2.4.0.546', appDir: 'app', product: 'CueMol3',
    executable: platform === 'win32' ? 'CueMol3.exe' : 'cuemol3',
  })
  const wrapper = readFileSync(path.join(cliDir, platform === 'win32' ? 'cuemol.cmd' : 'cuemol'), 'utf8')
  expect(wrapper).toContain('cuemol.mjs')
  expect(wrapper).toContain('ELECTRON_RUN_AS_NODE=1')
})
