// Pure CRDT logic: Last-Write-Wins Register per pixel
// Conflict resolution: higher timestamp wins; on tie, higher userId (lexicographic) wins

export type CanvasSize = 16 | 32 | 64

export interface PixelCanvas {
  width: CanvasSize
  height: CanvasSize
  pixels: Uint32Array      // RGBA packed, one per pixel
  timestamps: Float64Array // Lamport clock per pixel
  version: number
}

export interface PixelUpdate {
  x: number
  y: number
  color: number   // RGBA packed as Uint32
  ts: number      // Lamport timestamp
  userId: string
}

/**
 * Apply a LWW pixel update to the canvas.
 * Returns true if the update was applied (winner), false if rejected (stale).
 * Tie-breaking: higher userId (lexicographic) wins when timestamps are equal.
 */
export function applyPixelUpdate(canvas: PixelCanvas, update: PixelUpdate): boolean {
  const idx = update.y * canvas.width + update.x

  if (idx < 0 || idx >= canvas.pixels.length) {
    return false
  }

  const existingTs = canvas.timestamps[idx]

  if (update.ts > existingTs) {
    canvas.pixels[idx] = update.color
    canvas.timestamps[idx] = update.ts
    canvas.version++
    return true
  }

  // Tie-breaking by userId (lexicographic comparison)
  if (update.ts === existingTs) {
    const tiebreakId = (canvas as PixelCanvasWithTiebreak)._tiebreakIds?.[idx] ?? ''
    if (update.userId > tiebreakId) {
      canvas.pixels[idx] = update.color
      canvas.timestamps[idx] = update.ts
      canvas.version++
      ;(canvas as PixelCanvasWithTiebreak)._tiebreakIds ??= new Array(canvas.pixels.length).fill('')
      ;(canvas as PixelCanvasWithTiebreak)._tiebreakIds![idx] = update.userId
      return true
    }
  }

  return false
}

// Internal extended type for tie-break tracking (not serialized)
interface PixelCanvasWithTiebreak extends PixelCanvas {
  _tiebreakIds?: string[]
}

/**
 * Create a blank canvas of the given dimensions.
 */
export function createCanvas(width: CanvasSize, height: CanvasSize): PixelCanvas {
  const size = width * height
  return {
    width,
    height,
    pixels: new Uint32Array(size),       // all zeroes = transparent black
    timestamps: new Float64Array(size),  // all zeroes = epoch
    version: 0,
  }
}

/**
 * Serialize canvas arrays to base64 strings for transmission / DB storage.
 */
export function serializeCanvas(canvas: PixelCanvas): { pixels: string; timestamps: string } {
  return {
    pixels: Buffer.from(canvas.pixels.buffer).toString('base64'),
    timestamps: Buffer.from(canvas.timestamps.buffer).toString('base64'),
  }
}

/**
 * Deserialize base64 strings back into a PixelCanvas.
 * Version starts at 0 — the caller is responsible for setting the correct version.
 */
export function deserializeCanvas(
  width: CanvasSize,
  height: CanvasSize,
  pixels: string,
  timestamps: string,
): PixelCanvas {
  // Buffer.from(base64) may share a pooled ArrayBuffer with byteOffset > 0.
  // Read via view (byteOffset-aware), then copy into fresh own-buffer arrays.
  // This ensures `.buffer` always refers to only this canvas's data.
  const pixBuf = Buffer.from(pixels, 'base64')
  const tsBuf = Buffer.from(timestamps, 'base64')

  const pixelCount = width * height
  const pixelArray = new Uint32Array(pixelCount)
  const tsArray = new Float64Array(pixelCount)

  pixelArray.set(new Uint32Array(pixBuf.buffer, pixBuf.byteOffset, pixBuf.byteLength / 4))
  tsArray.set(new Float64Array(tsBuf.buffer, tsBuf.byteOffset, tsBuf.byteLength / 8))

  return {
    width,
    height,
    pixels: pixelArray,
    timestamps: tsArray,
    version: 0,
  }
}
