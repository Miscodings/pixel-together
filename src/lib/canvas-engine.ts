import type { PixelCanvas, PixelUpdate, CanvasSize } from '@/types/canvas'

// ─── RGBA packing/unpacking ────────────────────────────────────────────────

/** Pack r, g, b, a (0-255 each) into a single Uint32 (RGBA order). */
export function packRGBA(r: number, g: number, b: number, a: number): number {
  return ((r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16) | ((a & 0xff) << 24)) >>> 0
}

export function unpackRGBA(packed: number): { r: number; g: number; b: number; a: number } {
  const u = packed >>> 0
  return {
    r: u & 0xff,
    g: (u >>> 8) & 0xff,
    b: (u >>> 16) & 0xff,
    a: (u >>> 24) & 0xff,
  }
}

/** Convert a CSS hex string (#RRGGBB or #RRGGBBAA) to packed RGBA Uint32. */
export function hexToRGBA(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return packRGBA(r, g, b, 255)
  }
  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = parseInt(h.slice(6, 8), 16)
    return packRGBA(r, g, b, a)
  }
  return packRGBA(0, 0, 0, 255)
}

/** Convert packed RGBA Uint32 to a CSS hex string #RRGGBBAA. */
export function rgbaToHex(packed: number): string {
  const { r, g, b, a } = unpackRGBA(packed)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`
}

// ─── Canvas creation ───────────────────────────────────────────────────────

export function createCanvas(width: number, height: number): PixelCanvas {
  const size = width * height
  return {
    width: width as CanvasSize,
    height: height as CanvasSize,
    pixels: new Uint32Array(size),       // all transparent / black
    timestamps: new Float64Array(size),  // all 0
    version: 0,
  }
}

// ─── LWW-Register CRDT per pixel ──────────────────────────────────────────

/**
 * Apply a pixel update using LWW semantics:
 * if incoming.ts > stored ts for that pixel → apply update, else ignore.
 * Returns true if the update was applied.
 */
export function applyPixelUpdate(canvas: PixelCanvas, update: PixelUpdate): boolean {
  const { x, y, color, ts } = update
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return false
  const idx = y * canvas.width + x
  if (ts > canvas.timestamps[idx]) {
    canvas.pixels[idx] = color >>> 0
    canvas.timestamps[idx] = ts
    canvas.version += 1
    return true
  }
  return false
}

// ─── Flood fill ───────────────────────────────────────────────────────────

/**
 * Perform a 4-connected flood fill starting at (x, y).
 * Returns all PixelUpdate objects that should be broadcast and applied.
 */
export function floodFill(
  canvas: PixelCanvas,
  x: number,
  y: number,
  color: number,
  ts: number,
  userId: string,
): PixelUpdate[] {
  const { width, height, pixels } = canvas
  // Bounds-check the seed coordinate; out-of-range reads would otherwise
  // produce NaN/undefined and corrupt the fill.
  if (x < 0 || x >= width || y < 0 || y >= height) return []
  const idx = y * width + x
  const targetColor = pixels[idx] >>> 0
  const fillColor = color >>> 0

  if (targetColor === fillColor) return []

  const updates: PixelUpdate[] = []
  const visited = new Uint8Array(width * height)
  const stack: number[] = [idx]

  while (stack.length > 0) {
    const pos = stack.pop()!
    if (visited[pos]) continue
    visited[pos] = 1

    const cx = pos % width
    const cy = Math.floor(pos / width)

    if ((pixels[pos] >>> 0) !== targetColor) continue

    updates.push({ x: cx, y: cy, color: fillColor, ts, userId })

    if (cx > 0) stack.push(pos - 1)
    if (cx < width - 1) stack.push(pos + 1)
    if (cy > 0) stack.push(pos - width)
    if (cy < height - 1) stack.push(pos + width)
  }

  // Apply all at once
  const fillTs = ts
  for (const u of updates) {
    applyPixelUpdate(canvas, { ...u, ts: fillTs })
  }

  return updates
}

// ─── Serialization ────────────────────────────────────────────────────────

/** Serialize canvas pixel + timestamp buffers to base64 strings. */
export function serializeCanvas(canvas: PixelCanvas): { pixels: string; timestamps: string } {
  return {
    pixels: uint32ArrayToBase64(canvas.pixels),
    timestamps: float64ArrayToBase64(canvas.timestamps),
  }
}

/** Deserialize base64 strings back into a PixelCanvas. */
export function deserializeCanvas(
  width: number,
  height: number,
  pixels: string,
  timestamps: string,
): PixelCanvas {
  return {
    width: width as CanvasSize,
    height: height as CanvasSize,
    pixels: base64ToUint32Array(pixels, width * height),
    timestamps: base64ToFloat64Array(timestamps, width * height),
    version: 0,
  }
}

// ─── PNG Export ───────────────────────────────────────────────────────────

/**
 * Export the canvas as a PNG Blob at 1×, 4×, or 8× pixel scale.
 * Uses an OffscreenCanvas when available, falls back to a regular canvas.
 */
export function exportAsPNG(canvas: PixelCanvas, scale: 1 | 4 | 8): Blob {
  const { width, height, pixels } = canvas
  const scaledW = width * scale
  const scaledH = height * scale

  let htmlCanvas: HTMLCanvasElement
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(scaledW, scaledH)
    const ctx = offscreen.getContext('2d') as OffscreenCanvasRenderingContext2D
    ctx.imageSmoothingEnabled = false
    drawPixels(ctx as unknown as CanvasRenderingContext2D, pixels, width, height, scale)
    // OffscreenCanvas convertToBlob is async; we need sync here.
    // Fall through to HTMLCanvasElement path for sync export.
  }

  // Always use HTMLCanvasElement for sync Blob creation
  htmlCanvas = document.createElement('canvas')
  htmlCanvas.width = scaledW
  htmlCanvas.height = scaledH
  const ctx = htmlCanvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  drawPixels(ctx, pixels, width, height, scale)

  // toBlob is async; we use toDataURL and convert
  const dataURL = htmlCanvas.toDataURL('image/png')
  return dataURLToBlob(dataURL)
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function drawPixels(
  ctx: CanvasRenderingContext2D,
  pixels: Uint32Array,
  width: number,
  height: number,
  scale: number,
): void {
  const imageData = ctx.createImageData(width * scale, height * scale)
  const data = imageData.data

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const packed = pixels[py * width + px] >>> 0
      const r = packed & 0xff
      const g = (packed >>> 8) & 0xff
      const b = (packed >>> 16) & 0xff
      const a = (packed >>> 24) & 0xff

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const outX = px * scale + sx
          const outY = py * scale + sy
          const outIdx = (outY * width * scale + outX) * 4
          data[outIdx] = r
          data[outIdx + 1] = g
          data[outIdx + 2] = b
          data[outIdx + 3] = a
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

function uint32ArrayToBase64(arr: Uint32Array): string {
  const bytes = new Uint8Array(arr.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function float64ArrayToBase64(arr: Float64Array): string {
  const bytes = new Uint8Array(arr.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint32Array(b64: string, length: number): Uint32Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const result = new Uint32Array(length)
  const view = new Uint32Array(bytes.buffer)
  for (let i = 0; i < Math.min(view.length, length); i++) {
    result[i] = view[i]
  }
  return result
}

function base64ToFloat64Array(b64: string, length: number): Float64Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const result = new Float64Array(length)
  const view = new Float64Array(bytes.buffer)
  for (let i = 0; i < Math.min(view.length, length); i++) {
    result[i] = view[i]
  }
  return result
}

function dataURLToBlob(dataURL: string): Blob {
  const [header, data] = dataURL.split(',')
  const mime = header.match(/:(.*?);/)![1]
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

// ─── Lamport Clock ────────────────────────────────────────────────────────

/**
 * Lamport clock with fractional component based on clientId for tiebreaking.
 * Tick produces: Math.max(wallClock, counter) + clientFraction
 */
export class LamportClock {
  private counter: number = 0
  private clientFraction: number

  constructor(private clientId: string) {
    // Derive a stable per-client fraction 0.000–0.999 from the clientId hash
    let hash = 0
    for (let i = 0; i < clientId.length; i++) {
      hash = ((hash << 5) - hash + clientId.charCodeAt(i)) | 0
    }
    this.clientFraction = (Math.abs(hash) % 1000) / 1000000
  }

  tick(): number {
    const wall = Date.now()
    this.counter = Math.max(wall, this.counter + 1)
    return this.counter + this.clientFraction
  }

  update(received: number): void {
    const receivedBase = Math.floor(received)
    this.counter = Math.max(this.counter, receivedBase)
  }

  now(): number {
    return this.counter + this.clientFraction
  }
}
