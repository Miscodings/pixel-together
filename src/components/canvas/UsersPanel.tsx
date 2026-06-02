'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, ChevronDown, ChevronUp } from 'lucide-react'
import type { UserPresence } from '@/types/canvas'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

interface UsersPanelProps {
  presence: UserPresence[]
  currentUserId: string
  currentUsername: string
}

export function UsersPanel({ presence, currentUserId, currentUsername }: UsersPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Include current user at top
  const allUsers = [
    { userId: currentUserId, username: currentUsername, isSelf: true },
    ...presence.map(u => ({ userId: u.userId, username: u.username, color: u.color, isSelf: false })),
  ]

  return (
    <div className="card-pixel" style={{ background: 'var(--card)', padding: '8px', minWidth: '180px' }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--foreground)', fontFamily: 'Nunito, sans-serif',
          fontWeight: 700, fontSize: '13px', padding: '2px 4px', borderRadius: '6px',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Users size={14} />
          Artists ({allUsers.length})
        </span>
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
              {allUsers.map((user) => {
                const presenceUser = presence.find(p => p.userId === user.userId)
                const color = presenceUser?.color ?? '#7C5CBF'
                return (
                  <div
                    key={user.userId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '4px 6px', borderRadius: '8px',
                      backgroundColor: user.isSelf ? 'var(--muted)' : 'transparent',
                    }}
                  >
                    {/* Color avatar */}
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      backgroundColor: color,
                      border: '2px solid var(--border)',
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '9px', fontWeight: 800, color: '#fff',
                    }}>
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    {/* Name */}
                    <span style={{
                      fontSize: '12px', fontFamily: 'Nunito, sans-serif',
                      fontWeight: user.isSelf ? 800 : 600,
                      color: 'var(--foreground)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {user.username}{user.isSelf ? ' (you)' : ''}
                    </span>
                    {/* Online dot */}
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      backgroundColor: 'var(--accent)',
                      flexShrink: 0,
                    }} />
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
