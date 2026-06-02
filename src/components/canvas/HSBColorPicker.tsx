'use client'

import { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { hexToRGBA, rgbaToHex, unpackRGBA, packRGBA } from '@/lib/canvas-engine'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

// HSB <-> RGB conversion helpers
function hsbToRgb(h: number, s: number, b: number): [number, number, number] {
  s /= 100; b /= 100
  const k = (n: number) => (n + h / 60) % 6
  const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)))
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)]
}

function rgbToHsb(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const brightness = max * 100
  const saturation = max === 0 ? 0 : (d / max) * 100
  let hue = 0
  if (d !== 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6)
    else if (max === g) hue = 60 * ((b - r) / d + 2)
    else hue = 60 * ((r - g) / d + 4)
  }
  return [hue < 0 ? hue + 360 : hue, saturation, brightness]
}

interface HSBColorPickerProps {
  activeColor: number
  setActiveColor: (c: number) => void
  /** Called when hex input changes so PalettePanel can stay in sync */
  onHexChange?: (hex: string) => void
  /** External hex override — drives the picker from outside (e.g. palette clicks) */
  externalHex?: string
}

export function HSBColorPicker({
  activeColor,
  setActiveColor,
  onHexChange,
  externalHex,
}: HSBColorPickerProps) {
  const shouldReduce = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)

  const { r, g, b } = unpackRGBA(activeColor)
  const [hue, saturation, brightness] = rgbToHsb(r, g, b)

  const [localHue, setLocalHue] = useState(hue)
  const [localSat, setLocalSat] = useState(saturation)
  const [localBri, setLocalBri] = useState(brightness)
  const [hexInput, setHexInput] = useState(() => rgbaToHex(activeColor).slice(0, 7))

  // Sync when activeColor changes externally (e.g. eyedropper, palette click)
  useEffect(() => {
    const { r, g, b } = unpackRGBA(activeColor)
    const [nh, ns, nb] = rgbToHsb(r, g, b)
    setLocalHue(nh)
    setLocalSat(ns)
    setLocalBri(nb)
    setHexInput(rgbaToHex(activeColor).slice(0, 7))
  }, [activeColor])

  // Sync when parent drives an external hex (palette panel)
  useEffect(() => {
    if (!externalHex) return
    const cleaned = externalHex.startsWith('#') ? externalHex : `#${externalHex}`
    if (cleaned.length !== 7) return
    const packed = hexToRGBA(cleaned)
    const { r, g, b } = unpackRGBA(packed)
    const [nh, ns, nb] = rgbToHsb(r, g, b)
    setLocalHue(nh)
    setLocalSat(ns)
    setLocalBri(nb)
    setHexInput(cleaned)
  }, [externalHex])

  const emitColor = useCallback(
    (h: number, s: number, bri: number) => {
      const [nr, ng, nb] = hsbToRgb(h, s, bri)
      const packed = packRGBA(nr, ng, nb, 255)
      setActiveColor(packed)
      const hex = rgbaToHex(packed).slice(0, 7)
      setHexInput(hex)
      onHexChange?.(hex)
    },
    [setActiveColor, onHexChange]
  )

  const handleHexInput = useCallback(
    (raw: string) => {
      setHexInput(raw)
      const cleaned = raw.startsWith('#') ? raw : `#${raw}`
      if (cleaned.length === 7) {
        const packed = hexToRGBA(cleaned)
        const { r, g, b } = unpackRGBA(packed)
        const [nh, ns, nb] = rgbToHsb(r, g, b)
        setLocalHue(nh)
        setLocalSat(ns)
        setLocalBri(nb)
        setActiveColor(packed)
        onHexChange?.(cleaned)
      }
    },
    [setActiveColor, onHexChange]
  )

  // Gradient strings for slider tracks
  const hueGradient =
    'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'

  // Saturation: gray → current hue at full sat
  const [hr, hg, hb] = hsbToRgb(localHue, 100, 100)
  const hueHex = `rgb(${hr},${hg},${hb})`
  const satGradient = `linear-gradient(to right, #808080, ${hueHex})`

  // Brightness: black → current hue at full brightness
  const briGradient = `linear-gradient(to right, #000000, ${hueHex})`

  const swatchColor = `rgb(${hsbToRgb(localHue, localSat, localBri).join(',')})`

  return (
    <motion.div
      initial={shouldReduce ? false : { x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={SPRING}
      className="card-pixel"
      style={{
        background: 'var(--card)',
        cursor: 'default',
        overflow: 'visible',
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px 6px',
          borderBottom: collapsed ? 'none' : '1px solid var(--muted)',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Color
        </span>
        <button
          className="tool-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand color picker' : 'Collapse color picker'}
          style={{ width: '28px', height: '28px' }}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={shouldReduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={shouldReduce ? undefined : { height: 0, opacity: 0 }}
            transition={SPRING}
            style={{ overflow: 'visible' }}
          >
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>

              {/* Color swatch + hex input */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    border: '2px solid var(--border)',
                    backgroundColor: swatchColor,
                    flexShrink: 0,
                    boxShadow: '2px 2px 0px 0px var(--border)',
                  }}
                />
                <input
                  className="mono"
                  value={hexInput}
                  onChange={(e) => handleHexInput(e.target.value)}
                  maxLength={7}
                  placeholder="#000000"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: 0,
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

              {/* Hue slider */}
              <SliderRow
                label="Hue"
                value={localHue}
                min={0}
                max={360}
                gradient={hueGradient}
                onChange={(v) => {
                  setLocalHue(v)
                  emitColor(v, localSat, localBri)
                }}
              />

              {/* Saturation slider */}
              <SliderRow
                label="Saturation"
                value={localSat}
                min={0}
                max={100}
                gradient={satGradient}
                onChange={(v) => {
                  setLocalSat(v)
                  emitColor(localHue, v, localBri)
                }}
              />

              {/* Brightness slider */}
              <SliderRow
                label="Brightness"
                value={localBri}
                min={0}
                max={100}
                gradient={briGradient}
                onChange={(v) => {
                  setLocalBri(v)
                  emitColor(localHue, localSat, v)
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  gradient: string
  onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, gradient, onChange }: SliderRowProps) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted-foreground)' }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
          {Math.round(value)}
        </span>
      </div>
      {/* Custom styled track via wrapper */}
      <div
        style={{
          position: 'relative',
          height: '14px',
          borderRadius: '7px',
          background: gradient,
          border: '1.5px solid var(--border)',
          overflow: 'visible',
        }}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
          }}
        />
        {/* Thumb indicator */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${((Math.round(value) - min) / (max - min)) * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            border: '2.5px solid var(--border)',
            backgroundColor: 'var(--card)',
            boxShadow: '1px 1px 0px 0px var(--border)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}
