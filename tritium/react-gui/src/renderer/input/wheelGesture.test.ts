/** @file input/wheelGesture.test.ts @description Preserve mouse modifier bindings alongside trackpad pinch. */
import { expect, it } from 'vitest'
import { isPinchWheel } from './wheelGesture'

it('keeps physical Ctrl-wheel and Ctrl-Shift-wheel out of the pinch route', () => {
  const event = { ctrlKey: true, shiftKey: false, altKey: false }
  expect(isPinchWheel(event, 'mouse')).toBe(false)
  expect(isPinchWheel(event, 'trackpad')).toBe(true)
  expect(isPinchWheel(event, 'auto')).toBe(true)
  expect(isPinchWheel({ ...event, shiftKey: true }, 'auto')).toBe(false)
  expect(isPinchWheel({ ...event, ctrlKey: false }, 'auto')).toBe(false)
})
