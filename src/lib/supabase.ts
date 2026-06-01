import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { CanvasRoom, Submission } from '@/types/canvas'

// ─── Database schema types ─────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string
          name: string
          width: 16 | 32 | 64
          height: 16 | 32 | 64
          pixels: string
          timestamps: string
          version: number
          owner_id: string
          room_code: string
          is_challenge: boolean
          challenge_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          width: 16 | 32 | 64
          height: 16 | 32 | 64
          pixels: string
          timestamps: string
          version?: number
          owner_id: string
          room_code: string
          is_challenge?: boolean
          challenge_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          width?: 16 | 32 | 64
          height?: 16 | 32 | 64
          pixels?: string
          timestamps?: string
          version?: number
          owner_id?: string
          room_code?: string
          is_challenge?: boolean
          challenge_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          date: string
          prompt: string
          canvas_size: 16 | 32 | 64
        }
        Insert: {
          date: string
          prompt: string
          canvas_size: 16 | 32 | 64
        }
        Update: {
          date?: string
          prompt?: string
          canvas_size?: 16 | 32 | 64
        }
        Relationships: []
      }
      submissions: {
        Row: {
          id: string
          challenge_date: string
          user_id: string
          username: string
          canvas_data: string
          submitted_at: string
          upvotes: number
        }
        Insert: {
          id?: string
          challenge_date: string
          user_id: string
          username: string
          canvas_data: string
          submitted_at?: string
          upvotes?: number
        }
        Update: {
          upvotes?: number
        }
        Relationships: []
      }
      upvotes: {
        Row: {
          id: string
          submission_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          user_id: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// ─── Client factory ────────────────────────────────────────────────────────

const getSupabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const getSupabaseAnonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Lazy singleton — avoids module-level instantiation errors at build time
let _supabase: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!_supabase) {
    _supabase = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey())
  }
  return _supabase
}

// Named export for convenience; always calls getSupabaseClient() lazily
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_target, prop: string | symbol): any {
    const client = getSupabaseClient()
    const clientAsAny = client as unknown as Record<string | symbol, unknown>
    const val = clientAsAny[prop]
    if (typeof val === 'function') {
      return (val as (...args: unknown[]) => unknown).bind(client)
    }
    return val
  },
})

/** Server-side client with service role — never expose to the browser. */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient<Database>(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false },
  })
}

// ─── Row → domain mappers ──────────────────────────────────────────────────

type RoomRow = Database['public']['Tables']['rooms']['Row']

export function mapRoomRow(row: RoomRow): CanvasRoom {
  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    pixels: row.pixels,
    timestamps: row.timestamps,
    version: row.version,
    ownerId: row.owner_id,
    roomCode: row.room_code,
    isChallenge: row.is_challenge,
    challengeDate: row.challenge_date ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

type SubmissionRow = Database['public']['Tables']['submissions']['Row']

export function mapSubmissionRow(row: SubmissionRow): Submission {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    canvasData: row.canvas_data,
    submittedAt: new Date(row.submitted_at),
    upvotes: row.upvotes,
  }
}
