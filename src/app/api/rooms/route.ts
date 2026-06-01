import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { CanvasSize } from '@/types/canvas'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomCode(): string {
  return Array.from({ length: 6 }, () =>
    CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
  ).join('')
}

async function getUniqueRoomCode(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode()
    const { data } = await supabase
      .from('rooms')
      .select('room_code')
      .eq('room_code', code)
      .single()
    if (!data) return code
  }
  throw new Error('Failed to generate unique room code')
}

// POST /api/rooms — create a new canvas room
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const rawName: unknown = body.name
    const name: string =
      typeof rawName === 'string' && rawName.trim().length > 0
        ? rawName.trim().slice(0, 100)
        : 'Untitled Canvas'
    const width: CanvasSize = [16, 32, 64].includes(body.width) ? body.width : 32
    const height: CanvasSize = [16, 32, 64].includes(body.height) ? body.height : 32

    const client = createServerSupabaseClient()
    const roomCode = await getUniqueRoomCode(client)

    // Empty canvas = base64 of zero-filled Uint32Array
    const pixelCount = width * height
    const emptyPixels = Buffer.alloc(pixelCount * 4, 0).toString('base64')
    const emptyTimestamps = Buffer.alloc(pixelCount * 8, 0).toString('base64')

    const { data, error } = await client
      .from('rooms')
      .insert({
        name,
        width,
        height,
        pixels: emptyPixels,
        timestamps: emptyTimestamps,
        version: 0,
        owner_id: userId,
        room_code: roomCode,
        is_challenge: false,
        challenge_date: null,
      })
      .select('id, room_code')
      .single()

    if (error || !data) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }

    return NextResponse.json({ roomCode: data.room_code, canvasId: data.id }, { status: 201 })
  } catch (err) {
    console.error('POST /api/rooms error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/rooms?code=XXXXXX — get room by code
export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    if (!code) {
      return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 })
    }

    const normalizedCode = code.toUpperCase()
    // Room codes are 6 chars from a fixed alphabet. Reject anything else
    // before touching the database.
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalizedCode)) {
      return NextResponse.json({ error: 'Invalid room code' }, { status: 400 })
    }

    const client = createServerSupabaseClient()
    const { data, error } = await client
      .from('rooms')
      .select('*')
      .eq('room_code', normalizedCode)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('GET /api/rooms error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
