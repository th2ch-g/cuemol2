/**
 * @file plugins/console/renderer/startupCommands.ts
 * @description Executes cuemolrc through the regular console runner, with dialect switches.
 */
import { IPC } from '@shared/ipcChannels'
import type { PluginSessionContext } from '@renderer/plugin-host/api'
import type { ConsoleEntry, DialectId } from '../shared/consoleTypes'
import { consoleSession } from './consoleSessionStore'
import { runSubmission } from './runSubmission'

/** Standalone dialect names switch syntax; a continued line remains part of its command. */
export function startupBlocks(text: string): { dialect: DialectId; text: string }[] {
  const blocks: { dialect: DialectId; text: string }[] = []
  let dialect: DialectId = 'native'
  let lines: string[] = []
  let continued = false
  for (const line of text.split(/\r?\n/)) {
    const mode = line.trim()
    if (!continued && (mode === 'native' || mode === 'pymol')) {
      if (lines.some((value) => value.trim())) blocks.push({ dialect, text: lines.join('\n') })
      dialect = mode
      lines = []
    } else {
      lines.push(line)
    }
    continued = line.endsWith('\\')
  }
  if (lines.some((value) => value.trim())) blocks.push({ dialect, text: lines.join('\n') })
  return blocks
}

/** An error stops the file and reports its source without preventing the app from opening. */
export async function runStartupCommands(context: PluginSessionContext): Promise<void> {
  const scripts = await window.electronAPI?.invoke(IPC.APP_STARTUP_SCRIPTS) ?? []
  if (scripts.length === 0) return
  const entries: ConsoleEntry[] = []
  const errors: string[] = []
  consoleSession.begin()
  try {
    for (const script of scripts) {
      entries.push({ kind: 'output', text: `Startup: ${script.name}` })
      try {
        if (script.error) throw new Error(script.error)
        let cwd = script.cwd
        for (const block of startupBlocks(script.text)) {
          const result = await runSubmission(context, {
            ...block, cwd, runId: `startup-${script.name}`, stopped: () => false,
          })
          entries.push(...result.entries)
          cwd = result.cwd ?? cwd
          if (result.aborted) {
            errors.push(`${script.name}: ${result.entries.filter((e) => e.kind === 'error').map((e) => e.text).join('; ') || 'execution stopped'}`)
            break
          }
        }
      } catch (error) {
        const message = `${script.name}: ${error instanceof Error ? error.message : String(error)}`
        entries.push({ kind: 'error', text: message })
        errors.push(message)
      }
    }
  } finally {
    consoleSession.finish(entries)
  }
  if (errors.length) throw new Error(errors.join('\n'))
}
