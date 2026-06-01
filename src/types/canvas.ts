export type CanvasSize = 16 | 32 | 64
export type PixelColor = number // RGBA packed as Uint32

export interface PixelCanvas {
  width: CanvasSize
  height: CanvasSize
  pixels: Uint32Array
  timestamps: Float64Array
  version: number
}

export interface PixelUpdate {
  x: number
  y: number
  color: number // RGBA packed
  ts: number    // Lamport timestamp
  userId: string
}

export interface UserPresence {
  userId: string
  username: string
  color: string  // from PRESENCE_COLORS palette
  cursorX: number
  cursorY: number
  activeColor: number
  lastSeen: number
}

export type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'colorpicker' | 'zoomin' | 'zoomout' | 'clear'

export interface CanvasRoom {
  id: string
  name: string
  width: CanvasSize
  height: CanvasSize
  pixels: string      // base64-encoded Uint32Array
  timestamps: string  // base64-encoded Float64Array
  version: number
  ownerId: string
  roomCode: string    // 6-char shareable code
  isChallenge: boolean
  challengeDate?: string
  createdAt: Date
  updatedAt: Date
}

export interface DailyChallenge {
  date: string  // YYYY-MM-DD
  prompt: string
  canvasSize: CanvasSize
}

export interface Submission {
  id: string
  userId: string
  username: string
  canvasData: string  // base64 PNG thumbnail
  submittedAt: Date
  upvotes: number
  hasUpvoted?: boolean
}

export const PRESENCE_COLORS = [
  '#E63946', '#F4A261', '#52B788', '#7C5CBF',
  '#457B9D', '#E9C46A', '#F77F00', '#2A9D8F'
] as const
