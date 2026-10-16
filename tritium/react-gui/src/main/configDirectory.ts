/**
 * @file main/configDirectory.ts
 * @description Shared configuration paths and non-destructive legacy profile import.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { configDirectory } from '@cuemol/console-kit'

const PROFILE_ENTRIES = ['app-state.json', 'user_styles.xml', 'actions', 'Local Storage', 'Local State', 'Preferences']

/** Configuration shared by GUI and headless sessions. */
export function getConfigDirectory(): string {
  return path.resolve(configDirectory(os.homedir(), process.env))
}

/** Copy settings once, retaining both existing destination files and the old profile. */
export function importLegacyProfile(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 })
  const marker = path.join(destination, '.legacy-imported')
  if (source === destination || fs.existsSync(marker)) return
  for (const entry of PROFILE_ENTRIES) {
    const from = path.join(source, entry)
    const to = path.join(destination, entry)
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false })
    }
  }
  fs.writeFileSync(marker, '', { mode: 0o600 })
}
