'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Pencil,
  Eraser,
  PaintBucket,
  Pipette,
  Trash2,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type { Tool } from '@/types/canvas'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

interface ToolDef {
  id: Tool | 'undo' | 'redo'
  Icon: React.ComponentType<{ size?: number }>
  label: string
  shortcut?: string
}

const TOOL_ITEMS: ToolDef[] = [
  { id: 'pencil', Icon: Pencil, label: 'Pencil', shortcut: 'B' },
  { id: 'eraser', Icon: Eraser, label: 'Eraser', shortcut: 'E' },
  { id: 'fill', Icon: PaintBucket, label: 'Fill Bucket', shortcut: 'G' },
  { id: 'eyedropper', Icon: Pipette, label: 'Eyedropper', shortcut: 'I' },
]

const ACTION_ITEMS: ToolDef[] = [
  { id: 'undo', Icon: Undo2, label: 'Undo', shortcut: 'Ctrl+Z' },
  { id: 'redo', Icon: Redo2, label: 'Redo', shortcut: 'Ctrl+Y' },
  { id: 'clear', Icon: Trash2, label: 'Clear Canvas' },
]

interface LeftToolbarProps {
  activeTool: Tool
  setActiveTool: (t: Tool) => void
  onClear: () => void
  onUndo: () => void
  onRedo: () => void
}

export function LeftToolbar({
  activeTool,
  setActiveTool,
  onClear,
  onUndo,
  onRedo,
}: LeftToolbarProps) {
  const shouldReduce = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)

  const handleAction = (id: ToolDef['id']) => {
    if (id === 'undo') { onUndo(); return }
    if (id === 'redo') { onRedo(); return }
    if (id === 'clear') { onClear(); return }
    setActiveTool(id as Tool)
  }

  return (
    <motion.div
      initial={shouldReduce ? false : { x: -60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={SPRING}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0',
        flexShrink: 0,
        zIndex: 20,
        alignSelf: 'center',
      }}
    >
      {/* Panel */}
      <div
        className="card-pixel"
        style={{
          background: 'var(--card)',
          padding: collapsed ? '8px 6px' : '8px 6px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          cursor: 'default',
          marginLeft: '12px',
        }}
      >
        {/* Collapse toggle */}
        <button
          className="tool-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand toolbar' : 'Collapse toolbar'}
          aria-label={collapsed ? 'Expand toolbar' : 'Collapse toolbar'}
          style={{ width: '36px', height: '36px', marginBottom: '2px' }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={shouldReduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={shouldReduce ? undefined : { opacity: 0, height: 0 }}
              transition={SPRING}
              style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
            >
              {/* Drawing tools */}
              {TOOL_ITEMS.map((tool, i) => (
                <motion.div
                  key={tool.id}
                  initial={shouldReduce ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...SPRING, delay: i * 0.03 }}
                >
                  <button
                    className={`tool-btn${activeTool === (tool.id as Tool) ? ' active' : ''}`}
                    onClick={() => handleAction(tool.id)}
                    title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
                    aria-label={tool.label}
                    style={{ width: '44px', height: '44px', cursor: 'pointer' }}
                  >
                    <tool.Icon size={18} />
                  </button>
                </motion.div>
              ))}

              {/* Divider */}
              <div
                style={{
                  width: '32px',
                  height: '2px',
                  backgroundColor: 'var(--border)',
                  borderRadius: '1px',
                  margin: '4px 0',
                }}
              />

              {/* Action buttons */}
              {ACTION_ITEMS.map((action, i) => (
                <motion.div
                  key={action.id}
                  initial={shouldReduce ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...SPRING, delay: (TOOL_ITEMS.length + i) * 0.03 }}
                >
                  <button
                    className="tool-btn"
                    onClick={() => handleAction(action.id)}
                    title={`${action.label}${action.shortcut ? ` (${action.shortcut})` : ''}`}
                    aria-label={action.label}
                    style={{
                      width: '44px',
                      height: '44px',
                      cursor: 'pointer',
                      ...(action.id === 'clear'
                        ? { color: 'var(--destructive)' }
                        : {}),
                    }}
                  >
                    <action.Icon size={18} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
