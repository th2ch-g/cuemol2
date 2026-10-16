/** @file upgrade.test.ts @description Keep archive updates in the original installation. */
import { afterEach, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { selfUpgrade } from './upgrade'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it.skipIf(process.platform === 'win32')('pins the fetched installer and preserves a prefix containing spaces', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-upgrade-'))
  const root = path.join(directory, 'installed version')
  const bin = path.join(directory, 'bin with spaces')
  fs.mkdirSync(root)
  fs.writeFileSync(path.join(root, '.install-bin-dir'), bin + '\n')
  vi.stubEnv('CUEMOL_INSTALL_ROOT', root)
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ tag_name: 'v2.4.0.546' })))
    .mockResolvedValueOnce(new Response('printf "%s\\n%s\\n" "$CUEMOL_INSTALL_DIR" "$CUEMOL_VERSION" > "$CUEMOL_DATA_DIR/updated"'))
  vi.stubGlobal('fetch', fetch)
  try {
    expect(await selfUpgrade('2.3.21.544')).toBe(0)
    expect(fetch.mock.calls[1][0]).toBe('https://raw.githubusercontent.com/CueMol/cuemol2/v2.4.0.546/install.sh')
    expect(fs.readFileSync(path.join(directory, 'updated'), 'utf8')).toBe(bin + '\n2.4.0.546\n')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
