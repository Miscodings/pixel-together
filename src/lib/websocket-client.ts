import { LamportClock, deserializeCanvas } from './canvas-engine'
import type { PixelUpdate, UserPresence, PixelCanvas } from '@/types/canvas'

const WS_URL =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_WS_URL
    ? process.env.NEXT_PUBLIC_WS_URL
    : 'ws://localhost:3001'

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]
const PING_INTERVAL = 25000

type MessageType =
  | { type: 'sync'; pixels: string; timestamps: string; version: number; presence: UserPresence[] }
  | { type: 'pixel'; x: number; y: number; color: number; ts: number; userId: string }
  | { type: 'clear'; ts: number }
  | { type: 'presence'; users: UserPresence[] }
  | { type: 'join'; user: UserPresence }
  | { type: 'leave'; userId: string }
  | { type: 'pong' }

export class PixelTogetherWS {
  private ws: WebSocket | null = null
  private clock: LamportClock
  private roomId: string = ''
  private roomCode: string = ''
  private userId: string = ''
  private username: string = ''
  private wsToken: string = ''
  private canvasVersion: number = 0
  private canvasWidth: number = 32
  private canvasHeight: number = 32
  private reconnectAttempts: number = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private intentionalClose: boolean = false
  private connectAbort: AbortController | null = null

  // Public callbacks
  onPixelUpdate: (update: PixelUpdate) => void = () => {}
  onPresenceUpdate: (presence: UserPresence[]) => void = () => {}
  onCanvasSync: (canvas: PixelCanvas) => void = () => {}
  onUserJoin: (user: UserPresence) => void = () => {}
  onUserLeave: (userId: string) => void = () => {}
  onConnected: () => void = () => {}
  onDisconnected: () => void = () => {}
  onClear: (ts: number) => void = () => {}

  constructor() {
    this.clock = new LamportClock(
      typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36)
    )
  }

  async connect(
    roomId: string,
    roomCode: string,
    userId: string,
    username: string,
    canvasWidth = 32,
    canvasHeight = 32,
    canvasVersion = 0,
  ): Promise<void> {
    this.roomId = roomId
    this.roomCode = roomCode
    this.userId = userId
    this.username = username
    this.canvasWidth = canvasWidth
    this.canvasHeight = canvasHeight
    this.canvasVersion = canvasVersion
    this.intentionalClose = false
    this.clock = new LamportClock(userId)

    // Cancel any in-progress token fetch from a previous connect() call
    this.connectAbort?.abort()
    this.connectAbort = new AbortController()
    const { signal } = this.connectAbort

    try {
      const res = await fetch('/api/ws-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode }),
        signal,
      })
      if (!res.ok) throw new Error('token fetch failed')
      const { token } = await res.json() as { token: string }
      this.wsToken = token
    } catch {
      if (signal.aborted) return
      this.wsToken = ''
    }

    if (signal.aborted) return

    this.openSocket()
  }

  private openSocket(): void {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }

    try {
      this.ws = new WebSocket(WS_URL)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.binaryType = 'arraybuffer'

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.sendRaw({
        type: 'join',
        roomId: this.roomCode,  // server matches this against JWT roomCode claim
        token: this.wsToken,
        version: this.canvasVersion,
      })
      this.startPing()
      this.onConnected()
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: MessageType = JSON.parse(event.data as string)
        this.handleMessage(msg)
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }

    this.ws.onclose = () => {
      this.stopPing()
      this.onDisconnected()
      if (!this.intentionalClose) {
        this.scheduleReconnect()
      }
    }
  }

  private handleMessage(msg: MessageType): void {
    switch (msg.type) {
      case 'sync': {
        const canvas = deserializeCanvas(
          this.canvasWidth,
          this.canvasHeight,
          msg.pixels,
          msg.timestamps,
        )
        canvas.version = msg.version
        this.canvasVersion = msg.version
        this.onCanvasSync(canvas)
        if (msg.presence.length > 0) {
          this.onPresenceUpdate(msg.presence)
        }
        break
      }
      case 'pixel': {
        // Validate the shape and ranges of an untrusted, network-supplied
        // pixel update before applying it. A malicious peer could otherwise:
        //  - send out-of-bounds x/y (handled defensively here + in engine)
        //  - send a non-integer / oversized color
        //  - send a fake far-future `ts` to permanently win every LWW conflict
        //    and overwrite all collaborators' work (timestamp attack).
        if (
          !Number.isInteger(msg.x) ||
          !Number.isInteger(msg.y) ||
          msg.x < 0 ||
          msg.y < 0 ||
          msg.x >= this.canvasWidth ||
          msg.y >= this.canvasHeight ||
          typeof msg.color !== 'number' ||
          !Number.isFinite(msg.color) ||
          typeof msg.ts !== 'number' ||
          !Number.isFinite(msg.ts) ||
          typeof msg.userId !== 'string'
        ) {
          break
        }

        // Clamp timestamps to a small skew window around the local clock so a
        // peer cannot claim an arbitrarily large timestamp to lock pixels.
        const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000 // 5 minutes
        const ceiling = Date.now() + MAX_FUTURE_SKEW_MS
        const safeTs = Math.min(msg.ts, ceiling)

        this.clock.update(safeTs)
        this.onPixelUpdate({
          x: msg.x,
          y: msg.y,
          color: (msg.color >>> 0),
          ts: safeTs,
          userId: msg.userId,
        })
        break
      }
      case 'presence': {
        this.onPresenceUpdate(msg.users)
        break
      }
      case 'join': {
        this.onUserJoin(msg.user)
        break
      }
      case 'leave': {
        this.onUserLeave(msg.userId)
        break
      }
      case 'clear': {
        this.onClear(msg.ts)
        break
      }
      case 'pong': {
        // alive
        break
      }
    }
  }

  sendClear(): void {
    const ts = this.clock.tick()
    this.sendRaw({ type: 'clear', ts })
  }

  sendPixel(x: number, y: number, color: number): void {
    const ts = this.clock.tick()
    this.sendRaw({ type: 'pixel', x, y, color, ts })
  }

  sendUndo(reverts: PixelUpdate[]): void {
    this.sendRaw({ type: 'undo', reverts })
  }

  sendCursor(x: number, y: number): void {
    this.sendRaw({ type: 'cursor', x, y })
  }

  disconnect(): void {
    this.intentionalClose = true
    this.connectAbort?.abort()
    this.connectAbort = null
    this.clearReconnectTimer()
    this.stopPing()
    if (this.ws) {
      // Don't null onclose — intentionalClose flag already prevents reconnect
      this.ws.close()
      this.ws = null
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  private sendRaw(data: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return
    const delay = RECONNECT_DELAYS[this.reconnectAttempts] ?? 16000
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.openSocket()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.sendRaw({ type: 'ping' })
    }, PING_INTERVAL)
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
}
