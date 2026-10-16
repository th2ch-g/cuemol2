/** @file headlessOpen.test.ts @description Defaults and explicit choices for unattended loads. */
import { expect, it, vi } from 'vitest'
import { fakeObject, makeWorkerCtx } from '@renderer/worker/testing'
import { buildHeadlessFileOpenOptions } from './headlessOpen'

it('chooses molecular representations while preserving explicit renderer and selection choices', () => {
  const molecule = fakeObject({ className: 'MolCoord', extra: {
    searchCompatibleRendererNames: () => 'simple,cartoon,ribbon,ballstick',
  } })
  const { ctx } = makeWorkerCtx({ readers: {
    pdb: { setPath: vi.fn(), createDefaultObj: () => molecule, build2ndry: true },
    ccp4map: { setPath: vi.fn(), createDefaultObj: () => ({ searchCompatibleRendererNames: () => 'contour,isosurf' }) },
  } })
  const args = { readerName: 'pdb', objectName: 'structure', rendererType: null, selection: null }
  const defaults = buildHeadlessFileOpenOptions(ctx, args)
  expect(defaults.renderer.presetName).toBe('AutoRendPreset')
  expect(defaults.format).toMatchObject({ kind: 'pdb', options: { build2ndry: true } })
  expect(buildHeadlessFileOpenOptions(ctx, { ...args, rendererType: 'ballstick' }).renderer).toMatchObject({ rendererType: 'ballstick', presetName: undefined })
  expect(buildHeadlessFileOpenOptions(ctx, { ...args, selection: 'chain A' }).renderer).toMatchObject({ selection: 'chain A', selectionEnabled: true, presetName: undefined })
  expect(buildHeadlessFileOpenOptions(ctx, { ...args, readerName: 'ccp4map' }).renderer).toMatchObject({ rendererType: 'contour', presetName: undefined })
})
