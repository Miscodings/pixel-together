import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const hasRealClerkKey =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_') &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.includes('placeholder')

// Preview mode is only valid in non-production environments
const PREVIEW_MODE = process.env.NODE_ENV !== 'production' && !hasRealClerkKey

const PUBLIC_PATHS = [
  '/',
  '/sign-in',
  '/sign-up',
  '/api/challenge',
]

function isPublicPath(pathname: string): boolean {
  // Exact matches
  for (const route of PUBLIC_PATHS) {
    if (pathname === route) return true
  }
  // Clerk auth catch-all routes
  if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) return true
  // The challenge leaderboard/read API is intentionally public. Only the
  // GET endpoint at exactly /api/challenge is public; the authenticated
  // sub-routes (/api/challenge/submit, /api/challenge/upvote) enforce auth
  // in their own handlers AND must remain protected here as a defense in
  // depth, so we deliberately do NOT blanket-allow the whole subtree.
  if (pathname === '/api/challenge') return true
  // Stripe webhook is authenticated by signature, not by Clerk session.
  if (pathname === '/api/stripe/webhook') return true
  return false
}

// NOTE: Next.js 16 `proxy.ts` must export EXACTLY ONE function — either a
// named `proxy` export OR a default export, never both. We use a single
// default export wrapped in Clerk's auth middleware. Do not re-introduce a
// separate `export function proxy()`; it silently shadows/conflicts with this
// auth-enforcing handler and can disable route protection.
// In dev preview mode (no real Clerk key) let all traffic through so you can
// see the UI without credentials. In production this path is never reached
// because PREVIEW_MODE is false when NODE_ENV === 'production'.
function previewMiddleware(_request: NextRequest) {
  return NextResponse.next()
}

import { clerkMiddleware } from '@clerk/nextjs/server'

const authMiddleware = clerkMiddleware(async (auth, request: NextRequest) => {
  const pathname = request.nextUrl.pathname

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const { userId } = await auth()
  if (!userId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const signInUrl = new URL('/sign-in', request.url)
    signInUrl.searchParams.set('redirect_url', pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export default PREVIEW_MODE ? previewMiddleware : authMiddleware

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
