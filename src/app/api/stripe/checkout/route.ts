import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'

function getStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia',
  })
}

const PRICE_MAP_KEYS = ['studio', 'team'] as const
type PriceTier = (typeof PRICE_MAP_KEYS)[number]

function getPriceId(tier: PriceTier): string | undefined {
  if (tier === 'studio') return process.env.STRIPE_STUDIO_PRICE_ID
  if (tier === 'team') return process.env.STRIPE_TEAM_PRICE_ID
  return undefined
}

// POST /api/stripe/checkout — create a Stripe checkout session
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const rawTier: string = body?.tier?.toLowerCase() ?? ''

    if (!PRICE_MAP_KEYS.includes(rawTier as PriceTier)) {
      return NextResponse.json({ error: 'Invalid tier. Use "studio" or "team".' }, { status: 400 })
    }

    const tier = rawTier as PriceTier
    const priceId = getPriceId(tier)
    if (!priceId) {
      return NextResponse.json({ error: `Price ID not configured for tier: ${tier}` }, { status: 500 })
    }

    // SECURITY: Never trust the client-supplied `Origin` header to build
    // redirect URLs — an attacker can set it to redirect the post-checkout
    // flow to a phishing domain. Derive the base URL from a trusted,
    // server-controlled env var, validating the incoming origin against it.
    const trustedBase = (
      process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    ).replace(/\/+$/, '')
    const requestOrigin = request.headers.get('origin')
    const origin = requestOrigin === trustedBase ? requestOrigin : trustedBase

    const stripe = getStripeClient()

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success&tier=${tier}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      metadata: {
        userId,
        tier,
      },
      client_reference_id: userId,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('POST /api/stripe/checkout error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
