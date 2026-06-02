'use client'

import { useRef, useState, useEffect, useCallback, type RefObject } from 'react'
import {
  createCanvas,
  applyPixelUpdate,
  serializeCanvas,
  exportAsPNG,
  hexToRGBA,
  unpackRGBA,
  packRGBA,
} from '@/lib/canvas-engine'
import { PixelTogetherWS } from '@/lib/websocket-client'
import { soundEngine } from '@/components/sound/SoundEngine'
import type {
  PixelCanvas,
  PixelUpdate,
  UserPresence,
  Tool,
  CanvasSize,
} from '@/types/canvas'

const UNDO_LIMIT = 50
const CHECKERBOARD_LIGHT = '#FFFFFF'
const CHECKERBOARD_DARK = '#CCCCCC'
const CHECKER_SIZE = 4

interface UndoEntry {
  reverts: PixelUpdate[]
}

interface UseCanvasReturn {
  canvasRef: RefObject<HTMLCanvasElement | null>
  previewRef: RefObject<HTMLCanvasElement | null>
  bgRef: RefObject<HTMLCanvasElement | null>
  activeTool: Tool
  setActiveTool: (t: Tool) => void
  activeColor: number
  setActiveColor: (c: number) => void
  zoom: number
  setZoom: (z: number) => void
  undo: () => void
  redo: () => void
  presence: UserPresence[]
  isConnected: boolean
  exportPNG: (scale: 1 | 4 | 8) => void
  clearCanvas: () => void
  canvasSize: CanvasSize
  brushSize: number
  setBrushSize: (s: number) => void
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, width: number, height: number, zoom: number) {
  const pixelSize = Math.max(zoom, 1)
  for (let py = 0; py < height / zoom; py++) {
    for (let px = 0; px < width / zoom; px++) {
      const isLight = (px + py) % 2 === 0
      ctx.fillStyle = isLight ? CHECKERBOARD_LIGHT : CHECKERBOARD_DARK
      ctx.fillRect(px * pixelSize, py * pixelSize, pixelSize, pixelSize)
    }
  }
}

function renderPixelCanvas(
  ctx: CanvasRenderingContext2D,
  pixelCanvas: PixelCanvas,
  zoom: number,
) {
  const { width, height, pixels } = pixelCanvas

  // Build 1x ImageData then scale up via drawImage for crisp pixel rendering
  const imageData = ctx.createImageData(width, height)
  const data = imageData.data

  for (let i = 0; i < pixels.length; i++) {
    const packed = pixels[i] >>> 0
    data[i * 4]     = packed & 0xff
    data[i * 4 + 1] = (packed >>> 8) & 0xff
    data[i * 4 + 2] = (packed >>> 16) & 0xff
    data[i * 4 + 3] = (packed >>> 24) & 0xff
  }

  // Draw into a temp canvas at 1x then scale to zoom×zoom per pixel
  const tmp = document.createElement('canvas')
  tmp.width = width
  tmp.height = height
  const tmpCtx = tmp.getContext('2d')!
  tmpCtx.putImageData(imageData, 0, 0)

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tmp, 0, 0, width, height, 0, 0, width * zoom, height * zoom)
}

export function useCanvas(
  roomId: string,
  roomCode: string,
  userId: string,
  username: string,
  initialWidth: CanvasSize = 32,
  initialHeight: CanvasSize = 32,
): UseCanvasReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const bgRef = useRef<HTMLCanvasElement | null>(null)

  const pixelCanvasRef = useRef<PixelCanvas>(createCanvas(initialWidth, initialHeight))
  const wsRef = useRef<PixelTogetherWS | null>(null)

  const [activeTool, setActiveTool] = useState<Tool>('pencil')
  const [activeColor, setActiveColor] = useState<number>(hexToRGBA('#7C5CBF'))
  const [zoom, setZoomState] = useState<number>(8)
  const [presence, setPresence] = useState<UserPresence[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [canvasSize] = useState<CanvasSize>(initialWidth)
  const [brushSize, setBrushSize] = useState(1)
  const pendingRedrawRef = useRef(false)

  // undo/redo stacks
  const undoStackRef = useRef<UndoEntry[]>([])
  const redoStackRef = useRef<UndoEntry[]>([])

  // Stroke tracking (for undo grouping)
  const strokeRef = useRef<PixelUpdate[]>([])
  const isDrawingRef = useRef(false)
  const lastPixelRef = useRef<{ x: number; y: number } | null>(null)

  // ─── Canvas rendering ────────────────────────────────────────────────────

  const zoomRef = useRef(8)

  const redrawMainCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    renderPixelCanvas(ctx, pixelCanvasRef.current, zoomRef.current)
  }, [])

  // Batched redraw — coalesces rapid incoming pixel updates into one rAF paint
  const scheduleRedraw = useCallback(() => {
    if (pendingRedrawRef.current) return
    pendingRedrawRef.current = true
    requestAnimationFrame(() => {
      pendingRedrawRef.current = false
      redrawMainCanvas()
    })
  }, [redrawMainCanvas])

  const redrawBackground = useCallback(() => {
    const bg = bgRef.current
    if (!bg) return
    const ctx = bg.getContext('2d')
    if (!ctx) return
    drawCheckerboard(ctx, bg.width, bg.height, zoomRef.current)
  }, [])

  // ─── Zoom ───────────────────────────────────────────────────────────────

  const setZoom = useCallback((z: number) => {
    const clamped = Math.max(1, Math.min(32, z))
    zoomRef.current = clamped
    setZoomState(clamped)
  }, [])

  // ─── Pixel drawing helpers ───────────────────────────────────────────────

  const getPixelCoords = useCallback(
    (e: MouseEvent, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect()
      // canvas.width = logicalW * zoom; divide raw coords by zoom to get logical pixel
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const rawX = (e.clientX - rect.left) * scaleX
      const rawY = (e.clientY - rect.top) * scaleY
      const z = zoomRef.current
      return {
        x: Math.floor(rawX / z),
        y: Math.floor(rawY / z),
      }
    },
    [],
  )

  const drawPreviewPixel = useCallback(
    (x: number, y: number, color: number) => {
      const preview = previewRef.current
      if (!preview) return
      const ctx = preview.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = false
      const { r, g, b, a } = unpackRGBA(color)
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`
      const z = zoomRef.current
      ctx.fillRect(x * z, y * z, z, z)
    },
    [],
  )

  const clearPreview = useCallback(() => {
    const preview = previewRef.current
    if (!preview) return
    const ctx = preview.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, preview.width, preview.height)
  }, [])

  const commitPixel = useCallback(
    (x: number, y: number, color: number) => {
      const pc = pixelCanvasRef.current
      if (!wsRef.current) return
      const ws = wsRef.current

      if (brushSize === 1) {
        // Original single-pixel behavior
        const ts = ws.tick()
        const prevColor = pc.pixels[y * pc.width + x] >>> 0
        const prevTs = pc.timestamps[y * pc.width + x]
        const update: PixelUpdate = { x, y, color, ts, userId }
        const applied = applyPixelUpdate(pc, update)
        if (applied) {
          strokeRef.current.push({ x, y, color: prevColor, ts: prevTs, userId })
          ws.sendPixel(x, y, color, ts)
          redrawMainCanvas()
          soundEngine.playPixelTick()
        }
        return
      }

      // Multi-pixel brush
      const half = Math.floor(brushSize / 2)
      const ts = ws.tick()
      const batchPixels: { x: number; y: number; color: number; ts: number }[] = []

      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const px = x + dx, py = y + dy
          if (px < 0 || px >= pc.width || py < 0 || py >= pc.height) continue
          const idx = py * pc.width + px
          const prevColor = pc.pixels[idx] >>> 0
          const prevTs = pc.timestamps[idx]
          strokeRef.current.push({ x: px, y: py, color: prevColor, ts: prevTs, userId })
          pc.pixels[idx] = color >>> 0
          pc.timestamps[idx] = ts
          batchPixels.push({ x: px, y: py, color, ts })
        }
      }
      pc.version++
      if (batchPixels.length > 0) {
        ws.sendBatch(batchPixels)
        redrawMainCanvas()
        soundEngine.playPixelTick()
      }
    },
    [userId, brushSize, redrawMainCanvas],
  )

  // ─── Tool handlers ───────────────────────────────────────────────────────

  const handleToolAction = useCallback(
    (x: number, y: number, tool: Tool, color: number) => {
      const pc = pixelCanvasRef.current
      if (x < 0 || x >= pc.width || y < 0 || y >= pc.height) return

      switch (tool) {
        case 'pencil': {
          commitPixel(x, y, color)
          break
        }
        case 'eraser': {
          commitPixel(x, y, packRGBA(0, 0, 0, 0))
          break
        }
        case 'fill': {
          const targetColor = pc.pixels[y * pc.width + x] >>> 0
          const fillColor = color >>> 0
          if (targetColor === fillColor || x < 0 || x >= pc.width || y < 0 || y >= pc.height) break

          // BFS to find fill region
          const visited = new Uint8Array(pc.width * pc.height)
          const fillArea: { x: number; y: number }[] = []
          const stack = [y * pc.width + x]
          while (stack.length > 0) {
            const pos = stack.pop()!
            if (visited[pos]) continue
            visited[pos] = 1
            if ((pc.pixels[pos] >>> 0) !== targetColor) continue
            const fx = pos % pc.width
            const fy = Math.floor(pos / pc.width)
            fillArea.push({ x: fx, y: fy })
            if (fx > 0) stack.push(pos - 1)
            if (fx < pc.width - 1) stack.push(pos + 1)
            if (fy > 0) stack.push(pos - pc.width)
            if (fy < pc.height - 1) stack.push(pos + pc.width)
          }
          if (fillArea.length === 0) break

          // Capture originals BEFORE applying
          const reverts: PixelUpdate[] = fillArea.map(({ x: fx, y: fy }) => ({
            x: fx, y: fy,
            color: pc.pixels[fy * pc.width + fx] >>> 0,
            ts: pc.timestamps[fy * pc.width + fx],
            userId,
          }))

          // Apply locally — bypass CRDT; BFS already identified the correct region
          const fillTs = Date.now()
          for (const { x: fx, y: fy } of fillArea) {
            const idx = fy * pc.width + fx
            pc.pixels[idx] = fillColor >>> 0
            pc.timestamps[idx] = fillTs
          }
          pc.version++

          undoStackRef.current.push({ reverts })
          if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift()
          redoStackRef.current = []

          wsRef.current?.sendFill(fillArea.map(({ x: fx, y: fy }) => ({ x: fx, y: fy, color: fillColor })), targetColor)
          redrawMainCanvas()
          soundEngine.playFillWhoosh()
          break
        }
        case 'eyedropper': {
          const picked = pc.pixels[y * pc.width + x] >>> 0
          setActiveColor(picked)
          break
        }
        default:
          break
      }
    },
    [userId, commitPixel, redrawMainCanvas],
  )

  // ─── Mouse event bindings ─────────────────────────────────────────────────

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const { x, y } = getPixelCoords(e, preview)
      isDrawingRef.current = true
      strokeRef.current = []
      lastPixelRef.current = { x, y }

      if (activeTool === 'zoomin') { setZoom(zoom + 1); return }
      if (activeTool === 'zoomout') { setZoom(zoom - 1); return }

      handleToolAction(x, y, activeTool, activeColor)
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDrawingRef.current) return
      const { x, y } = getPixelCoords(e, preview)
      const last = lastPixelRef.current
      if (last && last.x === x && last.y === y) return
      lastPixelRef.current = { x, y }

      if (activeTool === 'pencil' || activeTool === 'eraser') {
        const color = activeTool === 'eraser' ? packRGBA(0, 0, 0, 0) : activeColor
        drawPreviewPixel(x, y, color)
        handleToolAction(x, y, activeTool, activeColor)
        wsRef.current?.sendCursor(x, y)
      }
    }

    const onMouseUp = () => {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      clearPreview()

      if (strokeRef.current.length > 0) {
        undoStackRef.current.push({ reverts: [...strokeRef.current] })
        if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift()
        redoStackRef.current = []
        strokeRef.current = []
      }
    }

    const onMouseLeave = () => {
      clearPreview()
    }

    preview.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    preview.addEventListener('mouseleave', onMouseLeave)

    return () => {
      preview.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      preview.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [activeTool, activeColor, zoom, getPixelCoords, drawPreviewPixel, clearPreview, handleToolAction, setZoom])

  // ─── WebSocket setup ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !userId) return

    // Delay connection so Next.js streaming mount/unmount cycles settle first
    let ws: PixelTogetherWS | null = null
    const timer = setTimeout(() => {
      ws = new PixelTogetherWS()
      wsRef.current = ws

      ws.onConnected = () => setIsConnected(true)
      ws.onDisconnected = () => setIsConnected(false)

      ws.onCanvasSync = (syncedCanvas: PixelCanvas) => {
        pixelCanvasRef.current = syncedCanvas
        redrawMainCanvas()
      }

      ws.onPixelUpdate = (update: PixelUpdate) => {
        applyPixelUpdate(pixelCanvasRef.current, update)
        scheduleRedraw()
      }

      ws.onPresenceUpdate = (users: UserPresence[]) => {
        setPresence(users.filter((u) => u.userId !== userId))
      }

      ws.onUserJoin = (user: UserPresence) => {
        setPresence((prev) => {
          if (prev.some((u) => u.userId === user.userId)) return prev
          return [...prev, user]
        })
      }

      ws.onUserLeave = (leavingUserId: string) => {
        setPresence((prev) => prev.filter((u) => u.userId !== leavingUserId))
      }

      ws.onClear = (ts: number) => {
        const pc = pixelCanvasRef.current
        pc.pixels.fill(0)
        pc.timestamps.fill(ts)
        pc.version++
        redrawMainCanvas()
      }

      ws.connect(
        roomId,
        roomCode,
        userId,
        username,
        pixelCanvasRef.current.width,
        pixelCanvasRef.current.height,
        pixelCanvasRef.current.version,
      )
    }, 300)

    return () => {
      clearTimeout(timer)
      ws?.disconnect()
      wsRef.current = null
    }
  }, [roomId, roomCode, userId, username, redrawMainCanvas, scheduleRedraw])

  // ─── Re-render on zoom change ────────────────────────────────────────────

  useEffect(() => {
    redrawBackground()
    redrawMainCanvas()
  }, [zoom, redrawBackground, redrawMainCanvas])

  // ─── Undo / Redo ──────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop()
    if (!entry) return

    const pc = pixelCanvasRef.current
    const reapplyReverts: PixelUpdate[] = []

    for (const revert of entry.reverts) {
      const currentColor = pc.pixels[revert.y * pc.width + revert.x] >>> 0
      const currentTs = pc.timestamps[revert.y * pc.width + revert.x]
      reapplyReverts.push({ x: revert.x, y: revert.y, color: currentColor, ts: currentTs, userId })

      // Force apply the revert (bypass LWW with slightly older ts)
      pc.pixels[revert.y * pc.width + revert.x] = revert.color >>> 0
      pc.timestamps[revert.y * pc.width + revert.x] = revert.ts
    }

    redoStackRef.current.push({ reverts: reapplyReverts })
    wsRef.current?.sendUndo(entry.reverts)
    redrawMainCanvas()
    soundEngine.playUndo()
  }, [userId, redrawMainCanvas])

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop()
    if (!entry) return

    const pc = pixelCanvasRef.current
    const newReverts: PixelUpdate[] = []

    for (const rev of entry.reverts) {
      const currentColor = pc.pixels[rev.y * pc.width + rev.x] >>> 0
      const currentTs = pc.timestamps[rev.y * pc.width + rev.x]
      newReverts.push({ x: rev.x, y: rev.y, color: currentColor, ts: currentTs, userId })

      pc.pixels[rev.y * pc.width + rev.x] = rev.color >>> 0
      pc.timestamps[rev.y * pc.width + rev.x] = rev.ts
    }

    undoStackRef.current.push({ reverts: newReverts })
    wsRef.current?.sendUndo(entry.reverts)
    redrawMainCanvas()
    soundEngine.playUndo()
  }, [userId, redrawMainCanvas])

  // ─── Export ───────────────────────────────────────────────────────────────

  const exportPNG = useCallback(
    (scale: 1 | 4 | 8) => {
      const { width, height, pixels } = pixelCanvasRef.current
      const scaledW = width * scale
      const scaledH = height * scale
      const htmlCanvas = document.createElement('canvas')
      htmlCanvas.width = scaledW
      htmlCanvas.height = scaledH
      const ctx = htmlCanvas.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      // Draw each pixel as a scaled rect
      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const color = pixels[py * width + px] >>> 0
          if (color === 0) continue
          const r = (color >>> 24) & 0xff
          const g = (color >>> 16) & 0xff
          const b = (color >>> 8) & 0xff
          const a = (color & 0xff) / 255
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`
          ctx.fillRect(px * scale, py * scale, scale, scale)
        }
      }
      htmlCanvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `pixeltogether-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 2000)
      }, 'image/png')
    },
    [],
  )

  // ─── Clear ────────────────────────────────────────────────────────────────

  const clearCanvas = useCallback(() => {
    if (!window.confirm('Clear the canvas? This cannot be undone.')) return
    const pc = pixelCanvasRef.current
    const { width, height } = pc

    const reverts: PixelUpdate[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        const prevColor = pc.pixels[idx] >>> 0
        const prevTs = pc.timestamps[idx]
        if (prevColor !== 0) {
          reverts.push({ x, y, color: prevColor, ts: prevTs, userId })
        }
      }
    }

    const ts = Date.now()
    pc.pixels.fill(0)
    pc.timestamps.fill(ts)
    pc.version++

    undoStackRef.current.push({ reverts })
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift()

    wsRef.current?.sendClear()

    redrawMainCanvas()
  }, [userId, redrawMainCanvas])

  return {
    canvasRef,
    previewRef,
    bgRef,
    activeTool,
    setActiveTool,
    activeColor,
    setActiveColor,
    zoom,
    setZoom,
    undo,
    redo,
    presence,
    isConnected,
    exportPNG,
    clearCanvas,
    canvasSize,
    brushSize,
    setBrushSize,
  }
}
