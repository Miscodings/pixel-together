import { describe, test, expect, beforeEach } from '@jest/globals'
import {
  createCanvas,
  applyPixelUpdate,
  serializeCanvas,
  deserializeCanvas,
  PixelCanvas,
  PixelUpdate,
} from '../crdt.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUpdate(overrides: Partial<PixelUpdate> = {}): PixelUpdate {
  return {
    x: 0,
    y: 0,
    color: 0xFFFFFFFF,
    ts: 1.0,
    userId: 'usr_a',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('LWW-Register CRDT', () => {
  let canvas: PixelCanvas

  beforeEach(() => {
    canvas = createCanvas(16, 16)
  })

  // -------------------------------------------------------------------------
  test('applies update with higher timestamp', () => {
    const first = makeUpdate({ ts: 1.0, color: 0xFF0000FF })
    const second = makeUpdate({ ts: 2.0, color: 0x00FF00FF })

    applyPixelUpdate(canvas, first)
    const applied = applyPixelUpdate(canvas, second)

    expect(applied).toBe(true)
    expect(canvas.pixels[0]).toBe(0x00FF00FF)
    expect(canvas.timestamps[0]).toBe(2.0)
  })

  // -------------------------------------------------------------------------
  test('rejects update with lower timestamp', () => {
    const first = makeUpdate({ ts: 2.0, color: 0x00FF00FF })
    const stale = makeUpdate({ ts: 1.0, color: 0xFF0000FF })

    applyPixelUpdate(canvas, first)
    const applied = applyPixelUpdate(canvas, stale)

    expect(applied).toBe(false)
    expect(canvas.pixels[0]).toBe(0x00FF00FF)
    expect(canvas.timestamps[0]).toBe(2.0)
  })

  // -------------------------------------------------------------------------
  test('resolves tie by higher userId (lexicographic)', () => {
    const lower = makeUpdate({ ts: 1.0, color: 0xFF0000FF, userId: 'usr_a' })
    const higher = makeUpdate({ ts: 1.0, color: 0x00FF00FF, userId: 'usr_b' })

    // usr_a writes first, then usr_b with the same timestamp
    applyPixelUpdate(canvas, lower)
    const applied = applyPixelUpdate(canvas, higher)

    // usr_b > usr_a lexicographically, so usr_b wins
    expect(applied).toBe(true)
    expect(canvas.pixels[0]).toBe(0x00FF00FF)
  })

  // -------------------------------------------------------------------------
  test('handles concurrent updates to different pixels independently', () => {
    const u1 = makeUpdate({ x: 0, y: 0, color: 0xAAAAAAAA, ts: 1.0 })
    const u2 = makeUpdate({ x: 1, y: 0, color: 0xBBBBBBBB, ts: 1.0 })
    const u3 = makeUpdate({ x: 0, y: 1, color: 0xCCCCCCCC, ts: 2.0 })

    applyPixelUpdate(canvas, u1)
    applyPixelUpdate(canvas, u2)
    applyPixelUpdate(canvas, u3)

    // pixel (0,0) = 0xAAAAAAAA
    expect(canvas.pixels[0]).toBe(0xAAAAAAAA)
    // pixel (1,0) = 0xBBBBBBBB
    expect(canvas.pixels[1]).toBe(0xBBBBBBBB)
    // pixel (0,1) = 0xCCCCCCCC  (index = 1*16+0 = 16)
    expect(canvas.pixels[16]).toBe(0xCCCCCCCC)
  })

  // -------------------------------------------------------------------------
  test('flood fill produces correct pixel set', () => {
    // Simulate a 4×4 region fill on a 16×16 canvas
    const fillColor = 0xDEADBEEF
    const ts = 10.0

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        applyPixelUpdate(canvas, makeUpdate({ x, y, color: fillColor, ts }))
      }
    }

    // All 16 pixels in the 4×4 region should be filled
    let filledCount = 0
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const idx = y * 16 + x
        if (canvas.pixels[idx] === fillColor) filledCount++
      }
    }
    expect(filledCount).toBe(16)

    // Pixels outside that region should be zeroed
    expect(canvas.pixels[4]).toBe(0)    // (4,0)
    expect(canvas.pixels[16 * 4]).toBe(0) // (0,4)
  })

  // -------------------------------------------------------------------------
  test('serialize/deserialize roundtrip is lossless', () => {
    // Write some pixels
    applyPixelUpdate(canvas, makeUpdate({ x: 0, y: 0, color: 0x12345678, ts: 1.5 }))
    applyPixelUpdate(canvas, makeUpdate({ x: 5, y: 3, color: 0xDEADBEEF, ts: 99.9 }))
    applyPixelUpdate(canvas, makeUpdate({ x: 15, y: 15, color: 0x00FF00FF, ts: 0.001 }))

    const { pixels, timestamps } = serializeCanvas(canvas)
    const restored = deserializeCanvas(16, 16, pixels, timestamps)

    // Pixel values should match
    expect(restored.pixels[0]).toBe(canvas.pixels[0])
    expect(restored.pixels[5 + 3 * 16]).toBe(canvas.pixels[5 + 3 * 16])
    expect(restored.pixels[15 + 15 * 16]).toBe(canvas.pixels[15 + 15 * 16])

    // Timestamps should match within float64 precision
    expect(restored.timestamps[0]).toBeCloseTo(1.5, 10)
    expect(restored.timestamps[5 + 3 * 16]).toBeCloseTo(99.9, 10)
    expect(restored.timestamps[15 + 15 * 16]).toBeCloseTo(0.001, 10)

    // Full buffers should be identical
    expect(Buffer.from(restored.pixels.buffer).toString('hex'))
      .toBe(Buffer.from(canvas.pixels.buffer).toString('hex'))
    expect(Buffer.from(restored.timestamps.buffer).toString('hex'))
      .toBe(Buffer.from(canvas.timestamps.buffer).toString('hex'))
  })

  // -------------------------------------------------------------------------
  test('version increments only on successful writes', () => {
    expect(canvas.version).toBe(0)

    applyPixelUpdate(canvas, makeUpdate({ ts: 1.0 }))
    expect(canvas.version).toBe(1)

    // Rejected update — version should stay
    applyPixelUpdate(canvas, makeUpdate({ ts: 0.5 }))
    expect(canvas.version).toBe(1)

    applyPixelUpdate(canvas, makeUpdate({ x: 1, ts: 1.0 }))
    expect(canvas.version).toBe(2)
  })

  // -------------------------------------------------------------------------
  test('rejects out-of-bounds pixel coordinates', () => {
    const oob = makeUpdate({ x: 999, y: 0, ts: 1.0 })
    const applied = applyPixelUpdate(canvas, oob)
    expect(applied).toBe(false)
  })
})
