/** @file naviCenterPick.test.ts @description Center on the displayed atom without changing the molecule. */
import { expect, it, vi } from 'vitest'
import { fakeObject, fakeRenderer, fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'
import { naviCenterPick } from './naviTool'

it('centers on an atom and ignores the empty background', () => {
  const hitTest = vi.fn(() => JSON.stringify({ objtype: 'MolCoord', x: 1, y: 2, z: 3 }))
  const view = fakeView({ extra: { hitTest } })
  const scene = fakeScene({ views: [view] })
  const vector = { set3: vi.fn() }
  const { ctx } = makeWorkerCtx({ scenes: [scene], createObj: () => vector })
  expect(naviCenterPick(ctx, { viewId: view.uid, x: 100, y: 200 })).toEqual({ ok: true })
  expect(vector.set3).toHaveBeenCalledWith(1, 2, 3)
  expect(view.setViewCenter).toHaveBeenCalledWith(vector)
  hitTest.mockReturnValue('')
  expect(naviCenterPick(ctx, { viewId: view.uid, x: 0, y: 0 })).toEqual({ ok: false })
  expect(view.setViewCenter).toHaveBeenCalledTimes(1)
  expect(scene.startUndoTxn).not.toHaveBeenCalled()
})

it('centers on the symmetry image instead of the asymmetric-unit atom', () => {
  const view = fakeView()
  const scene = fakeScene({ views: [view] })
  const atomPosition = { w: 0 }
  const transformed = { x: 11, y: 12, z: 13 }
  const matrix = { mulvec: vi.fn(() => transformed) }
  const renderer = fakeRenderer({ type: '*symm', extra: { getXformMatrix: vi.fn(() => matrix) } })
  const molecule = fakeObject({ scene, extra: { getAtomByID: vi.fn(() => ({ pos: atomPosition })) } })
  scene.addObject(molecule)
  molecule.attachRenderer(renderer)
  view.hitTest = () => JSON.stringify({ objtype: 'MolCoord', obj_id: molecule.uid, rend_id: renderer.uid, rendtype: '*symm', atom_id: 7, symm_id: 2 })
  const { ctx } = makeWorkerCtx({ scenes: [scene] })
  expect(naviCenterPick(ctx, { viewId: view.uid, x: 20, y: 30 })).toEqual({ ok: true })
  expect(matrix.mulvec).toHaveBeenCalledWith(atomPosition)
  expect(atomPosition.w).toBe(1)
  expect(view.setViewCenter).toHaveBeenCalledWith(transformed)
})
