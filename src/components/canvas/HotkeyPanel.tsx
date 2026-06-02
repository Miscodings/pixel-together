'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

const HOTKEYS: { key: string; label: string }[] = [
  { key: 'B', label: 'Pencil' },
  { key: 'E', label: 'Eraser' },
  { key: 'G', label: 'Fill' },
  { key: 'I', label: 'Eyedropper' },
  { key: 'Z', label: 'Undo (Ctrl+Z)' },
  { key: 'Y', label: 'Redo (Ctrl+Y)' },
  { key: '+', label: 'Zoom In' },
  { key: '−', label: 'Zoom Out' },
]

export function HotkeyPanel() {
  const shouldReduce = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <motion.div
      initial={shouldReduce ? false : { x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ ...SPRING, delay: 0.1 }}
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
          Shortcuts
        </span>
        <button
          className="tool-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand shortcuts' : 'Collapse shortcuts'}
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
            <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {HOTKEYS.map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '2px 0',
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '24px',
                      height: '22px',
                      padding: '0 5px',
                      fontSize: '11px',
                      fontWeight: 700,
                      border: '1.5px solid var(--border)',
                      borderRadius: '5px',
                      backgroundColor: 'var(--muted)',
                      color: 'var(--foreground)',
                      boxShadow: '1px 1px 0px 0px var(--border)',
                      flexShrink: 0,
                    }}
                  >
                    {key}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
