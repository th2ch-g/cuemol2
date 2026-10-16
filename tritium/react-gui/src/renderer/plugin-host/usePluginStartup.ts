/**
 * @file plugin-host/usePluginStartup.ts
 * @description Runs plugin session initializers once after the launch scene settles.
 */
import { useEffect, useRef } from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useEnsureActiveScene } from '@renderer/hooks/useEnsureActiveScene'
import { usePlugins } from './pluginContext'
import { useOpenSceneFile } from './openSceneFile'
import { useSceneTabs } from './sceneTabs'
import { useSessionStartup } from './sessionStartup'

/** Reuses the same promise across effect replays so startup commands cannot run twice. */
export function usePluginStartup(initialSceneSettled: boolean): boolean {
  const { cm } = useCueMol()
  const { available } = usePlugins()
  const ensureActiveScene = useEnsureActiveScene()
  const tabs = useSceneTabs()
  const openSceneFile = useOpenSceneFile()
  const { ready, complete } = useSessionStartup()
  const pending = useRef<Promise<string[]> | null>(null)
  useEffect(() => {
    if (!initialSceneSettled || !cm) return
    if (!pending.current) {
      pending.current = (async () => {
        const errors: string[] = []
        for (const plugin of available) {
          try {
            await plugin.initializeSession?.({
              cm, ensureActiveScene, tabs,
              openScene: async (filePath) => (await openSceneFile(filePath)).ok,
            })
          } catch (error) {
            const message = `${plugin.manifest.name}: ${error instanceof Error ? error.message : String(error)}`
            errors.push(message)
            console.error('Session startup:', message)
          }
        }
        return errors
      })()
    }
    let live = true
    void pending.current.then((errors) => { if (live) complete(errors) })
    return () => { live = false }
  }, [initialSceneSettled, cm, available, ensureActiveScene, tabs, openSceneFile, complete])
  return ready
}
