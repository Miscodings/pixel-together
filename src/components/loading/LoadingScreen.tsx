'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

// 20×10 pixel art logo — stylized "PT"
const P = '#7C5CBF'  // primary purple
const O = '#F4A261'  // secondary orange
const G = '#52B788'  // accent green
const _ = null        // transparent

const LOGO_ART: (string | null)[][] = [
  [P, P, P, _, O, O, O, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [P, _, _, P, O, _, _, O, _, _, _, _, _, _, _, _, _, _, _, _],
  [P, _, _, P, O, _, _, O, _, _, _, _, _, _, _, _, _, _, _, _],
  [P, P, P, _, O, O, O, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [P, _, _, _, O, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [P, _, _, _, O, _, _, _, G, G, G, _, _, _, _, _, _, _, _, _],
  [P, _, _, _, O, _, _, _, _, G, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, G, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, G, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, G, _, _, _, _, _, _, _, _, _, _],
]

const COLS = 20
const ROWS = 10
const CELL_SIZE = 24

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Web Audio tick
function playTick() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 800
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.06)
  } catch {
    // ignore
  }
}

interface LoadingScreenProps {
  onComplete?: () => void
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const shouldReduce = useReducedMotion()
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [bouncing, setBouncing] = useState(false)
  const [done, setDone] = useState(false)
  const orderRef = useRef<number[]>([])

  const totalCells = COLS * ROWS

  useEffect(() => {
    // Build reveal order: only cells that have color
    const coloredIndices: number[] = []
    const allIndices: number[] = []
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c
        allIndices.push(idx)
        if (LOGO_ART[r][c] !== null) coloredIndices.push(idx)
      }
    }

    if (shouldReduce) {
      // Instant reveal
      setRevealed(new Set(allIndices))
      setBouncing(true)
      setTimeout(() => { setBouncing(false); setDone(true) }, 300)
      onComplete?.()
      return
    }

    const shuffled = shuffle(coloredIndices)
    orderRef.current = shuffled

    let i = 0
    const intervalMs = 30

    const interval = setInterval(() => {
      if (i >= shuffled.length) {
        clearInterval(interval)
        // Bounce then finish
        setTimeout(() => setBouncing(true), 50)
        setTimeout(() => { setBouncing(false); setDone(true); onComplete?.() }, 700)
        return
      }

      const batchSize = Math.ceil(shuffled.length / 40) // reveal in ~40 steps
      const batch = shuffled.slice(i, i + batchSize)
      setRevealed((prev) => {
        const next = new Set(prev)
        batch.forEach((idx) => next.add(idx))
        return next
      })
      playTick()
      i += batchSize
    }, intervalMs)

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldReduce])

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="loading"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: -60 }}
          transition={{ duration: 0.4 }}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--background)',
            zIndex: 9999,
            gap: '24px',
          }}
        >
          {/* Pixel grid */}
          <motion.div
            animate={bouncing ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${COLS}, ${CELL_SIZE}px)`,
                gap: '2px',
              }}
            >
              {Array.from({ length: totalCells }).map((_, idx) => {
                const row = Math.floor(idx / COLS)
                const col = idx % COLS
                const color = LOGO_ART[row][col]
                const isRevealed = revealed.has(idx)

                return (
                  <motion.div
                    key={idx}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={
                      isRevealed && color
                        ? { scale: 1, opacity: 1 }
                        : { scale: 0, opacity: 0 }
                    }
                    transition={shouldReduce ? { duration: 0 } : SPRING}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      borderRadius: '4px',
                      backgroundColor: color ?? 'transparent',
                    }}
                  />
                )
              })}
            </div>
          </motion.div>

          {/* Wordmark */}
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.2 }}
            className="wordmark"
            style={{
              fontSize: '28px',
              color: 'var(--primary)',
              letterSpacing: '-0.02em',
            }}
          >
            PixelTogether
          </motion.div>

          {/* Loading dots */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                style={{
                  width: '8px', height: '8px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
