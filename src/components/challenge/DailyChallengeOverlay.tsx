'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { DailyChallenge } from '@/types/canvas'

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }

interface DailyChallengeOverlayProps {
  challenge: DailyChallenge
  onStart: () => void
}

// Small pixel-art pencil decorative element built with divs
function PixelPencil() {
  return (
    <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {/* Pencil body rows */}
      {[
        ['#F4A261', '#F4A261', '#F4A261'],
        ['#F4A261', '#7C5CBF', '#F4A261'],
        ['#F4A261', '#F4A261', '#F4A261'],
        ['#F4A261', '#F4A261', '#F4A261'],
        ['#EDE0FF', '#EDE0FF', '#EDE0FF'],
        ['#2D1B4E', null, '#2D1B4E'],
        [null, '#2D1B4E', null],
      ].map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '2px' }}>
          {row.map((color, ci) => (
            <div
              key={ci}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '2px',
                backgroundColor: color ?? 'transparent',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// Typewriter text
function TypewriterText({ text, charDelayMs = 30 }: { text: string; charDelayMs?: number }) {
  const [displayed, setDisplayed] = useState('')
  const shouldReduce = useReducedMotion()

  useEffect(() => {
    if (shouldReduce) {
      setDisplayed(text)
      return
    }
    setDisplayed('')
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(interval)
    }, charDelayMs)
    return () => clearInterval(interval)
  }, [text, charDelayMs, shouldReduce])

  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          style={{ color: 'var(--primary)' }}
        >
          |
        </motion.span>
      )}
    </span>
  )
}

export function DailyChallengeOverlay({ challenge, onStart }: DailyChallengeOverlayProps) {
  const shouldReduce = useReducedMotion()
  const [promptDone, setPromptDone] = useState(false)
  const [badgeVisible, setBadgeVisible] = useState(false)
  const [btnVisible, setBtnVisible] = useState(false)
  const [visible, setVisible] = useState(true)

  const promptRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const badgeRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const btnRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (shouldReduce) {
      setPromptDone(true)
      setBadgeVisible(true)
      setBtnVisible(true)
      return
    }
    const typeDuration = challenge.prompt.length * 30 + 200
    promptRef.current = setTimeout(() => setPromptDone(true), typeDuration)
    badgeRef.current = setTimeout(() => setBadgeVisible(true), typeDuration + 100)
    btnRef.current = setTimeout(() => setBtnVisible(true), typeDuration + 350)
    return () => {
      if (promptRef.current) clearTimeout(promptRef.current)
      if (badgeRef.current) clearTimeout(badgeRef.current)
      if (btnRef.current) clearTimeout(btnRef.current)
    }
  }, [challenge.prompt, shouldReduce])

  async function handleStart() {
    // Play ascending C-E-G chime
    if (typeof window !== 'undefined') {
      try {
        const { soundEngine } = await import('@/components/sound/SoundEngine')
        soundEngine.playCollaboratorJoin()
      } catch {
        // ignore
      }
    }
    setVisible(false)
    setTimeout(onStart, 400)
  }

  const sizeLabel = `${challenge.canvasSize}×${challenge.canvasSize}`

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(255, 249, 240, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: '24px',
          }}
        >
          <motion.div
            initial={shouldReduce ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={shouldReduce ? undefined : { scale: 0.8, opacity: 0 }}
            transition={SPRING}
            className="parchment-card"
            style={{
              position: 'relative',
              maxWidth: '480px',
              width: '100%',
              padding: '40px',
            }}
          >
            <PixelPencil />

            {/* Heading */}
            <h2
              style={{
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 800,
                fontSize: '22px',
                color: 'var(--primary)',
                marginBottom: '8px',
                letterSpacing: '-0.02em',
              }}
            >
              Today&apos;s Challenge
            </h2>

            <p
              style={{
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 500,
                fontSize: '13px',
                color: 'var(--muted-foreground)',
                marginBottom: '20px',
              }}
            >
              {challenge.date}
            </p>

            {/* Prompt */}
            <p
              style={{
                fontFamily: 'Nunito, sans-serif',
                fontWeight: 700,
                fontSize: '20px',
                color: 'var(--foreground)',
                lineHeight: 1.4,
                marginBottom: '24px',
                minHeight: '60px',
              }}
            >
              <TypewriterText text={challenge.prompt} charDelayMs={30} />
            </p>

            {/* Canvas size badge */}
            <AnimatePresence>
              {badgeVisible && (
                <motion.div
                  key="badge"
                  initial={shouldReduce ? false : { scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '999px',
                    border: '2px solid var(--border)',
                    backgroundColor: 'var(--muted)',
                    marginBottom: '28px',
                    fontSize: '13px',
                    fontWeight: 700,
                    fontFamily: 'Nunito, sans-serif',
                    color: 'var(--foreground)',
                    boxShadow: '2px 2px 0px var(--border)',
                  }}
                >
                  <span className="mono">{sizeLabel}</span>
                  <span>canvas</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Start button */}
            <AnimatePresence>
              {btnVisible && (
                <motion.button
                  key="btn"
                  initial={shouldReduce ? false : { y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={SPRING}
                  className="btn-pixel"
                  onClick={handleStart}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '14px 0',
                    fontSize: '16px',
                    fontWeight: 800,
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--secondary-foreground)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Start Drawing
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
