'use client'

import { useEffect, useRef, useState } from 'react'
import type { UserPresence } from '@/types/canvas'

interface CollabCursorProps {
  user: UserPresence
  zoom: number
}

export function CollabCursor({ user, zoom }: CollabCursorProps) {
  const [visible, setVisible] = useState(true)
  const posRef = useRef({ x: user.cursorX * zoom, y: user.cursorY * zoom })
  const targetRef = useRef({ x: user.cursorX * zoom, y: user.cursorY * zoom })
  const domRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Update target on new presence data
  useEffect(() => {
    targetRef.current = { x: user.cursorX * zoom, y: user.cursorY * zoom }
    setVisible(true)

    if (staleTimerRef.current) clearTimeout(staleTimerRef.current)
    staleTimerRef.current = setTimeout(() => setVisible(false), 3000)
  }, [user.cursorX, user.cursorY, zoom])

  // Lerp animation loop
  useEffect(() => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    const tick = () => {
      posRef.current.x = lerp(posRef.current.x, targetRef.current.x, 0.3)
      posRef.current.y = lerp(posRef.current.y, targetRef.current.y, 0.3)

      if (domRef.current) {
        domRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current)
    }
  }, [])

  const initial = user.username.charAt(0).toUpperCase()

  return (
    <div
      ref={domRef}
      className="collab-cursor"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease',
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 50,
      }}
    >
      {/* SVG arrow cursor */}
      <svg
        width="20"
        height="24"
        viewBox="0 0 20 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <path
          d="M2 2L2 18L7 13L10 20L13 19L10 12L17 12L2 2Z"
          fill={user.color}
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      {/* Name badge */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '14px',
          backgroundColor: user.color,
          color: '#FFFFFF',
          fontSize: '10px',
          fontFamily: 'Nunito, sans-serif',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '6px',
          border: '1.5px solid #2D1B4E',
          boxShadow: '1px 1px 0px #2D1B4E',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          lineHeight: '1.4',
          maxWidth: '100px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {initial} {user.username}
      </div>
    </div>
  )
}
