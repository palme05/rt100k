import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { haptic, HAPTICS_KEY, hapticsEnabled, setHapticsEnabled } from './haptics'

/** Android-Browser nachstellen: Vibrations-API und localStorage */
function android() {
  const store = new Map<string, string>()
  const vibrate = vi.fn(() => true)
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
  })
  vi.stubGlobal('navigator', { vibrate, userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 7)', platform: 'Linux armv8l', maxTouchPoints: 5 })
  return { vibrate, store }
}

describe('haptic (Android)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('spielt je Anlass ein eigenes Muster', () => {
    const { vibrate } = android()
    haptic('tap')
    haptic('success')
    haptic('error')
    expect(vibrate.mock.calls.map((c: unknown[]) => c[0])).toEqual([12, [14, 70, 22], [40, 60, 40, 60, 40]])
  })

  it("nimmt 'tick' (alter Name) als Antippen", () => {
    const { vibrate } = android()
    haptic('tick')
    expect(vibrate).toHaveBeenCalledWith(12)
  })

  it('drosselt das Raster-Ticken beim schnellen Wischen', () => {
    const { vibrate } = android()
    vi.advanceTimersByTime(1000)
    haptic('select')
    haptic('select')
    expect(vibrate).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(40)
    haptic('select')
    expect(vibrate).toHaveBeenCalledTimes(2)
  })

  it('bleibt still, wenn auf dem Gerät abgeschaltet', () => {
    const { vibrate, store } = android()
    setHapticsEnabled(false)
    expect(store.get(HAPTICS_KEY)).toBe('aus')
    expect(hapticsEnabled()).toBe(false)
    haptic('success')
    expect(vibrate).not.toHaveBeenCalled()
    setHapticsEnabled(true)
    haptic('success')
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('wirft nie – auch ohne localStorage und ohne Vibrations-API', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blockiert')
      },
    })
    vi.stubGlobal('navigator', { userAgent: 'Desktop', platform: 'Win32', maxTouchPoints: 0 })
    expect(() => haptic('tap')).not.toThrow()
    expect(hapticsEnabled()).toBe(true)
  })
})
