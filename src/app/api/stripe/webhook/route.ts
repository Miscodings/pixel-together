import { NextResponse } from 'next/server'
import Stripe from 'stripe'

// Stripe webhooks must read the RAW request body to verify the signature.
// Do not parse/transform the body before verification.
export const dynamic = 'force-dynamic'

function getStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-05-27.dahlia',
  })
}

// POST /api/stripe/webhook — receive and verify Stripe events.
//
// SECURITY: This endpoint is intentionally NOT auth-gated by Clerk (Stripe
// calls it directly with no user session). Authenticity is established ONLY
// via the Stripe-Signature header verified against STRIPE_WEBHOOK_SECRET.
// Never trust the payload without a successful constructEvent().
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // Read raw body for signature verification.
  const rawBody = await request.text()

  const stripe = getStripeClient()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id ?? session.metadata?.userId
        const tier = session.metadata?.tier
        if (userId && tier) {
          // Persist the entitlement to your source of truth here (e.g. update
          // the user's tier in the database / Clerk metadata). Tier limits MUST
          // be enforced server-side off this persisted value — never off a
          // client-supplied tier.
          console.info(`Checkout completed for user=${userId} tier=${tier}`)
        }
        break
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        // Downgrade / revoke entitlements as appropriate.
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
