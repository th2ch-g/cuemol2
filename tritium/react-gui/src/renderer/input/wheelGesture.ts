/** @file input/wheelGesture.ts @description Distinguish pinch gestures from explicit mouse wheel bindings. */
import type { InputDevicePreference } from '@renderer/viewInputConfig'

/** A pinned mouse uses real Ctrl-wheel bindings; an unmodified synthetic Ctrl-wheel is a pinch. */
export function isPinchWheel(
  event: Pick<WheelEvent, 'ctrlKey' | 'shiftKey' | 'altKey'>,
  preference: InputDevicePreference,
): boolean {
  return preference !== 'mouse' && event.ctrlKey && !event.shiftKey && !event.altKey
}
