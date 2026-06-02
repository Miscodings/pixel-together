'use client'

import { useRef, useCallback, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  Zap,
  Trophy,
  Crosshair,
  Check,
  ArrowRight,
  Star,
} from 'lucide-react'

function useCreateRoom() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const create = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rooms', { method: 'POST' })
      const data = await res.json()
      if (data.roomCode) router.push(`/canvas/${data.roomCode}`)
    } finally {
      setLoading(false)
    }
  }, [router])
  return { create, loading }
}

function NavbarButtons() {
  const { isSignedIn } = useAuth()
  const { create, loading } = useCreateRoom()
  if (isSignedIn) {
    return (
      <button
        className="btn-pixel"
        onClick={create}
        disabled={loading}
        style={{ padding: '8px 20px', fontSize: '14px', backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        {loading ? 'Creating…' : 'Go to Canvas'}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Link href="/sign-in">
        <button className="btn-pixel" style={{ padding: '8px 20px', fontSize: '14px', backgroundColor: 'var(--card)', color: 'var(--foreground)' }}>
          Sign In
        </button>
      </Link>
      <Link href="/sign-up">
        <button className="btn-pixel" style={{ padding: '8px 20px', fontSize: '14px', backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          Start Drawing
        </button>
      </Link>
    </div>
  )
}

function HeroDrawButton() {
  const { isSignedIn } = useAuth()
  const { create, loading } = useCreateRoom()
  if (isSignedIn) {
    return (
      <button
        className="btn-pixel"
        onClick={create}
        disabled={loading}
        style={{ padding: '14px 32px', fontSize: '16px', fontWeight: 800, backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        {loading ? 'Creating room…' : 'Start Drawing'}
        <ArrowRight size={16} />
      </button>
    )
  }
  return (
    <Link href="/sign-up">
      <button className="btn-pixel" style={{ padding: '14px 32px', fontSize: '16px', fontWeight: 800, backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        Start Drawing Free
        <ArrowRight size={16} />
      </button>
    </Link>
  )
}

function JoinRoomInput() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const router = useRouter()
  const { isSignedIn } = useAuth()

  const join = useCallback(async () => {
    if (code.length < 6) return
    setError('')
    setChecking(true)
    try {
      const res = await fetch(`/api/rooms?code=${code}`)
      if (res.status === 404) { setError('Room not found'); return }
      if (!res.ok) { setError('Could not join room'); return }
      router.push(`/canvas/${code}`)
    } catch {
      setError('Could not join room')
    } finally {
      setChecking(false)
    }
  }, [code, router])

  if (!isSignedIn) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
          placeholder="Enter room code"
          maxLength={8}
          className="mono"
          style={{
            padding: '10px 16px',
            border: `2px solid ${error ? 'var(--destructive)' : 'var(--border)'}`,
            borderRadius: '10px',
            fontSize: '14px',
            fontFamily: 'JetBrains Mono, monospace',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
            width: '160px',
            outline: 'none',
          }}
          onKeyDown={e => { if (e.key === 'Enter') join() }}
        />
        <button
          className="btn-pixel"
          disabled={code.length < 6 || checking}
          onClick={join}
          style={{ padding: '10px 20px', fontSize: '14px', backgroundColor: 'var(--card)', color: 'var(--foreground)' }}
        >
          {checking ? '…' : 'Join'}
        </button>
      </div>
      {error && <span style={{ fontSize: '13px', color: 'var(--destructive)', fontFamily: 'Nunito, sans-serif' }}>{error}</span>}
    </div>
  )
}

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 25 }
const SPRING_SLOW = { type: 'spring' as const, stiffness: 300, damping: 20 }

function useScrollReveal() {
  const ref = useRef<HTMLDivElement | null>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return { ref, inView }
}

// ─── Pixel art preview (16×16 demo canvas) ──────────────────────────────────

const DEMO_COLORS = [
  '#7C5CBF', '#F4A261', '#52B788', '#E63946',
  '#457B9D', '#E9C46A', '#2A9D8F', '#EDE0FF',
]

function DemoPixelCanvas() {
  const SIZE = 16
  // Deterministic "art" pattern
  const pixels = Array.from({ length: SIZE * SIZE }, (_, i) => {
    const x = i % SIZE
    const y = Math.floor(i / SIZE)
    const cx = 8, cy = 8
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    if (dist < 2) return '#E63946'
    if (dist < 4) return '#F4A261'
    if (dist < 6) return '#52B788'
    if (dist < 8) return '#7C5CBF'
    if ((x + y) % 3 === 0) return '#E9C46A'
    if ((x * y) % 5 === 0) return '#457B9D'
    return '#EDE0FF'
  })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
        width: '100%',
        maxWidth: '320px',
        aspectRatio: '1',
        border: '2px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '4px 4px 0px 0px var(--border)',
        imageRendering: 'pixelated',
      }}
    >
      {pixels.map((color, i) => (
        <div key={i} style={{ backgroundColor: color }} />
      ))}
    </div>
  )
}

// ─── Navbar ──────────────────────────────────────────────────────────────────

function Navbar() {
  const shouldReduce = useReducedMotion()

  return (
    <motion.nav
      initial={shouldReduce ? false : { y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={SPRING}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        height: '64px',
        backgroundColor: 'var(--card)',
        borderBottom: '2px solid var(--border)',
        boxShadow: '0 2px 0px 0px var(--border)',
      }}
    >
      <span
        className="wordmark"
        style={{ fontSize: '22px', color: 'var(--primary)', letterSpacing: '-0.02em' }}
      >
        PixelTogether
      </span>

      <NavbarButtons />
    </motion.nav>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  const shouldReduce = useReducedMotion()

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '80px 24px 64px',
        gap: '32px',
        maxWidth: '900px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <motion.div
        initial={shouldReduce ? false : { y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.05 }}
      >
        {/* Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 16px',
            borderRadius: '999px',
            border: '2px solid var(--border)',
            backgroundColor: 'var(--muted)',
            boxShadow: '2px 2px 0px var(--border)',
            marginBottom: '24px',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--primary)',
          }}
        >
          <Star size={13} fill="var(--secondary)" stroke="var(--secondary)" />
          Real-time pixel art collaboration
        </div>

        <h1
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(36px, 7vw, 72px)',
            color: 'var(--foreground)',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: '20px',
          }}
        >
          Draw Together,{' '}
          <span style={{ color: 'var(--primary)' }}>Pixel</span>{' '}
          <span style={{ color: 'var(--secondary)' }}>by Pixel</span>
        </h1>
      </motion.div>

      <motion.p
        initial={shouldReduce ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.1 }}
        style={{
          fontFamily: 'Nunito, sans-serif',
          fontWeight: 500,
          fontSize: '18px',
          color: 'var(--muted-foreground)',
          maxWidth: '540px',
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        Collaborate on pixel art in real-time with friends. Daily challenges, instant sync,
        and a canvas that feels like a party.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={shouldReduce ? false : { y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.15 }}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <HeroDrawButton />
          <Link href="#demo">
            <button
              className="btn-pixel"
              style={{
                padding: '14px 32px',
                fontSize: '16px',
                fontWeight: 800,
                backgroundColor: 'transparent',
                color: 'var(--foreground)',
              }}
            >
              See it live
            </button>
          </Link>
        </div>
        <JoinRoomInput />
      </motion.div>

      {/* Demo canvas */}
      <motion.div
        id="demo"
        initial={shouldReduce ? false : { scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING_SLOW, delay: 0.2 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          marginTop: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            marginBottom: '8px',
          }}
        >
          {[
            { color: '#E63946', label: 'Alice' },
            { color: '#52B788', label: 'Bob' },
            { color: '#7C5CBF', label: 'Carol' },
          ].map((u) => (
            <div
              key={u.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '999px',
                border: '2px solid var(--border)',
                backgroundColor: 'var(--card)',
                boxShadow: '2px 2px 0px var(--border)',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'Nunito, sans-serif',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: u.color,
                  border: '1.5px solid var(--border)',
                }}
              />
              {u.label}
            </div>
          ))}
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--accent)',
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            drawing live...
          </div>
        </div>

        <DemoPixelCanvas />

        <p
          style={{
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 600,
          }}
        >
          16×16 canvas — each pixel placed by a different collaborator
        </p>
      </motion.div>
    </section>
  )
}

// ─── Features ────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    Icon: Zap,
    title: 'Real-Time Sync',
    description:
      'Every pixel you place is broadcast instantly to all collaborators via WebSocket. CRDT-powered conflict resolution means no lost strokes.',
    color: 'var(--secondary)',
  },
  {
    Icon: Trophy,
    title: 'Daily Challenges',
    description:
      'A new pixel art prompt every day. Compete solo or with your team, then vote for your favorites on the live leaderboard.',
    color: 'var(--accent)',
  },
  {
    Icon: Crosshair,
    title: 'Pixel Perfect',
    description:
      'Export at 1×, 4×, or 8× resolution. RGBA color picker, flood fill, eyedropper, and undo/redo — every pro tool you need.',
    color: 'var(--primary)',
  },
]

function Features() {
  const { ref, inView } = useScrollReveal()
  const shouldReduce = useReducedMotion()

  return (
    <section
      style={{
        padding: '80px 24px',
        backgroundColor: 'var(--muted)',
        borderTop: '2px solid var(--border)',
        borderBottom: '2px solid var(--border)',
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <motion.h2
          ref={ref}
          initial={shouldReduce ? false : { y: 20, opacity: 0 }}
          animate={inView ? { y: 0, opacity: 1 } : {}}
          transition={SPRING}
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 42px)',
            color: 'var(--foreground)',
            textAlign: 'center',
            marginBottom: '48px',
            letterSpacing: '-0.02em',
          }}
        >
          Everything you need to create together
        </motion.h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '24px',
          }}
        >
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={shouldReduce ? false : { y: 24, opacity: 0 }}
              animate={inView ? { y: 0, opacity: 1 } : {}}
              transition={{ ...SPRING, delay: i * 0.04 }}
              className="card-pixel"
              style={{
                padding: '28px 24px',
                backgroundColor: 'var(--card)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  border: '2px solid var(--border)',
                  backgroundColor: feature.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '2px 2px 0px var(--border)',
                  flexShrink: 0,
                }}
              >
                <feature.Icon size={22} color="#fff" />
              </div>

              <div>
                <h3
                  style={{
                    fontFamily: 'Nunito, sans-serif',
                    fontWeight: 700,
                    fontSize: '18px',
                    color: 'var(--foreground)',
                    marginBottom: '8px',
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{
                    fontFamily: 'Nunito, sans-serif',
                    fontSize: '14px',
                    color: 'var(--muted-foreground)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    tagline: 'Start creating together',
    color: 'var(--muted)',
    accentColor: 'var(--primary)',
    features: [
      '2 users per canvas',
      '1 daily challenge',
      'PNG export 1×',
      'Last 5 canvases',
    ],
    cta: 'Get started',
    ctaBg: 'var(--primary)',
    ctaColor: 'var(--primary-foreground)',
  },
  {
    name: 'Studio',
    price: '$6',
    period: '/mo',
    tagline: 'For serious pixel artists',
    color: 'var(--primary)',
    accentColor: '#fff',
    highlight: true,
    features: [
      '4 users per canvas',
      'Unlimited challenges',
      'PNG export 1× / 4× / 8×',
      'Unlimited canvases',
    ],
    cta: 'Go Studio',
    ctaBg: 'var(--secondary)',
    ctaColor: 'var(--secondary-foreground)',
  },
  {
    name: 'Team',
    price: '$14',
    period: '/mo',
    tagline: 'For creative teams',
    color: 'var(--accent)',
    accentColor: '#fff',
    features: [
      '8 users per canvas',
      'Unlimited + custom prompts',
      'All export formats',
      'Unlimited + version history',
    ],
    cta: 'Go Team',
    ctaBg: 'var(--foreground)',
    ctaColor: 'var(--background)',
  },
]

function Pricing() {
  const { ref, inView } = useScrollReveal()
  const shouldReduce = useReducedMotion()

  return (
    <section style={{ padding: '80px 24px' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <motion.div
          ref={ref}
          initial={shouldReduce ? false : { y: 20, opacity: 0 }}
          animate={inView ? { y: 0, opacity: 1 } : {}}
          transition={SPRING}
          style={{ textAlign: 'center', marginBottom: '48px' }}
        >
          <h2
            style={{
              fontFamily: 'Nunito, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(28px, 4vw, 42px)',
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
              marginBottom: '12px',
            }}
          >
            Simple, transparent pricing
          </h2>
          <p
            style={{
              fontFamily: 'Nunito, sans-serif',
              fontSize: '16px',
              color: 'var(--muted-foreground)',
              margin: 0,
            }}
          >
            Start free. Upgrade when your canvas needs more room.
          </p>
        </motion.div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '24px',
            alignItems: 'stretch',
          }}
        >
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={shouldReduce ? false : { y: 28, opacity: 0 }}
              animate={inView ? { y: 0, opacity: 1 } : {}}
              transition={{ ...SPRING, delay: i * 0.05 }}
              className="card-pixel"
              style={{
                backgroundColor: 'var(--card)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                ...(plan.highlight
                  ? {
                      borderColor: 'var(--primary)',
                      boxShadow: '4px 4px 0px 0px var(--primary)',
                    }
                  : {}),
              }}
            >
              {/* Plan header */}
              <div
                style={{
                  padding: '24px 24px 20px',
                  backgroundColor: plan.color,
                  borderBottom: '2px solid var(--border)',
                }}
              >
                {plan.highlight && (
                  <div
                    style={{
                      display: 'inline-block',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '999px',
                      backgroundColor: 'var(--secondary)',
                      color: 'var(--secondary-foreground)',
                      border: '2px solid var(--border)',
                      marginBottom: '8px',
                      fontFamily: 'Nunito, sans-serif',
                    }}
                  >
                    MOST POPULAR
                  </div>
                )}
                <div
                  style={{
                    fontFamily: 'Nunito, sans-serif',
                    fontWeight: 800,
                    fontSize: '20px',
                    color: plan.highlight ? '#fff' : 'var(--foreground)',
                  }}
                >
                  {plan.name}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '2px',
                    marginTop: '8px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Nunito, sans-serif',
                      fontWeight: 900,
                      fontSize: '36px',
                      color: plan.highlight ? '#fff' : 'var(--foreground)',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span
                      style={{
                        fontFamily: 'Nunito, sans-serif',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: plan.highlight ? 'rgba(255,255,255,0.8)' : 'var(--muted-foreground)',
                      }}
                    >
                      {plan.period}
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontFamily: 'Nunito, sans-serif',
                    fontSize: '13px',
                    color: plan.highlight ? 'rgba(255,255,255,0.85)' : 'var(--muted-foreground)',
                    margin: '6px 0 0',
                  }}
                >
                  {plan.tagline}
                </p>
              </div>

              {/* Features */}
              <div style={{ padding: '20px 24px', flex: 1 }}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {plan.features.map((feat) => (
                    <li
                      key={feat}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        fontFamily: 'Nunito, sans-serif',
                        fontSize: '14px',
                        color: 'var(--foreground)',
                        fontWeight: 500,
                      }}
                    >
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--accent)',
                          border: '1.5px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: '1px',
                        }}
                      >
                        <Check size={11} color="#fff" strokeWidth={3} />
                      </div>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div style={{ padding: '0 24px 24px' }}>
                <Link href="/sign-up">
                  <button
                    className="btn-pixel"
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      fontSize: '15px',
                      fontWeight: 800,
                      backgroundColor: plan.ctaBg,
                      color: plan.ctaColor,
                    }}
                  >
                    {plan.cta}
                  </button>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      style={{
        borderTop: '2px solid var(--border)',
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: 'var(--card)',
      }}
    >
      <span
        className="wordmark"
        style={{ fontSize: '18px', color: 'var(--primary)' }}
      >
        PixelTogether
      </span>
      <p
        style={{
          fontFamily: 'Nunito, sans-serif',
          fontSize: '14px',
          color: 'var(--muted-foreground)',
          margin: 0,
        }}
      >
        Built with ♥ by Justin Dutta
      </p>
      <div style={{ display: 'flex', gap: '16px' }}>
        <Link
          href="/sign-in"
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontSize: '13px',
            color: 'var(--muted-foreground)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          style={{
            fontFamily: 'Nunito, sans-serif',
            fontSize: '13px',
            color: 'var(--primary)',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Get Started Free
        </Link>
      </div>
    </footer>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--background)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Navbar />
      <main style={{ flex: 1 }}>
        <Hero />
        <Features />
        <Pricing />
      </main>
      <Footer />
    </div>
  )
}
