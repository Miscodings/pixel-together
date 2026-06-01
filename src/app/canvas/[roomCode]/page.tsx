import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { supabase, mapRoomRow } from '@/lib/supabase'
import { CanvasRoomClient } from './CanvasRoomClient'
import type { CanvasRoom, DailyChallenge } from '@/types/canvas'

interface PageProps {
  params: Promise<{ roomCode: string }>
}

async function getRoom(roomCode: string): Promise<CanvasRoom | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_code', roomCode)
    .single()

  if (error || !data) return null
  return mapRoomRow(data)
}

async function getTodayChallenge(): Promise<DailyChallenge | null> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('date', today)
    .single()

  if (error || !data) return null
  return {
    date: data.date,
    prompt: data.prompt,
    canvasSize: data.canvas_size,
  }
}

export default async function CanvasRoomPage({ params }: PageProps) {
  const { roomCode } = await params
  const { userId } = await auth()

  // If not signed in, redirect to sign-in with return URL
  if (!userId) {
    redirect(`/sign-in?redirect_url=/canvas/${roomCode}`)
  }

  const user = await currentUser()
  const username =
    user?.username ??
    user?.firstName ??
    user?.emailAddresses[0]?.emailAddress?.split('@')[0] ??
    'Artist'

  const room = await getRoom(roomCode)

  if (!room) {
    redirect('/')
  }

  const challenge = room.isChallenge ? await getTodayChallenge() : null

  return (
    <CanvasRoomClient
      room={room}
      userId={userId}
      username={username}
      challenge={challenge}
    />
  )
}
