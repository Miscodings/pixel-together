import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// POST /api/challenge/upvote — upvote a submission
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body?.submissionId) {
      return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 })
    }

    const submissionId: unknown = body.submissionId
    // submission ids are UUIDs — reject anything else before querying.
    if (
      typeof submissionId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)
    ) {
      return NextResponse.json({ error: 'Invalid submissionId' }, { status: 400 })
    }
    const client = createServerSupabaseClient()

    // Verify one upvote per userId per submission
    const { data: existing } = await client
      .from('upvotes')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Already upvoted' }, { status: 409 })
    }

    // Record the upvote
    const { error: upvoteError } = await client
      .from('upvotes')
      .insert({ submission_id: submissionId, user_id: userId })

    if (upvoteError) {
      console.error('Upvote insert error:', upvoteError)
      return NextResponse.json({ error: 'Failed to record upvote' }, { status: 500 })
    }

    // Increment the counter
    const { data: submission, error: updateError } = await client
      .from('submissions')
      .select('upvotes')
      .eq('id', submissionId)
      .single()

    if (updateError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    const newCount = submission.upvotes + 1
    const { error: incrError } = await client
      .from('submissions')
      .update({ upvotes: newCount })
      .eq('id', submissionId)

    if (incrError) {
      console.error('Upvote increment error:', incrError)
      return NextResponse.json({ error: 'Failed to increment upvote' }, { status: 500 })
    }

    return NextResponse.json({ upvotes: newCount })
  } catch (err) {
    console.error('POST /api/challenge/upvote error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
