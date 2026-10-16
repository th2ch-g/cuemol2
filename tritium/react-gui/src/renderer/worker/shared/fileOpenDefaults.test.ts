/**
 * @file worker/shared/fileOpenDefaults.test.ts
 * @description The renderer a loaded object starts with when nobody chose
 * one: what that kind of object can show, never a molecule's `simple` for a
 * map. Once a bug in each load path that hard-coded `simple`.
 */

import { describe, it, expect } from 'vitest'
import { initialRendererType, initialRendererPreset } from './fileOpenDefaults'

describe('initialRendererType', () => {
  it('gives a molecule simple, and anything else the first type it reports', () => {
    expect(initialRendererType(['anisou', 'ballstick', 'cartoon', 'simple', 'trace'])).toBe('simple')
    expect(initialRendererType(['contour', 'isosurf'])).toBe('contour')
    expect(initialRendererType(['molsurf'])).toBe('molsurf')
    expect(initialRendererType([])).toBe('')
  })
})

it('selects the molecular preset only for objects supporting every representation', () => {
  expect(initialRendererPreset(['simple', 'ribbon', 'cartoon', 'ballstick'])).toBe('AutoRendPreset')
  expect(initialRendererPreset(['contour', 'isosurf'])).toBeUndefined()
  expect(initialRendererPreset(['simple', 'cartoon'])).toBeUndefined()
})
