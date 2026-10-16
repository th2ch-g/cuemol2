/** Persistent readline history, including the previous CLI's history file. */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { configDirectory } from '@cuemol/console-kit'

export const HISTORY_SIZE = 1000

/** Keep each append independent so concurrent console sessions retain their commands. */
export function commandHistory(home = os.homedir(), env: NodeJS.ProcessEnv = process.env) {
  const directory = path.resolve(configDirectory(home, env))
  const file = path.join(directory, 'console-history')
  const prepare = () => {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (!env.CUEMOL_CONFIG_DIR && !fs.existsSync(file)) {
      const legacy = path.join(home, '.tritium_cli_history')
      if (fs.existsSync(legacy)) {
        try {
          fs.copyFileSync(legacy, file, fs.constants.COPYFILE_EXCL)
          fs.chmodSync(file, 0o600)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        }
      }
    }
  }
  return {
    load(): string[] {
      try {
        prepare()
        return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).reverse().slice(0, HISTORY_SIZE)
      } catch {
        return []
      }
    },
    append(line: string): void {
      try {
        prepare()
        fs.appendFileSync(file, `${line}\n`, { mode: 0o600 })
      } catch {
        // A read-only home must not stop the console.
      }
    },
  }
}
