/**
 * Pointing-device preset mapping (mouse vs Mac trackpad).
 *
 * Pins the style names applied to the C++ ViewInputConfig and the label
 * round-trip used by the settings select, so a rename of either side is
 * caught here rather than silently mis-binding the wheel.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  viewInputStyleName,
  normalizeInputDeviceMode,
  inputDeviceModeFromLabel,
  INPUT_DEVICE_LABELS,
  INPUT_DEVICE_OPTIONS,
  DEFAULT_INPUT_DEVICE_MODE,
  normalizeInputDevicePreference,
  inputDevicePreferenceFromLabel,
  INPUT_DEVICE_PREF_LABELS,
  INPUT_DEVICE_PREF_OPTIONS,
  DEFAULT_INPUT_DEVICE_PREFERENCE,
} from '@renderer/viewInputConfig'

describe('viewInputConfig', () => {
  it('selects PyMOL mouse bindings for both wheel axes while retaining trackpad gestures', () => {
    expect(viewInputStyleName('mouse', 'pymol')).toBe('PymolViewInConf,UserViewConf')
    expect(viewInputStyleName('trackpad', 'pymol')).toBe('TrackpadViewInConf,UserViewConf')
    const xml = readFileSync(resolve(__dirname, '../../../../../data/default_style.xml'), 'utf8')
    const style = new DOMParser().parseFromString(xml, 'application/xml').querySelector('style[id="PymolViewInConf"]')!
    expect(style.getAttribute('conf_slab')).toBe('WHEEL1,WHEEL2')
    expect(style.getAttribute('conf_trax')).toBe('MBUTTON|MOUSE_X')
    expect(style.getAttribute('conf_zoom')?.split(',')).toContain('RBUTTON|MOUSE_Y')
  })
  it('maps each device mode to its style preset + UserViewConf layer', () => {
    expect(viewInputStyleName('mouse')).toBe('DefaultViewInConf,UserViewConf')
    expect(viewInputStyleName('trackpad')).toBe('TrackpadViewInConf,UserViewConf')
  })

  it('defaults to mouse', () => {
    expect(DEFAULT_INPUT_DEVICE_MODE).toBe('mouse')
  })

  it('normalizes a persisted value, only "trackpad" is trackpad', () => {
    expect(normalizeInputDeviceMode('trackpad')).toBe('trackpad')
    expect(normalizeInputDeviceMode('mouse')).toBe('mouse')
    expect(normalizeInputDeviceMode(undefined)).toBe('mouse')
    expect(normalizeInputDeviceMode('bogus')).toBe('mouse')
  })

  it('round-trips select labels and modes', () => {
    expect(INPUT_DEVICE_OPTIONS).toEqual([
      INPUT_DEVICE_LABELS.mouse,
      INPUT_DEVICE_LABELS.trackpad,
    ])
    expect(inputDeviceModeFromLabel(INPUT_DEVICE_LABELS.trackpad)).toBe('trackpad')
    expect(inputDeviceModeFromLabel(INPUT_DEVICE_LABELS.mouse)).toBe('mouse')
    expect(inputDeviceModeFromLabel('anything else')).toBe('mouse')
  })
})

describe('viewInputConfig preference layer', () => {
  it('defaults to auto', () => {
    expect(DEFAULT_INPUT_DEVICE_PREFERENCE).toBe('auto')
  })

  it('normalizes a persisted preference (default auto)', () => {
    expect(normalizeInputDevicePreference('mouse')).toBe('mouse')
    expect(normalizeInputDevicePreference('trackpad')).toBe('trackpad')
    expect(normalizeInputDevicePreference('auto')).toBe('auto')
    expect(normalizeInputDevicePreference(undefined)).toBe('auto')
    expect(normalizeInputDevicePreference('bogus')).toBe('auto')
  })

  it('round-trips the three preference labels (auto last)', () => {
    expect(INPUT_DEVICE_PREF_OPTIONS).toEqual([
      INPUT_DEVICE_PREF_LABELS.mouse,
      INPUT_DEVICE_PREF_LABELS.trackpad,
      INPUT_DEVICE_PREF_LABELS.auto,
    ])
    expect(inputDevicePreferenceFromLabel(INPUT_DEVICE_PREF_LABELS.mouse)).toBe('mouse')
    expect(inputDevicePreferenceFromLabel(INPUT_DEVICE_PREF_LABELS.trackpad)).toBe('trackpad')
    expect(inputDevicePreferenceFromLabel(INPUT_DEVICE_PREF_LABELS.auto)).toBe('auto')
    expect(inputDevicePreferenceFromLabel('anything else')).toBe('auto')
  })
})
