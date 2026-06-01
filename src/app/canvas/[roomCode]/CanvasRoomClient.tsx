'use client'

import { useState } from 'react'
import { CanvasWorkspace } from '@/components/canvas/CanvasWorkspace'
import { DailyChallengeOverlay } from '@/components/challenge/DailyChallengeOverlay'
import type { CanvasRoom, DailyChallenge } from '@/types/canvas'

interface CanvasRoomClientProps {
  room: CanvasRoom
  userId: string
  username: string
  challenge: DailyChallenge | null
}

export function CanvasRoomClient({
  room,
  userId,
  username,
  challenge,
}: CanvasRoomClientProps) {
  const [challengeVisible, setChallengeVisible] = useState(!!challenge)

  return (
    <>
      {challengeVisible && challenge && (
        <DailyChallengeOverlay
          challenge={challenge}
          onStart={() => setChallengeVisible(false)}
        />
      )}
      <CanvasWorkspace
        roomCode={room.roomCode}
        roomId={room.id}
        userId={userId}
        username={username}
        canvasWidth={room.width}
        canvasHeight={room.height}
        initialName={room.name}
      />
    </>
  )
}
