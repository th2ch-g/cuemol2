/**
 * @file main/startupScripts.ts
 * @description Reads the optional user startup command file.
 */
import fs from 'fs'
import path from 'path'
import type { StartupScript } from '@shared/types/startup'
import { getConfigDirectory } from './configDirectory'

/** Missing files are optional; unreadable files are reported to the console. */
export function readStartupScripts(directory = getConfigDirectory()): StartupScript[] {
  if (process.env.CUEMOL_FRESH_PREFS && process.env.CUEMOL_FRESH_PREFS !== '0' && !process.env.CUEMOL_CONFIG_DIR) return []
  const name = 'cuemolrc'
  try {
    return [{ name, cwd: directory, text: fs.readFileSync(path.join(directory, name), 'utf8') }]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    return [{ name, cwd: directory, text: '', error: String(error) }]
  }
}
