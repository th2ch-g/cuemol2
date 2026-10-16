import { beforeEach, expect, it, vi } from 'vitest'
import type { PluginSessionContext } from '@renderer/plugin-host/api'
import { runStartupCommands, startupBlocks } from './startupCommands'
import { runSubmission } from './runSubmission'

vi.mock('./runSubmission', () => ({ runSubmission: vi.fn() }))
const invoke = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  window.electronAPI = { invoke } as unknown as typeof window.electronAPI
})

it('switches dialects only at standalone lines and preserves continued commands', () => {
  expect(startupBlocks('help\npymol\nbg_color white\nnative\nlist_scenes')).toEqual([
    { dialect: 'native', text: 'help' },
    { dialect: 'pymol', text: 'bg_color white' },
    { dialect: 'native', text: 'list_scenes' },
  ])
  expect(startupBlocks('echo \\\npymol')).toEqual([{ dialect: 'native', text: 'echo \\\npymol' }])
})

it('runs blocks in order, carries cd across dialect changes, and stops at an error', async () => {
  invoke.mockResolvedValue([{ name: 'cuemolrc', cwd: 'config', text: 'cd data\npymol\nbg_color white\nnative\nhelp' }])
  vi.mocked(runSubmission)
    .mockResolvedValueOnce({ entries: [], aborted: false, interrupted: false, cwd: 'config/data' })
    .mockResolvedValueOnce({ entries: [{ kind: 'error', text: 'bad color' }], aborted: true, interrupted: false })
  await expect(runStartupCommands({} as PluginSessionContext)).rejects.toThrow('cuemolrc: bad color')
  expect(runSubmission).toHaveBeenCalledTimes(2)
  expect(vi.mocked(runSubmission).mock.calls[1][1]).toMatchObject({ dialect: 'pymol', cwd: 'config/data' })
})
