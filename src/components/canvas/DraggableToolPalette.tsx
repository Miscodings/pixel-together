'use client'

import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Pencil,
  Eraser,
  PaintBucket,
  Pipette,
  Palette,
  ZoomIn,
  ZoomOut,
  Trash2,
} from 'lucide-react'
import type { Tool } from '@/types/canvas'
import { ColorPickerPanel } from './ColorPickerPanel'
import { rgbaToHex } from '@/lib/canvas-engine'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

const TOOLS: { id: Tool; Icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { id: 'pencil', Icon: Pencil, label: 'Pencil' },
  { id: 'eraser', Icon: Eraser, label: 'Eraser' },
  { id: 'fill', Icon: PaintBucket, label: 'Fill Bucket' },
  { id: 'eyedropper', Icon: Pipette, label: 'Eyedropper' },
  { id: 'colorpicker', Icon: Palette, label: 'Color Picker' },
  { id: 'zoomin', Icon: ZoomIn, label: 'Zoom In' },
  { id: 'zoomout', Icon: ZoomOut, label: 'Zoom Out' },
  { id: 'clear', Icon: Trash2, label: 'Clear Canvas' },
]

interface DraggableToolPaletteProps {
  activeTool: Tool
  setActiveTool: (t: Tool) => void
  activeColor: number
  setActiveColor: (c: number) => void
}

export function DraggableToolPalette({
  activeTool,
  setActiveTool,
  activeColor,
  setActiveColor,
}: DraggableToolPaletteProps) {
  const shouldReduce = useReducedMotion()
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const swatchRef = useRef<HTMLButtonElement | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const handleToolClick = (toolId: Tool) => {
    if (toolId === 'colorpicker') {
      const rect = swatchRef.current?.getBoundingClientRect() ?? null
      setAnchorRect(rect)
      setColorPickerOpen((o) => !o)
    } else {
      setActiveTool(toolId)
      setColorPickerOpen(false)
    }
  }

  const hexColor = rgbaToHex(activeColor).slice(0, 7)

  return (
    <>
      <motion.div
        drag
        dragMomentum={false}
        initial={shouldReduce ? false : { x: 0, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={SPRING}
        className="floating-panel"
        style={{
          position: 'fixed',
          left: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          padding: '10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 40,
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {TOOLS.map((tool, i) => (
          <motion.div
            key={tool.id}
            initial={shouldReduce ? false : { opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING, delay: i * 0.03 }}
          >
            <button
              className={`tool-btn${activeTool === tool.id ? ' active' : ''}`}
              onClick={() => handleToolClick(tool.id)}
              title={tool.label}
              aria-label={tool.label}
              style={{ cursor: 'pointer' }}
            >
              <tool.Icon size={20} />
            </button>
          </motion.div>
        ))}

        {/* Divider */}
        <div
          style={{
            height: '2px',
            backgroundColor: 'var(--border)',
            borderRadius: '1px',
            margin: '2px 0',
          }}
        />

        {/* Active color swatch */}
        <button
          ref={swatchRef}
          onClick={() => {
            const rect = swatchRef.current?.getBoundingClientRect() ?? null
            setAnchorRect(rect)
            setColorPickerOpen((o) => !o)
          }}
          aria-label="Open Color Picker"
          title="Color Picker"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius)',
            border: '2px solid var(--border)',
            boxShadow: '2px 2px 0px 0px var(--border)',
            backgroundColor: hexColor,
            cursor: 'pointer',
            transition: 'transform 80ms ease, box-shadow 80ms ease',
            flexShrink: 0,
          }}
        />
      </motion.div>

      <ColorPickerPanel
        isOpen={colorPickerOpen}
        activeColor={activeColor}
        onColorChange={setActiveColor}
        onClose={() => setColorPickerOpen(false)}
        anchorRect={anchorRect}
      />
    </>
  )
}
