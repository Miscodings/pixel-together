'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { hexToRGBA, rgbaToHex } from '@/lib/canvas-engine'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

const STORAGE_KEY = 'pixeltogether_palette'

const DEFAULT_PALETTE = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00',
  '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#FF8800', '#8800FF', '#FF0088', '#00FF88',
  '#0088FF', '#884400', '#448800', '#004488',
]

function loadPalette(): string[] {
  if (typeof window === 'undefined') return DEFAULT_PALETTE
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as string[]
      if (Array.isArray(parsed) && parsed.length === 16) return parsed
    }
  } catch {}
  return [...DEFAULT_PALETTE]
}

function savePalette(palette: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(palette))
  } catch {}
}

interface PalettePanelProps {
  activeColor: number
  setActiveColor: (c: number) => void
  /** Called when a palette swatch is clicked so the HSB picker can sync */
  onSwatchSelect?: (hex: string) => void
  /** External hex from HSB picker — used for hex input sync */
  externalHex?: string
}

export function PalettePanel({
  activeColor,
  setActiveColor,
  onSwatchSelect,
  externalHex,
}: PalettePanelProps) {
  const shouldReduce = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE)
  const [hexInput, setHexInput] = useState(() => rgbaToHex(activeColor).slice(0, 7))

  // Load palette from localStorage on mount
  useEffect(() => {
    setPalette(loadPalette())
  }, [])

  // Sync hex input when active color changes externally
  useEffect(() => {
    setHexInput(rgbaToHex(activeColor).slice(0, 7))
  }, [activeColor])

  // Sync hex input when HSB picker reports a change
  useEffect(() => {
    if (externalHex) setHexInput(externalHex)
  }, [externalHex])

  // Click swatch → set as active color
  const handleSwatchClick = useCallback(
    (hex: string) => {
      const packed = hexToRGBA(hex)
      setActiveColor(packed)
      setHexInput(hex)
      onSwatchSelect?.(hex)
    },
    [setActiveColor, onSwatchSelect]
  )

  // Right-click or double-click swatch → save current color into that slot
  const handleSwatchSave = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault()
      const currentHex = rgbaToHex(activeColor).slice(0, 7)
      const next = [...palette]
      next[index] = currentHex
      setPalette(next)
      savePalette(next)
    },
    [activeColor, palette]
  )

  const handleHexInput = useCallback(
    (raw: string) => {
      setHexInput(raw)
      const cleaned = raw.startsWith('#') ? raw : `#${raw}`
      if (cleaned.length === 7) {
        const packed = hexToRGBA(cleaned)
        setActiveColor(packed)
        onSwatchSelect?.(cleaned)
      }
    },
    [setActiveColor, onSwatchSelect]
  )

  const activeHex = rgbaToHex(activeColor).slice(0, 7).toLowerCase()

  return (
    <motion.div
      initial={shouldReduce ? false : { x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ ...SPRING, delay: 0.05 }}
      className="card-pixel"
      style={{
        background: 'var(--card)',
        cursor: 'default',
        overflow: 'hidden',
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
          Palette
        </span>
        <button
          className="tool-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand palette' : 'Collapse palette'}
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
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* 4×4 swatch grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '5px',
                }}
              >
                {palette.map((hex, i) => {
                  const isActive = hex.toLowerCase() === activeHex
                  return (
                    <button
                      key={i}
                      onClick={() => handleSwatchClick(hex)}
                      onContextMenu={(e) => handleSwatchSave(i, e)}
                      onDoubleClick={(e) => handleSwatchSave(i, e)}
                      title={`${hex} — right-click or double-click to set to current color`}
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        borderRadius: '6px',
                        border: isActive ? '2.5px solid var(--primary)' : '2px solid var(--border)',
                        backgroundColor: hex,
                        cursor: 'pointer',
                        boxShadow: isActive
                          ? '1px 1px 0px 0px var(--primary)'
                          : '1px 1px 0px 0px var(--border)',
                        transition: 'transform 80ms ease, box-shadow 80ms ease',
                        outline: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translate(-1px, -1px)'
                        e.currentTarget.style.boxShadow = '2px 2px 0px 0px var(--border)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.boxShadow = isActive
                          ? '1px 1px 0px 0px var(--primary)'
                          : '1px 1px 0px 0px var(--border)'
                      }}
                    />
                  )
                })}
              </div>

              <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.4 }}>
                Right-click or double-click a swatch to save current color.
              </p>

              {/* Hex input */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    border: '2px solid var(--border)',
                    backgroundColor: activeHex,
                    flexShrink: 0,
                    boxShadow: '1px 1px 0px 0px var(--border)',
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
                    padding: '5px 8px',
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
