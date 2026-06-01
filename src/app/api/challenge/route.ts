import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// GET /api/challenge — get today's daily challenge
export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const client = createServerSupabaseClient()

    const { data, error } = await client
      .from('challenges')
      .select('*')
      .eq('date', today)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'No challenge today' }, { status: 404 })
    }

    return NextResponse.json({
      date: data.date,
      prompt: data.prompt,
      canvasSize: data.canvas_size,
    })
  } catch (err) {
    console.error('GET /api/challenge error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/challenge/submit — handled by submit/route.ts
// POST /api/challenge/upvote  — handled by upvote/route.ts
