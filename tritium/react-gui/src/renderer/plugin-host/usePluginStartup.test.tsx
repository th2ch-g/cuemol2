import React, { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipcChannels'
import { flushPromises, makeRenderHook, setupElectronAPI, teardownElectronAPI } from '@renderer/__test__/helpers/testHarness'
import { SessionStartupProvider, useSessionStartup } from './sessionStartup'
import { usePluginStartup } from './usePluginStartup'
import { useLocalApiEndpoint } from './localApi'

const initializeSession = vi.fn()
const available = [{ manifest: { id: 'startup', name: 'Startup', version: '1' }, initializeSession }]
const cm = {}
const tabs = {}
const ensureActiveScene = vi.fn()
const openSceneFile = vi.fn()
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({ useCueMol: () => ({ cm }) }))
vi.mock('@renderer/hooks/useEnsureActiveScene', () => ({ useEnsureActiveScene: () => ensureActiveScene }))
vi.mock('./sceneTabs', () => ({ useSceneTabs: () => tabs }))
vi.mock('./openSceneFile', () => ({ useOpenSceneFile: () => openSceneFile }))
vi.mock('./pluginContext', () => ({ usePlugins: () => ({ available }) }))

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <StrictMode><SessionStartupProvider>{children}</SessionStartupProvider></StrictMode>
)
afterEach(() => { teardownElectronAPI(); vi.restoreAllMocks() })

it('waits for the launch scene and startup promise before exposing endpoints, without replaying commands', async () => {
  const api = setupElectronAPI()
  let finish!: () => void
  initializeSession.mockReset().mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
  let sceneReady = false
  const hook = makeRenderHook(() => {
    const ready = usePluginStartup(sceneReady)
    useLocalApiEndpoint('console', true, { handle: async () => ({}), cancel: () => {} })
    return ready
  }, Wrapper)
  try {
    await flushPromises()
    expect(initializeSession).not.toHaveBeenCalled()
    sceneReady = true
    hook.rerender()
    await flushPromises()
    hook.rerender()
    expect(initializeSession).toHaveBeenCalledTimes(1)
    expect(hook.result).toBe(false)
    expect(api.invoke).not.toHaveBeenCalledWith(IPC.LOCAL_API_CONTROL, expect.objectContaining({ enabled: true }))
    finish()
    await flushPromises()
    expect(hook.result).toBe(true)
    expect(api.invoke).toHaveBeenCalledWith(IPC.LOCAL_API_CONTROL, expect.objectContaining({ enabled: true }))
  } finally { hook.unmount() }
})

it('reports startup failures while still releasing the session', async () => {
  setupElectronAPI()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  initializeSession.mockReset().mockRejectedValue(new Error('cuemolrc: invalid command'))
  const hook = makeRenderHook(() => {
    usePluginStartup(true)
    return useSessionStartup()
  }, Wrapper)
  try {
    await flushPromises()
    expect(hook.result.ready).toBe(true)
    expect(hook.result.errors).toEqual(['Startup: cuemolrc: invalid command'])
    expect(initializeSession).toHaveBeenCalledTimes(1)
  } finally { hook.unmount() }
})
