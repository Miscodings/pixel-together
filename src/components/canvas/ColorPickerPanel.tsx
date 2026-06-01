'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { hexToRGBA, rgbaToHex, unpackRGBA, packRGBA } from '@/lib/canvas-engine'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

interface ColorPickerPanelProps {
  isOpen: boolean
  activeColor: number
  onColorChange: (color: number) => void
  onClose: () => void
  anchorRect?: DOMRect | null
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function drawColorWheel(ctx: CanvasRenderingContext2D, size: number, lightness: number) {
  const center = size / 2
  const radius = size / 2

  const imageData = ctx.createImageData(size, size)
  const data = imageData.data

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= radius) {
        const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 180
        const saturation = (dist / radius) * 100
        const [r, g, b] = hslToRgb(angle, saturation, lightness)
        const i = (y * size + x) * 4
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = 255
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

const MAX_RECENT = 8

export function ColorPickerPanel({
  isOpen,
  activeColor,
  onColorChange,
  onClose,
  anchorRect,
}: ColorPickerPanelProps) {
  const shouldReduce = useReducedMotion()
  const wheelCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const { r, g, b, a } = unpackRGBA(activeColor)
  const [h, s, l] = rgbToHsl(r, g, b)

  const [hue, setHue] = useState(h)
  const [sat, setSat] = useState(s)
  const [lit, setLit] = useState(l)
  const [alpha, setAlpha] = useState(a)
  const [hexInput, setHexInput] = useState(rgbaToHex(activeColor))
  const [recentColors, setRecentColors] = useState<number[]>([])

  // Sync state when activeColor changes externally
  useEffect(() => {
    const { r, g, b, a } = unpackRGBA(activeColor)
    const [nh, ns, nl] = rgbToHsl(r, g, b)
    setHue(nh); setSat(ns); setLit(nl); setAlpha(a)
    setHexInput(rgbaToHex(activeColor))
  }, [activeColor])

  const emitColor = useCallback((nh: number, ns: number, nl: number, na: number) => {
    const [nr, ng, nb] = hslToRgb(nh, ns, nl)
    const packed = packRGBA(nr, ng, nb, na)
    onColorChange(packed)
    setHexInput(rgbaToHex(packed))
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c !== packed)
      return [packed, ...filtered].slice(0, MAX_RECENT)
    })
  }, [onColorChange])

  // Draw wheel whenever lightness changes or panel opens
  useEffect(() => {
    if (!isOpen) return
    const canvas = wheelCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawColorWheel(ctx, 160, lit)
  }, [isOpen, lit])

  // Click on wheel
  const handleWheelClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = wheelCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left - 80
    const cy = e.clientY - rect.top - 80
    const dist = Math.sqrt(cx * cx + cy * cy)
    if (dist > 80) return

    const angle = Math.atan2(cy, cx) * (180 / Math.PI) + 180
    const newSat = Math.min(100, (dist / 80) * 100)
    setHue(angle); setSat(newSat)
    emitColor(angle, newSat, lit, alpha)
  }, [lit, alpha, emitColor])

  // Handle hex input
  const handleHexChange = useCallback((raw: string) => {
    setHexInput(raw)
    const cleaned = raw.replace(/[^0-9a-fA-F#]/g, '')
    if (cleaned.length === 7 || cleaned.length === 9) {
      const packed = hexToRGBA(cleaned)
      const { r, g, b, a } = unpackRGBA(packed)
      const [nh, ns, nl] = rgbToHsl(r, g, b)
      setHue(nh); setSat(ns); setLit(nl); setAlpha(a)
      onColorChange(packed)
    }
  }, [onColorChange])

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  const currentRgb = hslToRgb(hue, sat, lit)
  const currentHex = rgbaToHex(packRGBA(currentRgb[0], currentRgb[1], currentRgb[2], alpha))

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={shouldReduce ? false : { scale: 0.8, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={shouldReduce ? undefined : { scale: 0.8, opacity: 0, y: 8 }}
          transition={SPRING}
          style={{
            position: 'fixed',
            left: anchorRect ? anchorRect.right + 8 : 80,
            top: anchorRect ? Math.max(8, anchorRect.top - 100) : 200,
            zIndex: 100,
            transformOrigin: 'top left',
          }}
          className="floating-panel"
        >
          <div style={{ padding: '16px', width: '220px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* HSL Color Wheel */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <canvas
                ref={wheelCanvasRef}
                width={160}
                height={160}
                onClick={handleWheelClick}
                style={{ cursor: 'crosshair', borderRadius: '50%', border: '2px solid var(--border)' }}
              />
            </div>

            {/* Lightness slider */}
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)' }}>
              Lightness
              <input
                type="range" min={5} max={95} value={lit}
                onChange={(e) => { const v = Number(e.target.value); setLit(v); emitColor(hue, sat, v, alpha) }}
                style={{ width: '100%', accentColor: 'var(--primary)', display: 'block', marginTop: '4px' }}
              />
            </label>

            {/* Saturation slider */}
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)' }}>
              Saturation
              <input
                type="range" min={0} max={100} value={sat}
                onChange={(e) => { const v = Number(e.target.value); setSat(v); emitColor(hue, v, lit, alpha) }}
                style={{ width: '100%', accentColor: 'var(--primary)', display: 'block', marginTop: '4px' }}
              />
            </label>

            {/* Alpha slider */}
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)' }}>
              Opacity
              <input
                type="range" min={0} max={255} value={alpha}
                onChange={(e) => { const v = Number(e.target.value); setAlpha(v); emitColor(hue, sat, lit, v) }}
                style={{ width: '100%', accentColor: 'var(--primary)', display: 'block', marginTop: '4px' }}
              />
            </label>

            {/* Hex input + color preview */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  border: '2px solid var(--border)',
                  backgroundColor: currentHex.slice(0, 7),
                  flexShrink: 0,
                }}
              />
              <input
                className="mono"
                value={hexInput}
                onChange={(e) => handleHexChange(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '12px',
                  border: '2px solid var(--border)',
                  borderRadius: '8px',
                  outline: 'none',
                  backgroundColor: 'var(--muted)',
                  color: 'var(--foreground)',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Recent colors */}
            {recentColors.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '6px' }}>
                  Recent
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {recentColors.map((c, i) => {
                    const hex = rgbaToHex(c).slice(0, 7)
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          const { r, g, b, a } = unpackRGBA(c)
                          const [nh, ns, nl] = rgbToHsl(r, g, b)
                          setHue(nh); setSat(ns); setLit(nl); setAlpha(a)
                          onColorChange(c)
                          setHexInput(rgbaToHex(c))
                        }}
                        style={{
                          width: '20px', height: '20px',
                          borderRadius: '4px',
                          border: c === activeColor ? '2px solid var(--primary)' : '2px solid var(--border)',
                          backgroundColor: hex,
                          cursor: 'pointer',
                        }}
                        title={hex}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
