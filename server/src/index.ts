import 'dotenv/config'
import { WebSocketServer, WebSocket, RawData } from 'ws'
import { jwtVerify } from 'jose'
import {
  PixelCanvas,
  PixelUpdate,
  CanvasSize,
  applyPixelUpdate,
  createCanvas,
  serializeCanvas,
  deserializeCanvas,
} from './crdt.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserPresence {
  userId: string
  username: string
  color: string
  cursorX: number
  cursorY: number
  activeColor: number
  lastSeen: number
}

export interface Room {
  canvasId: string
  clients: Map<WebSocket, UserPresence>
  canvas: PixelCanvas
  dirty: boolean
  lastActivity: number
  evictionTimer?: ReturnType<typeof setTimeout>
}

interface ClientMeta {
  roomId: string | null
  /** Pixel update timestamps within the current sliding window */
  rateBucket: number[]
  /** Whether the join handshake has been completed */
  joined: boolean
  /** Timer that fires if join is not received in time */
  joinTimer: ReturnType<typeof setTimeout>
  /** Keepalive bookkeeping */
  isAlive: boolean
  /** Per-client pong-timeout timer: fires KEEPALIVE_TIMEOUT_MS after a ping if no pong received */
  pongTimer: ReturnType<typeof setTimeout> | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PRESENCE_COLORS = [
  '#E63946', '#F4A261', '#52B788', '#7C5CBF',
  '#457B9D', '#E9C46A', '#F77F00', '#2A9D8F',
]

const PORT = parseInt(process.env.PORT ?? process.env.SERVER_PORT ?? '3001', 10)
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const APP_ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:3000'

// Derive the same secret the Next.js app uses to sign WS tokens
function getTokenSecret(): Uint8Array {
  const raw = process.env.WS_TOKEN_SECRET ?? ''
  if (raw.length < 32) throw new Error('WS_TOKEN_SECRET must be at least 32 chars')
  return new TextEncoder().encode(raw)
}

interface WsTokenClaims {
  userId: string
  username: string
  roomCode: string
}

async function verifyWsToken(token: string): Promise<WsTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getTokenSecret(), {
      algorithms: ['HS256'],
      issuer: 'pixeltogether-app',
      audience: 'pixeltogether-ws',
    })
    const { userId, username, roomCode } = payload as Record<string, unknown>
    if (typeof userId !== 'string' || typeof username !== 'string' || typeof roomCode !== 'string') {
      return null
    }
    return { userId, username, roomCode }
  } catch {
    return null
  }
}

const RATE_LIMIT_WINDOW_MS = 1000
const RATE_LIMIT_MAX = 100
const FLUSH_INTERVAL_MS = 5000
const KEEPALIVE_INTERVAL_MS = 30_000
const KEEPALIVE_TIMEOUT_MS = 35_000
const JOIN_TIMEOUT_MS = 5000
const CURSOR_EXPIRY_MS = 2000
const MAX_MESSAGE_BYTES = 64 * 1024  // 64 KB
const MAX_USERNAME_LEN = 32
const USERNAME_RE = /^[a-zA-Z0-9 ]+$/
const DEFAULT_CANVAS_SIZE: CanvasSize = 32

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const rooms: Map<string, Room> = new Map()
const clientMeta: WeakMap<WebSocket, ClientMeta> = new WeakMap()

// ---------------------------------------------------------------------------
// Helpers — Supabase REST
// ---------------------------------------------------------------------------

async function supabaseGet(table: string, filter: string): Promise<Record<string, unknown> | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return null
    const rows = await res.json() as Record<string, unknown>[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function supabasePatch(
  table: string,
  filter: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Helpers — Room loading
// ---------------------------------------------------------------------------

async function loadOrCreateRoom(roomId: string): Promise<Room> {
  const existing = rooms.get(roomId)
  if (existing) {
    // Clear any pending eviction since a client is rejoining
    if (existing.evictionTimer) {
      clearTimeout(existing.evictionTimer)
      existing.evictionTimer = undefined
    }
    return existing
  }

  let canvas: PixelCanvas = createCanvas(DEFAULT_CANVAS_SIZE, DEFAULT_CANVAS_SIZE)
  let canvasId = roomId

  // Try to load from Supabase
  const row = await supabaseGet('rooms', `room_code=eq.${encodeURIComponent(roomId)}`)
  if (row) {
    canvasId = (row.id as string) ?? roomId
    const w = (row.width as CanvasSize) ?? DEFAULT_CANVAS_SIZE
    const h = (row.height as CanvasSize) ?? DEFAULT_CANVAS_SIZE
    const pixelsB64 = row.pixels as string | undefined
    const tsB64 = row.timestamps as string | undefined
    const version = (row.version as number) ?? 0

    if (pixelsB64 && tsB64) {
      try {
        canvas = deserializeCanvas(w, h, pixelsB64, tsB64)
        canvas.version = version
      } catch {
        canvas = createCanvas(w, h)
        canvas.version = version
      }
    } else {
      canvas = createCanvas(w, h)
      canvas.version = version
    }
  }

  const room: Room = {
    canvasId,
    clients: new Map(),
    canvas,
    dirty: false,
    lastActivity: Date.now(),
  }
  rooms.set(roomId, room)
  return room
}

// ---------------------------------------------------------------------------
// Helpers — Sending messages
// ---------------------------------------------------------------------------

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

function broadcastRoom(room: Room, payload: unknown, exclude?: WebSocket): void {
  const msg = JSON.stringify(payload)
  for (const [client] of room.clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  }
}

function buildPresenceList(room: Room): UserPresence[] {
  const now = Date.now()
  return Array.from(room.clients.values()).map(p => ({
    ...p,
    // Zero out stale cursors
    cursorX: now - p.lastSeen > CURSOR_EXPIRY_MS ? -1 : p.cursorX,
    cursorY: now - p.lastSeen > CURSOR_EXPIRY_MS ? -1 : p.cursorY,
  }))
}

// ---------------------------------------------------------------------------
// Helpers — Input validation
// ---------------------------------------------------------------------------

function sanitizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().slice(0, MAX_USERNAME_LEN)
  if (!USERNAME_RE.test(trimmed) || trimmed.length === 0) return null
  return trimmed
}

function isValidUint32(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xFFFFFFFF
}

function isValidCoord(v: unknown, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < max
}

function isValidTs(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v) && v >= 0
}

// ---------------------------------------------------------------------------
// Helpers — Rate limiting
// ---------------------------------------------------------------------------

function checkRateLimit(meta: ClientMeta): boolean {
  const now = Date.now()
  // Slide the window: drop timestamps older than 1 second
  meta.rateBucket = meta.rateBucket.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (meta.rateBucket.length >= RATE_LIMIT_MAX) {
    return false
  }
  meta.rateBucket.push(now)
  return true
}

// ---------------------------------------------------------------------------
// Helpers — DB flush
// ---------------------------------------------------------------------------

async function flushRoom(roomId: string, room: Room): Promise<void> {
  if (!room.dirty) return
  const serialized = serializeCanvas(room.canvas)
  const ok = await supabasePatch(
    'rooms',
    `room_code=eq.${encodeURIComponent(roomId)}`,
    {
      pixels: serialized.pixels,
      timestamps: serialized.timestamps,
      version: room.canvas.version,
      updated_at: new Date().toISOString(),
    },
  )
  if (ok) {
    room.dirty = false
  }
}

async function flushAllDirtyRooms(): Promise<void> {
  const promises: Promise<void>[] = []
  for (const [roomId, room] of rooms) {
    if (room.dirty) {
      promises.push(flushRoom(roomId, room))
    }
  }
  await Promise.allSettled(promises)
}

// ---------------------------------------------------------------------------
// Helpers — Disconnect / cleanup
// ---------------------------------------------------------------------------

function removeClientFromRoom(ws: WebSocket, meta: ClientMeta): void {
  if (!meta.roomId) return
  const room = rooms.get(meta.roomId)
  if (!room) return

  const presence = room.clients.get(ws)
  room.clients.delete(ws)
  room.lastActivity = Date.now()

  if (presence) {
    broadcastRoom(room, { type: 'user_leave', userId: presence.userId })
    // Broadcast updated presence list
    broadcastRoom(room, { type: 'presence', users: buildPresenceList(room) })
  }

  // If room is empty, schedule eviction after 10 minutes
  if (room.clients.size === 0) {
    room.evictionTimer = setTimeout(async () => {
      // Final flush before eviction
      await flushRoom(meta.roomId!, room)
      rooms.delete(meta.roomId!)
    }, 10 * 60 * 1000)
  }

  meta.roomId = null
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleMessage(ws: WebSocket, raw: RawData): Promise<void> {
  const meta = clientMeta.get(ws)
  if (!meta) return

  // Size guard
  const byteLen = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(raw.toString())
  if (byteLen > MAX_MESSAGE_BYTES) {
    send(ws, { type: 'error', message: 'Message too large' })
    return
  }

  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(raw.toString()) as Record<string, unknown>
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON' })
    return
  }

  const type = msg.type

  // ------------------------------------------------------------------
  // ping
  // ------------------------------------------------------------------
  if (type === 'ping') {
    send(ws, { type: 'pong' })
    return
  }

  // ------------------------------------------------------------------
  // join — must come before any other room-scoped messages
  // ------------------------------------------------------------------
  if (type === 'join') {
    const clientVersion = msg.version

    // Verify the signed token minted by Next.js — never trust client-supplied userId/username
    const tokenStr = msg.token
    if (typeof tokenStr !== 'string') {
      send(ws, { type: 'error', message: 'Missing auth token' })
      ws.terminate()
      return
    }
    const claims = await verifyWsToken(tokenStr)
    if (!claims) {
      send(ws, { type: 'error', message: 'Invalid or expired auth token' })
      ws.terminate()
      return
    }

    const { userId, username, roomCode: tokenRoomCode } = claims

    // msg.roomId must match what the token was issued for
    const roomId = msg.roomId
    if (typeof roomId !== 'string' || roomId.toUpperCase() !== tokenRoomCode) {
      send(ws, { type: 'error', message: 'Room mismatch' })
      ws.terminate()
      return
    }

    // Cancel the join-timeout
    clearTimeout(meta.joinTimer)
    meta.joined = true
    meta.roomId = roomId

    const room = await loadOrCreateRoom(roomId)

    // Assign presence color by current room size (mod 8)
    const colorIdx = room.clients.size % PRESENCE_COLORS.length
    const presenceColor = PRESENCE_COLORS[colorIdx]

    const presence: UserPresence = {
      userId,
      username,
      color: presenceColor,
      cursorX: -1,
      cursorY: -1,
      activeColor: 0,
      lastSeen: Date.now(),
    }
    room.clients.set(ws, presence)
    room.lastActivity = Date.now()

    // Notify others of the new joiner
    broadcastRoom(room, { type: 'user_join', user: presence }, ws)

    // Always send a full sync on initial join. The client needs canvas state
    // regardless of version parity — version 0 on both sides still means the
    // client needs the authoritative pixel/timestamp arrays (which may be
    // non-empty if the room was loaded from the database).
    // width and height are included so the client can deserialize with the
    // correct dimensions regardless of what it was initialized with.
    const serialized = serializeCanvas(room.canvas)
    send(ws, {
      type: 'sync',
      width: room.canvas.width,
      height: room.canvas.height,
      pixels: serialized.pixels,
      timestamps: serialized.timestamps,
      version: room.canvas.version,
      presence: buildPresenceList(room),
    })

    // Broadcast updated presence to all (including the new client)
    broadcastRoom(room, { type: 'presence', users: buildPresenceList(room) })
    return
  }

  // All messages below require a joined client
  if (!meta.joined || !meta.roomId) {
    send(ws, { type: 'error', message: 'Must join a room first' })
    return
  }

  const room = rooms.get(meta.roomId)
  if (!room) {
    send(ws, { type: 'error', message: 'Room not found' })
    return
  }

  const presence = room.clients.get(ws)
  if (!presence) {
    send(ws, { type: 'error', message: 'Not in room' })
    return
  }

  // ------------------------------------------------------------------
  // pixel
  // ------------------------------------------------------------------
  if (type === 'pixel') {
    if (!checkRateLimit(meta)) {
      send(ws, { type: 'error', message: 'Rate limit exceeded' })
      ws.terminate()
      return
    }

    const { x, y, color, ts } = msg

    if (
      !isValidCoord(x, room.canvas.width) ||
      !isValidCoord(y, room.canvas.height) ||
      !isValidUint32(color) ||
      !isValidTs(ts)
    ) {
      send(ws, { type: 'error', message: 'Invalid pixel update' })
      return
    }

    const safeTs = Math.min(ts as number, Date.now() + 5 * 60 * 1000)
    const update: PixelUpdate = {
      x: x as number,
      y: y as number,
      color: color as number,
      ts: safeTs,
      userId: presence.userId,
    }

    const applied = applyPixelUpdate(room.canvas, update)
    if (applied) {
      room.dirty = true
      room.lastActivity = Date.now()
      broadcastRoom(
        room,
        { type: 'pixel', x, y, color, ts: safeTs, userId: presence.userId },
        ws,
      )
    }
    return
  }

  // ------------------------------------------------------------------
  // fill — batch pixel update, single rate-limit check
  // ------------------------------------------------------------------
  if (type === 'fill') {
    if (!checkRateLimit(meta)) {
      send(ws, { type: 'error', message: 'Rate limit exceeded' })
      ws.terminate()
      return
    }
    const pixels = msg.pixels
    if (!Array.isArray(pixels)) {
      send(ws, { type: 'error', message: 'Invalid fill payload' })
      return
    }
    const maxPixels = room.canvas.width * room.canvas.height
    if (pixels.length > maxPixels) {
      send(ws, { type: 'error', message: 'Fill payload too large' })
      return
    }
    const targetColor = msg.targetColor
    if (!isValidUint32(targetColor)) {
      send(ws, { type: 'error', message: 'Invalid fill targetColor' })
      return
    }
    const MAX_SKEW = 5 * 60 * 1000
    const ceiling = Date.now() + MAX_SKEW
    let anyApplied = false
    const broadcast: unknown[] = []
    for (const p of pixels) {
      if (
        typeof p !== 'object' || p === null ||
        !isValidCoord(p.x, room.canvas.width) ||
        !isValidCoord(p.y, room.canvas.height) ||
        !isValidUint32(p.color) ||
        !isValidTs(p.ts)
      ) continue
      const idx = (p.y as number) * room.canvas.width + (p.x as number)
      if ((room.canvas.pixels[idx] >>> 0) !== (targetColor as number)) continue
      const safeTs = Math.min(p.ts as number, ceiling)
      const update: PixelUpdate = { x: p.x as number, y: p.y as number, color: p.color as number, ts: safeTs, userId: presence.userId }
      if (applyPixelUpdate(room.canvas, update)) {
        anyApplied = true
        room.dirty = true
        broadcast.push({ type: 'pixel', x: p.x, y: p.y, color: p.color, ts: safeTs, userId: presence.userId })
      }
    }
    if (anyApplied) {
      room.lastActivity = Date.now()
      for (const pkt of broadcast) broadcastRoom(room, pkt, ws)
    }
    return
  }

  // ------------------------------------------------------------------
  // undo
  // ------------------------------------------------------------------
  if (type === 'undo') {
    const reverts = msg.reverts
    if (!Array.isArray(reverts)) {
      send(ws, { type: 'error', message: 'Invalid undo payload' })
      return
    }

    let anyApplied = false

    for (const revert of reverts) {
      if (
        typeof revert !== 'object' ||
        revert === null ||
        !isValidCoord(revert.x, room.canvas.width) ||
        !isValidCoord(revert.y, room.canvas.height) ||
        !isValidUint32(revert.color) ||
        !isValidTs(revert.ts)
      ) {
        continue
      }

      if (!checkRateLimit(meta)) {
        send(ws, { type: 'error', message: 'Rate limit exceeded' })
        ws.terminate()
        return
      }

      const idx = (revert.y as number) * room.canvas.width + (revert.x as number)
      const update: PixelUpdate = {
        x: revert.x as number,
        y: revert.y as number,
        color: revert.color as number,
        // Use current server ts + 1: guaranteed to win over the stroke being undone,
        // but doesn't lock the pixel for an arbitrary future window.
        ts: room.canvas.timestamps[idx] + 1,
        userId: presence.userId,
      }

      const applied = applyPixelUpdate(room.canvas, update)
      if (applied) {
        anyApplied = true
        room.dirty = true
        broadcastRoom(
          room,
          {
            type: 'pixel',
            x: update.x,
            y: update.y,
            color: update.color,
            ts: update.ts,
            userId: presence.userId,
          },
          ws,
        )
      }
    }

    if (anyApplied) {
      room.lastActivity = Date.now()
    }
    return
  }

  // ------------------------------------------------------------------
  // batch — multi-pixel brush stroke, single rate-limit check
  // ------------------------------------------------------------------
  if (type === 'batch') {
    if (!checkRateLimit(meta)) {
      send(ws, { type: 'error', message: 'Rate limit exceeded' })
      ws.terminate()
      return
    }
    const pixels = msg.pixels
    if (!Array.isArray(pixels)) {
      send(ws, { type: 'error', message: 'Invalid batch payload' })
      return
    }
    const maxPixels = room.canvas.width * room.canvas.height
    if (pixels.length > maxPixels) {
      send(ws, { type: 'error', message: 'Batch payload too large' })
      return
    }
    const ceiling = Date.now() + 5 * 60 * 1000
    let anyApplied = false
    const broadcast: unknown[] = []
    for (const p of pixels) {
      if (
        typeof p !== 'object' || p === null ||
        !isValidCoord(p.x, room.canvas.width) ||
        !isValidCoord(p.y, room.canvas.height) ||
        !isValidUint32(p.color) ||
        !isValidTs(p.ts)
      ) continue
      const safeTs = Math.min(p.ts as number, ceiling)
      const update: PixelUpdate = { x: p.x as number, y: p.y as number, color: p.color as number, ts: safeTs, userId: presence.userId }
      if (applyPixelUpdate(room.canvas, update)) {
        anyApplied = true
        room.dirty = true
        broadcast.push({ type: 'pixel', x: p.x, y: p.y, color: p.color, ts: safeTs, userId: presence.userId })
      }
    }
    if (anyApplied) {
      room.lastActivity = Date.now()
      for (const pkt of broadcast) broadcastRoom(room, pkt, ws)
    }
    return
  }

  // ------------------------------------------------------------------
  // cursor
  // ------------------------------------------------------------------
  if (type === 'cursor') {
    const { x, y } = msg

    if (
      !isValidCoord(x, room.canvas.width) ||
      !isValidCoord(y, room.canvas.height)
    ) {
      send(ws, { type: 'error', message: 'Invalid cursor position' })
      return
    }

    presence.cursorX = x as number
    presence.cursorY = y as number
    presence.lastSeen = Date.now()

    broadcastRoom(
      room,
      { type: 'presence', users: buildPresenceList(room) },
      ws,
    )
    return
  }

  // clear
  // ------------------------------------------------------------------
  if (type === 'clear') {
    if (!checkRateLimit(meta)) {
      send(ws, { type: 'error', message: 'Rate limit exceeded' })
      ws.terminate()
      return
    }
    const ts = Date.now()
    room.canvas.pixels.fill(0)
    room.canvas.timestamps.fill(ts)
    room.canvas.version++
    room.dirty = true
    broadcastRoom(room, { type: 'clear', ts }, ws)
    return
  }

  send(ws, { type: 'error', message: `Unknown message type: ${String(type)}` })
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

export function createServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({
    port,
    maxPayload: MAX_MESSAGE_BYTES,
  })

  // ------------------------------------------------------------------
  // Keepalive interval — pings every 30 s, terminates if no pong within 35 s
  // ------------------------------------------------------------------
  const keepaliveInterval = setInterval(() => {
    for (const ws of wss.clients) {
      const meta = clientMeta.get(ws as WebSocket)
      if (!meta) {
        ws.terminate()
        continue
      }
      // Send ping and set a timeout expecting a pong within KEEPALIVE_TIMEOUT_MS
      meta.isAlive = false
      const typedWs = ws as WebSocket
      meta.pongTimer = setTimeout(() => {
        if (!meta.isAlive) {
          // Pong never arrived — forcibly disconnect
          if (meta.roomId) removeClientFromRoom(typedWs, meta)
          typedWs.terminate()
        }
      }, KEEPALIVE_TIMEOUT_MS)
      ws.ping()
    }
  }, KEEPALIVE_INTERVAL_MS)
  keepaliveInterval.unref() // don't block process exit

  // ------------------------------------------------------------------
  // Periodic DB flush — every 5 s
  // ------------------------------------------------------------------
  const flushInterval = setInterval(() => {
    flushAllDirtyRooms().catch(() => { /* swallow — will retry next cycle */ })
  }, FLUSH_INTERVAL_MS)
  flushInterval.unref() // don't block process exit

  // ------------------------------------------------------------------
  // Connection handler
  // ------------------------------------------------------------------
  wss.on('connection', (ws: WebSocket, req) => {
    // Reject connections from unexpected origins to prevent cross-site WebSocket hijacking
    const origin = req.headers.origin ?? ''
    if (origin !== APP_ORIGIN) {
      ws.terminate()
      return
    }

    const joinTimer = setTimeout(() => {
      const meta = clientMeta.get(ws)
      if (!meta?.joined) {
        ws.terminate()
      }
    }, JOIN_TIMEOUT_MS)

    const meta: ClientMeta = {
      roomId: null,
      rateBucket: [],
      joined: false,
      joinTimer,
      isAlive: true,
      pongTimer: null,
    }
    clientMeta.set(ws, meta)

    ws.on('pong', () => {
      const m = clientMeta.get(ws)
      if (m) {
        m.isAlive = true
        // Cancel the termination timer — pong received in time
        if (m.pongTimer) {
          clearTimeout(m.pongTimer)
          m.pongTimer = null
        }
      }
    })

    ws.on('message', (raw: RawData) => {
      handleMessage(ws, raw).catch(() => {
        send(ws, { type: 'error', message: 'Internal server error' })
      })
    })

    ws.on('close', () => {
      const m = clientMeta.get(ws)
      if (!m) return
      clearTimeout(m.joinTimer)
      if (m.pongTimer) clearTimeout(m.pongTimer)
      if (m.roomId) removeClientFromRoom(ws, m)
    })

    ws.on('error', () => {
      const m = clientMeta.get(ws)
      if (!m) return
      clearTimeout(m.joinTimer)
      if (m.pongTimer) clearTimeout(m.pongTimer)
      if (m.roomId) removeClientFromRoom(ws, m)
    })
  })

  wss.on('close', () => {
    clearInterval(keepaliveInterval)
    clearInterval(flushInterval)
  })

  return wss
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(wss: WebSocketServer): Promise<void> {
  console.log('Shutting down — flushing dirty rooms...')
  await flushAllDirtyRooms()
  wss.close(() => {
    process.exit(0)
  })
}

// ---------------------------------------------------------------------------
// Entry point (only runs when this module is the main script)
// ---------------------------------------------------------------------------

// Detect whether this module is the direct entry point.
// Works on both Unix and Windows (normalise backslashes → forward slashes).
function detectIsMain(): boolean {
  if (!process.argv[1]) return false
  try {
    const scriptUrl = new URL(import.meta.url)
    // scriptUrl.pathname on Windows: /D:/path/to/file.ts  — strip leading slash
    const scriptPath = scriptUrl.pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\')
    const argvPath = process.argv[1].replace(/\//g, '\\')
    return scriptPath === argvPath || scriptPath.replace(/\.ts$/, '.js') === argvPath
  } catch {
    return false
  }
}
const isMain = detectIsMain()

if (isMain) {
  const wss = createServer(PORT)

  wss.on('listening', () => {
    console.log(`PixelTogether WS server listening on port ${PORT}`)
  })

  process.on('SIGTERM', () => shutdown(wss))
  process.on('SIGINT', () => shutdown(wss))
}
