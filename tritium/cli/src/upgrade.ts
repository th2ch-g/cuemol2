/**
 * @file upgrade.ts
 * @description Update a command-archive installation using the same installer.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

/** Reuse the installation's prefix; leave running application files in place. */
export async function selfUpgrade(currentVersion: string): Promise<number> {
  const root = process.env.CUEMOL_INSTALL_ROOT
  if (!root || !fs.existsSync(path.join(root, '.install-bin-dir'))) {
    throw new Error('Use the cuemol command installed by pip or install.sh to self-upgrade.')
  }
  const latest = await fetch('https://api.github.com/repos/CueMol/cuemol2/releases/latest', { signal: AbortSignal.timeout(30_000) })
  if (!latest.ok) throw new Error(`Could not check the latest release (HTTP ${latest.status}).`)
  const release = await latest.json() as { tag_name?: string }
  const version = release.tag_name?.replace(/^v/, '') ?? ''
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version.')
  const current = currentVersion.split('.').map(Number)
  const parts = version.split('.').map(Number)
  const changed = parts.findIndex((part, index) => part !== current[index])
  if (changed === -1 || parts[changed] < current[changed]) {
    process.stdout.write(`CueMol ${currentVersion} is already up to date.\n`)
    return 0
  }
  const response = await fetch(`https://raw.githubusercontent.com/CueMol/cuemol2/v${version}/install.sh`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Could not download the installer (HTTP ${response.status}).`)
  const script = await response.text()
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-s'], {
      env: {
        ...process.env,
        CUEMOL_VERSION: version,
        CUEMOL_DATA_DIR: path.dirname(root),
        CUEMOL_INSTALL_DIR: fs.readFileSync(path.join(root, '.install-bin-dir'), 'utf8').trim(),
      },
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
    child.stdin.on('error', reject)
    child.stdin.end(script)
  })
}
