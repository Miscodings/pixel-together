'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import {
  Download,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Users,
  Copy,
  Check,
} from 'lucide-react'
import { useCanvas } from '@/hooks/useCanvas'
import { LeftToolbar } from './LeftToolbar'
import { HSBColorPicker } from './HSBColorPicker'
import { PalettePanel } from './PalettePanel'
import { HotkeyPanel } from './HotkeyPanel'
import { CollabCursor } from './CollabCursor'
import { UsersPanel } from './UsersPanel'
import { soundEngine } from '@/components/sound/SoundEngine'
import type { CanvasSize } from '@/types/canvas'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

interface CanvasWorkspaceProps {
  roomCode: string
  roomId: string
  userId: string
  username: string
  canvasWidth: CanvasSize
  canvasHeight: CanvasSize
  initialName?: string
}

export function CanvasWorkspace({
  roomCode,
  roomId,
  userId,
  username,
  canvasWidth,
  canvasHeight,
  initialName = 'Untitled Canvas',
}: CanvasWorkspaceProps) {
  const shouldReduce = useReducedMotion()
  const [muted, setMuted] = useState(soundEngine.isMuted())
  const [canvasName, setCanvasName] = useState(initialName)
  const [editingName, setEditingName] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const canvasAreaRef = useRef<HTMLDivElement | null>(null)

  // Shared hex state so HSBColorPicker and PalettePanel stay in sync
  const [syncHex, setSyncHex] = useState<string>('')
  const [showPanels, setShowPanels] = useState(true)

  const {
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
    brushSize,
    setBrushSize,
  } = useCanvas(roomId, roomCode, userId, username, canvasWidth, canvasHeight)

  const pixelW = canvasWidth * zoom
  const pixelH = canvasHeight * zoom

  // Set canvas element sizes whenever zoom changes
  useEffect(() => {
    const setSize = (canvas: HTMLCanvasElement | null, w: number, h: number) => {
      if (!canvas) return
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
    }
    setSize(bgRef.current, pixelW, pixelH)
    setSize(canvasRef.current, pixelW, pixelH)
    setSize(previewRef.current, pixelW, pixelH)
  }, [pixelW, pixelH, bgRef, canvasRef, previewRef])

  // Initialize sound engine on mount and sync muted state
  useEffect(() => {
    soundEngine.init()
    setMuted(soundEngine.isMuted())
  }, [])

  // Mute toggle
  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    soundEngine.setMuted(next)
    if (next === false) {
      import('tone').then((Tone) => Tone.start())
    }
  }, [muted])

  // Copy room code
  const copyRoomCode = useCallback(async () => {
    await navigator.clipboard.writeText(roomCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }, [roomCode])

  // Scroll-wheel zoom via non-passive listener
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => {
    const el = canvasAreaRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(Math.max(1, Math.min(32, zoomRef.current + (e.deltaY < 0 ? 1 : -1))))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [setZoom])

  // Name editing
  const commitName = useCallback(() => {
    setEditingName(false)
  }, [])

  // Export menu click outside
  useEffect(() => {
    if (!exportMenuOpen) return
    const h = () => setExportMenuOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [exportMenuOpen])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if (e.key === '+' || e.key === '=') setZoom(Math.min(32, zoom + 1))
      if (e.key === '-') setZoom(Math.max(1, zoom - 1))
      // Tool shortcuts — both lower and upper case
      if (e.key === 'b' || e.key === 'B') setActiveTool('pencil')
      if (e.key === 'e' || e.key === 'E') setActiveTool('eraser')
      if (e.key === 'g' || e.key === 'G') setActiveTool('fill')
      if (e.key === 'i' || e.key === 'I') setActiveTool('eyedropper')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, zoom, setZoom, setActiveTool])

  return (
    <div
      className="canvas-bg"
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ─── Top Bar ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={shouldReduce ? false : { y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          backgroundColor: 'var(--card)',
          borderBottom: '2px solid var(--border)',
          zIndex: 30,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {/* Wordmark */}
        <Link
          href="/"
          className="wordmark"
          style={{ fontSize: '18px', color: 'var(--primary)', textDecoration: 'none', cursor: 'pointer' }}
        >
          PT
        </Link>

        {/* Canvas name */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={canvasName}
            onChange={(e) => setCanvasName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName() }}
            autoFocus
            style={{
              fontSize: '14px',
              fontWeight: 700,
              border: '2px solid var(--primary)',
              borderRadius: '8px',
              padding: '4px 8px',
              outline: 'none',
              fontFamily: 'Nunito, sans-serif',
              backgroundColor: 'var(--muted)',
              color: 'var(--foreground)',
            }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            style={{
              fontSize: '14px',
              fontWeight: 700,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--foreground)',
              fontFamily: 'Nunito, sans-serif',
              padding: '4px 8px',
              borderRadius: '8px',
            }}
            title="Click to rename"
          >
            {canvasName}
          </button>
        )}

        {/* Connection status */}
        <div
          style={{
            width: '8px', height: '8px',
            borderRadius: '50%',
            backgroundColor: isConnected ? 'var(--accent)' : 'var(--destructive)',
            flexShrink: 0,
          }}
          title={isConnected ? 'Connected' : 'Disconnected'}
        />

        <div style={{ flex: 1 }} />

        {/* Collaborator avatars */}
        {presence.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Users size={14} color="var(--muted-foreground)" />
            <div style={{ display: 'flex', marginLeft: '4px' }}>
              {presence.slice(0, 5).map((user) => (
                <div
                  key={user.userId}
                  title={user.username}
                  style={{
                    width: '28px', height: '28px',
                    borderRadius: '50%',
                    backgroundColor: user.color,
                    border: '2px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#fff',
                    marginLeft: '-8px',
                    fontFamily: 'Nunito, sans-serif',
                  }}
                >
                  {user.username.charAt(0).toUpperCase()}
                </div>
              ))}
              {presence.length > 5 && (
                <div style={{
                  width: '28px', height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--muted)',
                  border: '2px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 800, color: 'var(--muted-foreground)',
                  marginLeft: '-8px',
                }}>
                  +{presence.length - 5}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Room code */}
        <button
          onClick={copyRoomCode}
          className="btn-pixel"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: 'var(--muted)',
            color: 'var(--foreground)',
          }}
        >
          <span className="mono">{roomCode}</span>
          {codeCopied ? <Check size={12} /> : <Copy size={12} />}
        </button>

        {/* Export */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn-pixel"
            onClick={() => setExportMenuOpen((o) => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-foreground)',
            }}
          >
            <Download size={14} />
            Export
          </button>
          {exportMenuOpen && (
            <div
              className="floating-panel"
              style={{
                position: 'absolute', top: '100%', right: 0,
                marginTop: '4px', padding: '8px',
                display: 'flex', flexDirection: 'column', gap: '4px',
                minWidth: '120px',
              }}
            >
              {([1, 4, 8] as const).map((scale) => (
                <button
                  key={scale}
                  onClick={() => { exportPNG(scale); setExportMenuOpen(false) }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Nunito, sans-serif',
                    fontWeight: 700,
                    fontSize: '13px',
                    backgroundColor: 'transparent',
                    color: 'var(--foreground)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--muted)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  PNG {scale}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mute toggle */}
        <button
          className="tool-btn"
          onClick={toggleMute}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        {/* Toggle panels */}
        <button
          className="tool-btn"
          onClick={() => setShowPanels(p => !p)}
          title={showPanels ? 'Hide panels' : 'Show panels'}
          aria-label={showPanels ? 'Hide panels' : 'Show panels'}
          style={{ fontSize: '11px', fontWeight: 700, width: 'auto', padding: '4px 10px', gap: '4px', display: 'flex', alignItems: 'center' }}
        >
          <Users size={14} />
          {showPanels ? '◀' : '▶'}
        </button>
      </motion.div>

      {/* ─── Middle section: Left Toolbar | Canvas | Right Panels ─────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Left Toolbar */}
        <LeftToolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          onClear={clearCanvas}
          onUndo={undo}
          onRedo={redo}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
        />

        {/* Canvas area */}
        <div
          ref={canvasAreaRef}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            position: 'relative',
            minWidth: 0,
          }}
        >
          {/* Layered canvas — cursor overlay is a sibling to avoid overflow:hidden clipping */}
          <div style={{ position: 'relative', width: pixelW, height: pixelH, flexShrink: 0 }}>
            <motion.div
              initial={shouldReduce ? false : { scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING}
              className="canvas-container"
              style={{ width: pixelW, height: pixelH, position: 'absolute', top: 0, left: 0 }}
            >
              {/* Layer 0: checkerboard */}
              <canvas
                ref={bgRef}
                width={pixelW}
                height={pixelH}
                style={{ position: 'absolute', top: 0, left: 0, imageRendering: 'pixelated' }}
              />

              {/* Layer 1: pixel state */}
              <canvas
                ref={canvasRef}
                width={pixelW}
                height={pixelH}
                style={{ position: 'absolute', top: 0, left: 0, imageRendering: 'pixelated' }}
              />

              {/* Layer 2: local preview */}
              <canvas
                ref={previewRef}
                width={pixelW}
                height={pixelH}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  imageRendering: 'pixelated',
                  cursor: activeTool === 'eyedropper'
                    ? 'crosshair'
                    : activeTool === 'fill'
                    ? 'cell'
                    : activeTool === 'eraser'
                    ? 'not-allowed'
                    : 'crosshair',
                }}
              />

              {/* Layer 3: grid overlay */}
              {zoom >= 4 && (
                <div
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: '100%',
                    backgroundImage: `
                      linear-gradient(rgba(45,27,78,0.15) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(45,27,78,0.15) 1px, transparent 1px)
                    `,
                    backgroundSize: `${zoom}px ${zoom}px`,
                    pointerEvents: 'none',
                  }}
                />
              )}
            </motion.div>

            {/* Layer 4: cursor overlay — outside canvas-container so overflow:hidden doesn't clip it */}
            <div
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50, overflow: 'visible' }}
            >
              {presence.map((user) => (
                <CollabCursor key={user.userId} user={user} zoom={zoom} />
              ))}
            </div>
          </div>
        </div>

        {/* Right panels column */}
        {showPanels && (
          <div
            style={{
              width: '272px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px 12px 12px 8px',
              overflowY: 'auto',
              overflowX: 'hidden',
              height: '100%',
            }}
          >
            <UsersPanel
              presence={presence}
              currentUserId={userId}
              currentUsername={username}
            />
            <HSBColorPicker
              activeColor={activeColor}
              setActiveColor={setActiveColor}
              onHexChange={setSyncHex}
              externalHex={syncHex}
            />
            <PalettePanel
              activeColor={activeColor}
              setActiveColor={setActiveColor}
              onSwatchSelect={setSyncHex}
              externalHex={syncHex}
            />
            <HotkeyPanel />
          </div>
        )}

      </div>

      {/* ─── Bottom Bar ──────────────────────────────────────────────────── */}
      <motion.div
        initial={shouldReduce ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={SPRING}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          backgroundColor: 'var(--card)',
          borderTop: '2px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Canvas size */}
        <span
          className="mono"
          style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}
        >
          {canvasWidth}×{canvasHeight}px
        </span>

        <div style={{ flex: 1 }} />

        {/* Zoom controls */}
        <button
          className="tool-btn"
          onClick={() => setZoom(Math.max(1, zoom - 1))}
          title="Zoom Out (-)"
          aria-label="Zoom Out"
          style={{ width: '36px', height: '36px' }}
        >
          <ZoomOut size={16} />
        </button>

        <span
          className="mono"
          style={{ fontSize: '12px', color: 'var(--foreground)', minWidth: '40px', textAlign: 'center' }}
        >
          {zoom}x
        </span>

        <button
          className="tool-btn"
          onClick={() => setZoom(Math.min(32, zoom + 1))}
          title="Zoom In (+)"
          aria-label="Zoom In"
          style={{ width: '36px', height: '36px' }}
        >
          <ZoomIn size={16} />
        </button>
      </motion.div>
    </div>
  )
}
