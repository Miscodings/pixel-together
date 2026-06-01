import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { SignJWT } from 'jose'

// Short-lived token (5 min) that the WS server verifies.
// Prevents clients from spoofing userId/username in the join message.
const TTL_SECONDS = 300

function getSecret(): Uint8Array {
  const raw = process.env.WS_TOKEN_SECRET
  if (!raw || raw.length < 32) {
    throw new Error('WS_TOKEN_SECRET must be set and at least 32 characters')
  }
  return new TextEncoder().encode(raw)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { roomCode?: unknown }
  const roomCode = typeof body.roomCode === 'string' ? body.roomCode.toUpperCase() : null
  if (!roomCode || !/^[A-HJ-NP-Z2-9]{6,8}$/.test(roomCode)) {
    return NextResponse.json({ error: 'Invalid roomCode' }, { status: 400 })
  }

  const user = await currentUser()
  const username = user?.username ?? user?.firstName ?? `user_${userId.slice(-6)}`

  const token = await new SignJWT({ userId, username, roomCode })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret())

  return NextResponse.json({ token })
}
