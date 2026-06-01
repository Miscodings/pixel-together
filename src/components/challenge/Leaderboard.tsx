'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Heart } from 'lucide-react'
import type { Submission } from '@/types/canvas'

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 20 }
const SPRING_FAST = { type: 'spring' as const, stiffness: 400, damping: 25 }

interface ParticleHeart {
  id: number
  dx: number
  dy: number
}

interface SubmissionCardProps {
  submission: Submission
  rank: number
  onUpvote: (id: string) => void
  index: number
}

function RibbonCorner({ rank }: { rank: number }) {
  if (rank > 3) return null
  const colors: Record<number, string> = {
    1: '#F4A261',
    2: '#C0C0C0',
    3: '#CD7F32',
  }
  const labels: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' }
  const color = colors[rank]

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        borderStyle: 'solid',
        borderWidth: '48px 48px 0 0',
        borderColor: `${color} transparent transparent transparent`,
        zIndex: 2,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '-44px',
          left: '4px',
          fontSize: '10px',
          fontWeight: 800,
          color: rank === 1 ? '#2D1B4E' : '#FFFFFF',
          fontFamily: 'Nunito, sans-serif',
          lineHeight: 1,
          transform: 'rotate(-45deg)',
          whiteSpace: 'nowrap',
        }}
      >
        {labels[rank]}
      </span>
    </div>
  )
}

function UpvoteParticles({ particles }: { particles: ParticleHeart[] }) {
  return (
    <>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            fontSize: '16px',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          ♥
        </motion.div>
      ))}
    </>
  )
}

function SubmissionCard({ submission, rank, onUpvote, index }: SubmissionCardProps) {
  const shouldReduce = useReducedMotion()
  const [particles, setParticles] = useState<ParticleHeart[]>([])
  const [upvoted, setUpvoted] = useState(submission.hasUpvoted ?? false)
  const [count, setCount] = useState(submission.upvotes)
  const [pressing, setPressing] = useState(false)

  const rankBorderColors: Record<number, string | undefined> = {
    1: '#F4A261',
    2: '#C0C0C0',
    3: '#CD7F32',
  }
  const borderColor = rankBorderColors[rank] ?? 'var(--border)'

  const handleUpvote = useCallback(async () => {
    if (upvoted) return
    setUpvoted(true)
    setCount((c) => c + 1)
    onUpvote(submission.id)

    // Particle burst — 8 hearts in random directions
    const id = Date.now()
    const burst: ParticleHeart[] = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2
      const dist = 40 + Math.random() * 20
      return {
        id: id + i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
      }
    })
    setParticles(burst)
    setTimeout(() => setParticles([]), 500)
  }, [upvoted, onUpvote, submission.id])

  const timeAgo = (() => {
    const diff = Date.now() - new Date(submission.submittedAt).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  })()

  return (
    <motion.div
      initial={shouldReduce ? false : { y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...SPRING, delay: index * 0.05 }}
      whileHover={shouldReduce ? undefined : { scale: 1.04 }}
      className="card-pixel"
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--card)',
        borderColor,
        boxShadow: `3px 3px 0px 0px ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        cursor: 'default',
      }}
    >
      <RibbonCorner rank={rank} />

      {/* Thumbnail */}
      <div style={{ aspectRatio: '1', backgroundColor: '#f0f0f0', overflow: 'hidden' }}>
        {submission.canvasData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={submission.canvasData}
            alt={`Pixel art by ${submission.username}`}
            style={{
              width: '100%',
              height: '100%',
              imageRendering: 'pixelated',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, var(--muted) 0%, var(--primary) 100%)',
            }}
          />
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 600,
              fontSize: '14px',
              color: 'var(--foreground)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {submission.username}
          </div>
          <div
            style={{
              fontFamily: 'Nunito, sans-serif',
              fontSize: '11px',
              color: 'var(--muted-foreground)',
            }}
          >
            {timeAgo}
          </div>
        </div>

        {/* Upvote button */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <AnimatePresence>{particles.length > 0 && <UpvoteParticles particles={particles} />}</AnimatePresence>
          <motion.button
            whileTap={shouldReduce ? undefined : { scale: 0.85 }}
            onMouseDown={() => setPressing(true)}
            onMouseUp={() => setPressing(false)}
            onMouseLeave={() => setPressing(false)}
            onClick={handleUpvote}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '2px solid var(--border)',
              boxShadow: pressing ? '1px 1px 0px var(--border)' : '2px 2px 0px var(--border)',
              transform: pressing ? 'translate(1px,1px)' : 'none',
              backgroundColor: upvoted ? 'var(--destructive)' : 'var(--card)',
              color: upvoted ? '#fff' : 'var(--foreground)',
              cursor: upvoted ? 'default' : 'pointer',
              transition: 'transform 80ms ease, box-shadow 80ms ease',
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 700,
              fontSize: '13px',
            }}
            disabled={upvoted}
          >
            <Heart size={14} fill={upvoted ? '#fff' : 'none'} />
            {count}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

interface LeaderboardProps {
  submissions: Submission[]
  onUpvote?: (id: string) => void
}

export function Leaderboard({ submissions, onUpvote }: LeaderboardProps) {
  const shouldReduce = useReducedMotion()
  const [localSubmissions, setLocalSubmissions] = useState(submissions)

  const handleUpvote = useCallback(
    (id: string) => {
      onUpvote?.(id)
      setLocalSubmissions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, upvotes: s.upvotes + 1, hasUpvoted: true } : s,
        ),
      )
    },
    [onUpvote],
  )

  if (localSubmissions.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          fontFamily: 'Nunito, sans-serif',
          color: 'var(--muted-foreground)',
          fontSize: '16px',
          fontWeight: 600,
        }}
      >
        No submissions yet — be the first to draw today&apos;s challenge!
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '20px',
        padding: '24px',
      }}
    >
      {localSubmissions.map((submission, index) => (
        <SubmissionCard
          key={submission.id}
          submission={submission}
          rank={index + 1}
          onUpvote={handleUpvote}
          index={index}
        />
      ))}
    </div>
  )
}
