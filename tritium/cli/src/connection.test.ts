/**
 * @file connection.test.ts
 * @description Starting the app when none answers: which command, with what.
 */

import { describe, it, expect, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ensureApp, headlessLaunch, infoFilePath, launchApp } from './connection'

describe('tritium_cli starting the app', () => {
  it('captures detached application diagnostics in the requested log', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-log-'))
    const file = path.join(directory, 'logs with spaces', 'app.log')
    try {
      await launchApp(['-e', 'console.error("application diagnostic")'], {
        execPath: process.execPath,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CUEMOL_LAUNCH_LOG: file },
      })
      await vi.waitFor(() => expect(fs.readFileSync(file, 'utf8')).toContain('application diagnostic'))
    } finally {
      await vi.waitFor(() => fs.rmSync(directory, { recursive: true, force: true }))
    }
  })

  it('launches its own executable with --tritium-cli and waits for the console endpoint', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tcli-')), 'local-api.json')
    const quiet = { file, onStart: () => {}, pollMs: 5, timeoutMs: 2000 }
    // Run by node, not through the wrapper: there is no app to start.
    const unused = vi.fn()
    await expect(ensureApp({ ...quiet, env: {}, launch: unused })).rejects.toThrow()
    expect(unused).not.toHaveBeenCalled()

    // Through the wrapper: the app is started without the run-as-node switch,
    // and is ready once its info file lists the console.
    const ready = () =>
      fs.writeFileSync(file, JSON.stringify({ port: 1, token: 't', pid: process.pid, endpoints: ['console'] }))
    const launch = vi.fn((_cmd: string, _args: string[], _env: NodeJS.ProcessEnv, _cwd?: string) => ready())
    await ensureApp({ ...quiet, env: { ELECTRON_RUN_AS_NODE: '1', HOME: '/h' }, execPath: '/app/CueMol3', launch })
    expect(launch).toHaveBeenCalledWith('/app/CueMol3', ['--tritium-cli'], { HOME: '/h' }, undefined)

    // From the repo (task run_tritium_cli): the built dev app, started the way
    // `pnpm run start` does but without rebuilding, with the flag after `--`.
    fs.rmSync(file)
    launch.mockClear()
    await ensureApp({ ...quiet, env: { TRITIUM_CLI_DEV_APP: '/repo/react-gui', HOME: '/h' }, launch })
    expect(launch).toHaveBeenCalledWith(
      'pnpm',
      ['exec', 'electron-vite', 'preview', '--skipBuild', '--', '--tritium-cli'],
      { HOME: '/h' },
      '/repo/react-gui',
    )
  })
})

describe('headless launch', () => {
  it('uses a separate info file and respects an explicit override', () => {
    expect(infoFilePath({ CUEMOL_HEADLESS: '1' })).not.toBe(infoFilePath({}))
    expect(infoFilePath({ CUEMOL_HEADLESS: '1', CUEMOL_LOCAL_API_INFO: 'custom.json' })).toBe('custom.json')
  })

  it('uses Xvfb and software rendering on displayless Linux and diagnoses missing Xvfb', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-xvfb-'))
    try {
      expect(() => headlessLaunch('app with spaces', ['--tritium-cli'], { CUEMOL_HEADLESS: '1', PATH: directory }, 'linux'))
        .toThrow('xvfb-run')
      fs.writeFileSync(path.join(directory, 'xvfb-run'), '#!/bin/sh\n', { mode: 0o755 })
      const env = { CUEMOL_HEADLESS: '1', PATH: directory }
      const launch = headlessLaunch('app with spaces', ['--tritium-cli'], env, 'linux')
      expect(launch.command).toBe('xvfb-run')
      expect(launch.args.slice(2)).toEqual([
        'app with spaces', '--tritium-cli', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      ])
      for (const desktop of [{ DISPLAY: ':1' }, { WAYLAND_DISPLAY: 'wayland-0' }]) {
        expect(headlessLaunch('app', ['--tritium-cli'], { ...env, ...desktop }, 'linux'))
          .toEqual({ command: 'app', args: ['--tritium-cli'] })
      }
      expect(headlessLaunch('app', ['--tritium-cli'], env, 'darwin'))
        .toEqual({ command: 'app', args: ['--tritium-cli'] })
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
