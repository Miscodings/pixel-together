import {
  packRGBA,
  unpackRGBA,
  hexToRGBA,
  rgbaToHex,
  createCanvas,
  applyPixelUpdate,
  floodFill,
  serializeCanvas,
  deserializeCanvas,
  LamportClock,
} from '../canvas-engine'

// ─── RGBA packing ─────────────────────────────────────────────────────────────

describe('packRGBA / unpackRGBA', () => {
  test('packs and unpacks opaque red', () => {
    const packed = packRGBA(255, 0, 0, 255)
    const { r, g, b, a } = unpackRGBA(packed)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
    expect(a).toBe(255)
  })

  test('packs and unpacks transparent green', () => {
    const packed = packRGBA(0, 128, 0, 0)
    const { r, g, b, a } = unpackRGBA(packed)
    expect(r).toBe(0)
    expect(g).toBe(128)
    expect(b).toBe(0)
    expect(a).toBe(0)
  })

  test('packs and unpacks white', () => {
    const packed = packRGBA(255, 255, 255, 255)
    const { r, g, b, a } = unpackRGBA(packed)
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(255)
    expect(a).toBe(255)
  })

  test('packs and unpacks arbitrary values', () => {
    const packed = packRGBA(42, 84, 168, 200)
    const { r, g, b, a } = unpackRGBA(packed)
    expect(r).toBe(42)
    expect(g).toBe(84)
    expect(b).toBe(168)
    expect(a).toBe(200)
  })

  test('masks overflow values to 8 bits', () => {
    const packed = packRGBA(256, -1, 300, 255)
    const { r, g, b } = unpackRGBA(packed)
    expect(r).toBe(0)  // 256 & 0xff = 0
    expect(g).toBe(255) // -1 & 0xff = 255
    expect(b).toBe(44) // 300 & 0xff = 44
  })
})

describe('hexToRGBA / rgbaToHex', () => {
  test('converts #RRGGBB to packed RGBA', () => {
    const packed = hexToRGBA('#FF0000')
    const { r, g, b, a } = unpackRGBA(packed)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
    expect(a).toBe(255)
  })

  test('converts #RRGGBBAA to packed RGBA', () => {
    const packed = hexToRGBA('#52B78880')
    const { r, g, b, a } = unpackRGBA(packed)
    expect(r).toBe(0x52)
    expect(g).toBe(0xB7)
    expect(b).toBe(0x88)
    expect(a).toBe(0x80)
  })

  test('converts the PixelTogether primary purple correctly', () => {
    const packed = hexToRGBA('#7C5CBF')
    const { r, g, b, a } = unpackRGBA(packed)
    expect(r).toBe(0x7C)
    expect(g).toBe(0x5C)
    expect(b).toBe(0xBF)
    expect(a).toBe(255)
  })

  test('roundtrips hex through pack/unpack', () => {
    const original = '#F4A261FF'
    const packed = hexToRGBA(original)
    const back = rgbaToHex(packed)
    expect(back.toLowerCase()).toBe(original.toLowerCase())
  })

  test('falls back to opaque black for invalid hex', () => {
    const packed = hexToRGBA('#ZZZ')
    expect(packed >>> 0).toBe(packRGBA(0, 0, 0, 255))
  })
})

// ─── Canvas creation ──────────────────────────────────────────────────────────

describe('createCanvas', () => {
  test('creates a canvas with correct dimensions', () => {
    const c = createCanvas(16, 16)
    expect(c.width).toBe(16)
    expect(c.height).toBe(16)
    expect(c.pixels.length).toBe(256)
    expect(c.timestamps.length).toBe(256)
  })

  test('initialises all pixels to zero (transparent black)', () => {
    const c = createCanvas(32, 32)
    expect(Array.from(c.pixels).every((v) => v === 0)).toBe(true)
  })

  test('initialises all timestamps to zero', () => {
    const c = createCanvas(64, 64)
    expect(Array.from(c.timestamps).every((t) => t === 0)).toBe(true)
  })

  test('starts at version 0', () => {
    expect(createCanvas(16, 16).version).toBe(0)
  })
})

// ─── LWW-Register CRDT ────────────────────────────────────────────────────────

describe('applyPixelUpdate (LWW)', () => {
  test('applies an update with a higher timestamp', () => {
    const c = createCanvas(16, 16)
    const applied = applyPixelUpdate(c, { x: 0, y: 0, color: 0xFF0000FF, ts: 100, userId: 'u1' })
    expect(applied).toBe(true)
    expect(c.pixels[0]).toBe(0xFF0000FF >>> 0)
    expect(c.timestamps[0]).toBe(100)
  })

  test('rejects an update with a lower timestamp', () => {
    const c = createCanvas(16, 16)
    applyPixelUpdate(c, { x: 0, y: 0, color: 0xFF0000FF, ts: 100, userId: 'u1' })
    const applied = applyPixelUpdate(c, { x: 0, y: 0, color: 0x00FF00FF, ts: 50, userId: 'u2' })
    expect(applied).toBe(false)
    expect(c.pixels[0]).toBe(0xFF0000FF >>> 0) // original wins
  })

  test('applies an update with the same timestamp (ts strictly greater required)', () => {
    const c = createCanvas(16, 16)
    applyPixelUpdate(c, { x: 0, y: 0, color: 0xFF0000FF, ts: 100, userId: 'u1' })
    // ts === stored ts → not strictly greater → reject
    const applied = applyPixelUpdate(c, { x: 0, y: 0, color: 0x00FF00FF, ts: 100, userId: 'u2' })
    expect(applied).toBe(false)
    expect(c.pixels[0]).toBe(0xFF0000FF >>> 0)
  })

  test('increments canvas version on successful apply', () => {
    const c = createCanvas(16, 16)
    applyPixelUpdate(c, { x: 0, y: 0, color: 0xFF0000FF, ts: 100, userId: 'u1' })
    expect(c.version).toBe(1)
    applyPixelUpdate(c, { x: 1, y: 0, color: 0x00FF00FF, ts: 100, userId: 'u2' })
    expect(c.version).toBe(2)
  })

  test('does not increment version on rejected update', () => {
    const c = createCanvas(16, 16)
    applyPixelUpdate(c, { x: 0, y: 0, color: 0xFF0000FF, ts: 100, userId: 'u1' })
    applyPixelUpdate(c, { x: 0, y: 0, color: 0x00FF00FF, ts: 50, userId: 'u2' })
    expect(c.version).toBe(1) // only the first apply counted
  })

  test('rejects out-of-bounds coordinates', () => {
    const c = createCanvas(16, 16)
    expect(applyPixelUpdate(c, { x: 16, y: 0, color: 0xFF0000FF, ts: 1, userId: 'u1' })).toBe(false)
    expect(applyPixelUpdate(c, { x: 0, y: 16, color: 0xFF0000FF, ts: 1, userId: 'u1' })).toBe(false)
    expect(applyPixelUpdate(c, { x: -1, y: 0, color: 0xFF0000FF, ts: 1, userId: 'u1' })).toBe(false)
  })

  test('concurrent edits to different pixels apply independently', () => {
    const c = createCanvas(16, 16)
    applyPixelUpdate(c, { x: 0, y: 0, color: 0xFF0000FF, ts: 100, userId: 'u1' })
    applyPixelUpdate(c, { x: 1, y: 0, color: 0x00FF00FF, ts: 100, userId: 'u2' })
    expect(c.pixels[0]).toBe(0xFF0000FF >>> 0)
    expect(c.pixels[1]).toBe(0x00FF00FF >>> 0)
  })
})

// ─── Flood fill ───────────────────────────────────────────────────────────────

describe('floodFill', () => {
  test('fills a uniform region', () => {
    const c = createCanvas(4, 4)
    const updates = floodFill(c, 0, 0, 0xFF0000FF, 1, 'u1')
    // All 16 pixels should be filled (they were all 0)
    expect(updates.length).toBe(16)
    expect(Array.from(c.pixels).every((v) => (v >>> 0) === (0xFF0000FF >>> 0))).toBe(true)
  })

  test('stops at pixels with a different color', () => {
    const c = createCanvas(4, 4)
    // Paint a border of green around the outside
    applyPixelUpdate(c, { x: 0, y: 0, color: 0x00FF00FF, ts: 1, userId: 'u0' })
    applyPixelUpdate(c, { x: 3, y: 0, color: 0x00FF00FF, ts: 1, userId: 'u0' })
    applyPixelUpdate(c, { x: 0, y: 3, color: 0x00FF00FF, ts: 1, userId: 'u0' })
    applyPixelUpdate(c, { x: 3, y: 3, color: 0x00FF00FF, ts: 1, userId: 'u0' })

    // Fill from center with red — should not cross green pixels
    const updates = floodFill(c, 1, 1, 0xFF0000FF, 2, 'u1')
    expect(updates.length).toBeLessThan(16)
  })

  test('returns empty array when fill color equals target color', () => {
    const c = createCanvas(4, 4)
    applyPixelUpdate(c, { x: 0, y: 0, color: 0xFF0000FF, ts: 1, userId: 'u0' })
    const updates = floodFill(c, 0, 0, 0xFF0000FF, 2, 'u1')
    expect(updates).toHaveLength(0)
  })

  test('produces correct update coordinates', () => {
    const c = createCanvas(4, 4)
    const updates = floodFill(c, 0, 0, 0xFF0000FF, 1, 'u1')
    const coords = updates.map((u) => `${u.x},${u.y}`).sort()
    const expected: string[] = []
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++)
        expected.push(`${x},${y}`)
    expect(coords).toEqual(expected.sort())
  })
})

// ─── Serialization ────────────────────────────────────────────────────────────

describe('serializeCanvas / deserializeCanvas', () => {
  test('roundtrip is lossless for pixels', () => {
    const c = createCanvas(16, 16)
    applyPixelUpdate(c, { x: 0, y: 0, color: 0xFF0000FF, ts: 1, userId: 'u1' })
    applyPixelUpdate(c, { x: 5, y: 7, color: 0x7C5CBFFF, ts: 2, userId: 'u1' })

    const { pixels, timestamps } = serializeCanvas(c)
    const restored = deserializeCanvas(16, 16, pixels, timestamps)

    expect(restored.pixels[0]).toBe(c.pixels[0])
    expect(restored.pixels[5 + 7 * 16]).toBe(c.pixels[5 + 7 * 16])
  })

  test('roundtrip is lossless for timestamps', () => {
    const c = createCanvas(16, 16)
    applyPixelUpdate(c, { x: 3, y: 4, color: 0x52B788FF, ts: 1748823847.293, userId: 'u1' })

    const { pixels, timestamps } = serializeCanvas(c)
    const restored = deserializeCanvas(16, 16, pixels, timestamps)

    // Float64 roundtrip — should be exact
    expect(restored.timestamps[3 + 4 * 16]).toBe(1748823847.293)
  })

  test('produces non-empty base64 strings', () => {
    const c = createCanvas(32, 32)
    const { pixels, timestamps } = serializeCanvas(c)
    expect(pixels.length).toBeGreaterThan(0)
    expect(timestamps.length).toBeGreaterThan(0)
  })

  test('deserialized canvas has correct dimensions', () => {
    const c = createCanvas(64, 64)
    const { pixels, timestamps } = serializeCanvas(c)
    const restored = deserializeCanvas(64, 64, pixels, timestamps)
    expect(restored.width).toBe(64)
    expect(restored.height).toBe(64)
    expect(restored.pixels.length).toBe(64 * 64)
  })
})

// ─── Lamport clock ────────────────────────────────────────────────────────────

describe('LamportClock', () => {
  test('tick returns a monotonically increasing value', () => {
    const clock = new LamportClock('user1')
    const t1 = clock.tick()
    const t2 = clock.tick()
    const t3 = clock.tick()
    expect(t2).toBeGreaterThan(t1)
    expect(t3).toBeGreaterThan(t2)
  })

  test('update advances counter to at least the received value', () => {
    const clock = new LamportClock('user1')
    clock.update(9999999999)
    const next = clock.tick()
    expect(next).toBeGreaterThanOrEqual(9999999999)
  })

  test('different clients get different fractional parts', () => {
    const c1 = new LamportClock('user-alpha')
    const c2 = new LamportClock('user-beta')
    const frac1 = c1.now() % 1
    const frac2 = c2.now() % 1
    // Could theoretically collide but shouldn't with different IDs
    expect(frac1).not.toBe(frac2)
  })

  test('tick is always based on wall clock (no drift below real time)', () => {
    const clock = new LamportClock('test')
    const wallBefore = Date.now()
    const t = clock.tick()
    const wallAfter = Date.now()
    const base = Math.floor(t)
    expect(base).toBeGreaterThanOrEqual(wallBefore)
    expect(base).toBeLessThanOrEqual(wallAfter + 1)
  })
})
