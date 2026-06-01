import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// POST /api/challenge/submit — submit daily challenge entry
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body?.canvasData || !body?.username) {
      return NextResponse.json({ error: 'Missing canvasData or username' }, { status: 400 })
    }

    const username: unknown = body.username
    const canvasData: unknown = body.canvasData

    if (typeof username !== 'string' || username.trim().length === 0 || username.length > 64) {
      return NextResponse.json({ error: 'Invalid username' }, { status: 400 })
    }

    // canvasData is later rendered as an <img src> on the leaderboard. Only
    // accept a PNG data-URL of bounded size to prevent stored-content abuse
    // (e.g. arbitrary URLs, oversized payloads, or non-image schemes).
    if (
      typeof canvasData !== 'string' ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(canvasData) ||
      canvasData.length > 2_000_000
    ) {
      return NextResponse.json({ error: 'Invalid canvasData' }, { status: 400 })
    }

    const safeUsername = username.trim().slice(0, 64)

    const today = new Date().toISOString().split('T')[0]
    const client = createServerSupabaseClient()

    // Verify one submission per userId per day
    const { data: existing } = await client
      .from('submissions')
      .select('id')
      .eq('user_id', userId)
      .eq('challenge_date', today)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Already submitted today' }, { status: 409 })
    }

    // Verify challenge exists
    const { data: challenge } = await client
      .from('challenges')
      .select('date')
      .eq('date', today)
      .single()

    if (!challenge) {
      return NextResponse.json({ error: 'No challenge today' }, { status: 404 })
    }

    const { data, error } = await client
      .from('submissions')
      .insert({
        challenge_date: today,
        user_id: userId,
        username: safeUsername,
        canvas_data: canvasData,
        upvotes: 0,
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('Submission insert error:', error)
      return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
    }

    return NextResponse.json({
      id: data.id,
      userId: data.user_id,
      username: data.username,
      canvasData: data.canvas_data,
      submittedAt: data.submitted_at,
      upvotes: data.upvotes,
    }, { status: 201 })
  } catch (err) {
    console.error('POST /api/challenge/submit error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
