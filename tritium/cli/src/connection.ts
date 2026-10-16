/**
 * @file connection.ts
 * @description How tritium_cli finds and talks to the app: the info file the
 * app writes while its local API server is up, starting the app when none
 * answers, and the authenticated POST every request goes through.
 *
 * Kept apart from the entry module so a test can import it without the
 * command line running.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { configDirectory, CUEMOL_MCP_FLAG, TRITIUM_CLI_FLAG } from '@cuemol/console-kit'
import type { AppQuitResponse, LocalApiEndpoint, LocalApiInfoFile } from '@cuemol/console-kit'

/** Where the app writes its port and token. */
export function infoFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.CUEMOL_LOCAL_API_INFO || path.resolve(configDirectory(os.homedir(), env),
    env.CUEMOL_HEADLESS === '1' ? 'local-api-headless.json' : 'local-api.json')
}

export const NOT_RUNNING =
  'CueMol is not running, or command line access is off ' +
  '(Settings > Plugins > Console > Command line access).'

/** The connection info, or an Error saying why there is none. */
export function readInfo(file = infoFilePath(), endpoint: LocalApiEndpoint = 'console'): LocalApiInfoFile | Error {
  let info: LocalApiInfoFile
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf8')) as LocalApiInfoFile
  } catch {
    return new Error(NOT_RUNNING)
  }
  if (!info || !Array.isArray(info.endpoints) || !info.endpoints.includes(endpoint)) {
    return new Error(endpoint === 'console' ? NOT_RUNNING : 'CueMol is not running, or MCP access is off.')
  }
  if (!Number.isInteger(info.port) || info.port < 1 || info.port > 65535 || typeof info.token !== 'string' || !info.token) {
    return new Error('Invalid CueMol local API info file.')
  }
  return info
}

/** Whether process `pid` is alive (EPERM: alive, but someone else's). */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Info for a live app with the console endpoint open, or null. */
function liveInfo(file: string, endpoint: LocalApiEndpoint): LocalApiInfoFile | null {
  const info = readInfo(file, endpoint)
  if (info instanceof Error) return null
  // A crashed app leaves its file behind.
  if (typeof info.pid === 'number' && !alive(info.pid)) return null
  return info
}

const START_TIMEOUT_MS = 90_000

/** Starts a program that outlives this process. */
export type Launch = (command: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string) => void | Promise<void>

function spawnDetached(command: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let log: number | undefined
    try {
      if (env.CUEMOL_LAUNCH_LOG) {
        fs.mkdirSync(path.dirname(env.CUEMOL_LAUNCH_LOG), { recursive: true, mode: 0o700 })
        log = fs.openSync(env.CUEMOL_LAUNCH_LOG, 'a', 0o600)
      }
      const child = spawn(command, args, {
        detached: true, stdio: ['ignore', log ?? 'ignore', log ?? 'ignore'], env, cwd,
      })
      child.once('error', reject)
      child.once('spawn', () => { child.unref(); resolve() })
    } catch (error) {
      reject(error)
    } finally {
      if (log !== undefined) fs.closeSync(log)
    }
  })
}

/** Use a virtual X11 display when Linux has no desktop session. */
export function headlessLaunch(command: string, args: string[], env: NodeJS.ProcessEnv, platform = process.platform): { command: string; args: string[] } {
  if (env.CUEMOL_HEADLESS !== '1' || platform !== 'linux' || env.DISPLAY || env.WAYLAND_DISPLAY) {
    return { command, args }
  }
  const available = (env.PATH || '').split(path.delimiter).some((directory) => {
    try { fs.accessSync(path.join(directory, 'xvfb-run'), fs.constants.X_OK); return true } catch { return false }
  })
  if (!available) throw new Error('Headless Linux requires xvfb-run. Install Xvfb and xauth, then retry with --headless.')
  return {
    command: 'xvfb-run',
    args: ['--auto-servernum', '--server-args=-screen 0 1400x900x24', command, ...args,
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  }
}

/**
 * The command that starts the app, or null when this process cannot start one.
 *
 * Two ways: run by the app's own executable (the shipped wrapper sets
 * ELECTRON_RUN_AS_NODE), where `execPath` is the app; or from the repo through
 * `task run_tritium_cli`, which names the react-gui directory in
 * TRITIUM_CLI_DEV_APP, where the built dev app is started the way
 * `pnpm run start` starts it (without rebuilding). electron-vite hands what
 * follows `--` to the app.
 */
function launchCommand(env: NodeJS.ProcessEnv, execPath: string, args: string[]): { command: string; args: string[]; cwd?: string } | null {
  if (env.ELECTRON_RUN_AS_NODE) return { command: execPath, args }
  if (env.TRITIUM_CLI_DEV_APP) {
    return {
      command: 'pnpm',
      args: ['exec', 'electron-vite', 'preview', '--skipBuild', '--', ...args],
      cwd: env.TRITIUM_CLI_DEV_APP,
    }
  }
  return null
}

export interface EnsureAppOptions {
  endpoint?: LocalApiEndpoint
  env?: NodeJS.ProcessEnv
  execPath?: string
  file?: string
  launch?: Launch
  onStart?: () => void
  timeoutMs?: number
  pollMs?: number
}

/** Start the GUI with file arguments or an explicit local API request. */
export async function launchApp(args: string[], {
  env = process.env, execPath = process.execPath, launch = spawnDetached,
}: Pick<EnsureAppOptions, 'env' | 'execPath' | 'launch'> = {}): Promise<void> {
  const how = launchCommand(env, execPath, args)
  if (!how) throw new Error('Run the packaged cuemol command, or set TRITIUM_CLI_DEV_APP for a development build.')
  const appEnv = { ...env }
  delete appEnv.ELECTRON_RUN_AS_NODE
  delete appEnv.TRITIUM_CLI_DEV_APP
  const headless = headlessLaunch(how.command, how.args, appEnv)
  await launch(headless.command, headless.args, appEnv, how.cwd)
}

/**
 * Make sure an app with command line access is there, starting one if not.
 *
 * An app that is running with access off gets the same launch; the second
 * instance hands its arguments to the running one and exits, and the running
 * one opens access. The started app outlives this process.
 *
 * Resolves when the console endpoint is in the info file; rejects with an
 * Error saying why not.
 */
export async function ensureApp({
  endpoint = 'console',
  env = process.env,
  execPath = process.execPath,
  file = infoFilePath(env),
  launch = spawnDetached,
  onStart = () => process.stderr.write('Starting CueMol3...\n'),
  timeoutMs = START_TIMEOUT_MS,
  pollMs = 300,
}: EnsureAppOptions = {}): Promise<void> {
  if (liveInfo(file, endpoint)) return
  onStart()
  await launchApp([endpoint === 'mcp' ? CUEMOL_MCP_FLAG : TRITIUM_CLI_FLAG], { env, execPath, launch })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs))
    if (liveInfo(file, endpoint)) return
  }
  throw new Error(`CueMol3 did not open the ${endpoint} endpoint in time.`)
}

/**
 * POST `body` to `route` and return the parsed answer.
 *
 * The info file is read per request: the app may have moved to another port
 * or made a new token since the last one.
 *
 * @param notFound - what a 404 means for this route; by default the console
 *   endpoint is off, which reads as "not running"
 */
export async function post<T = Record<string, unknown>>(
  route: string,
  body: unknown,
  signal?: AbortSignal,
  notFound = NOT_RUNNING,
): Promise<T> {
  const info = readInfo()
  if (info instanceof Error) throw info
  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${info.port}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error(NOT_RUNNING)
  }
  const answer = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (res.status === 404) throw new Error(notFound)
  if (!res.ok) throw new Error(answer.error || `The app answered ${res.status}.`)
  return answer
}

/**
 * Ask the app to quit, and say how it ended.
 *
 * A normal quit is answered once the user has gone through the save prompts.
 * The connection can also drop as the app goes down before the answer gets
 * out; an app whose process is gone has quit whatever the socket said.
 */
export async function quitApp(force: boolean, signal?: AbortSignal): Promise<AppQuitResponse['outcome']> {
  const info = readInfo()
  if (info instanceof Error) throw info
  try {
    const res = await post<AppQuitResponse>(
      '/app/quit',
      { force },
      signal,
      'This CueMol cannot be quit from the command line; update it.',
    )
    return res.outcome
  } catch (e) {
    if (signal?.aborted || (e as Error).message !== NOT_RUNNING) throw e
    for (let i = 0; i < 50; i++) {
      if (!alive(info.pid)) return 'quit'
      await new Promise((r) => setTimeout(r, 100))
    }
    throw e
  }
}
