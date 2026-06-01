/**
 * WebSocket client tests — use a mock WebSocket to avoid real network calls.
 */

import { PixelTogetherWS } from '../websocket-client'
import type { UserPresence, PixelCanvas, PixelUpdate } from '@/types/canvas'

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

type MessageHandler = (event: { data: string }) => void
type OpenHandler = () => void
type CloseHandler = () => void

class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3

  readyState: number = MockWebSocket.OPEN
  binaryType: string = 'arraybuffer'
  onopen: OpenHandler | null = null
  onmessage: MessageHandler | null = null
  onerror: (() => void) | null = null
  onclose: CloseHandler | null = null

  sentMessages: string[] = []

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  // Test helper: simulate receiving a server message
  receive(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
}

let mockWs: MockWebSocket
const originalWebSocket = global.WebSocket

beforeEach(() => {
  mockWs = new MockWebSocket()
  // Build a mock constructor that also carries the static OPEN/CLOSED constants
  // needed by sendRaw: `this.ws.readyState === WebSocket.OPEN`
  const factory = jest.fn(() => {
    setTimeout(() => mockWs.onopen?.(), 0)
    return mockWs
  }) as unknown as typeof WebSocket
  // Static constants used by the client
  ;(factory as unknown as Record<string, number>).OPEN = MockWebSocket.OPEN
  ;(factory as unknown as Record<string, number>).CLOSED = MockWebSocket.CLOSED
  ;(factory as unknown as Record<string, number>).CONNECTING = 0
  ;(factory as unknown as Record<string, number>).CLOSING = 2
  global.WebSocket = factory
})

afterEach(() => {
  global.WebSocket = originalWebSocket
  jest.clearAllTimers()
})

// ─── Connection ───────────────────────────────────────────────────────────────

describe('PixelTogetherWS - connection', () => {
  test('sends join message on connect', async () => {
    const ws = new PixelTogetherWS()
    ws.connect('room1', 'user1', 'Alice')

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(mockWs.sentMessages.length).toBeGreaterThan(0)
    const joinMsg = JSON.parse(mockWs.sentMessages[0])
    expect(joinMsg.type).toBe('join')
    expect(joinMsg.roomId).toBe('room1')
    expect(joinMsg.userId).toBe('user1')
    expect(joinMsg.username).toBe('Alice')
  })

  test('reports isConnected after open', async () => {
    const ws = new PixelTogetherWS()
    ws.connect('room1', 'user1', 'Alice')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(ws.isConnected).toBe(true)
  })

  test('calls onConnected callback on open', async () => {
    const ws = new PixelTogetherWS()
    const onConnected = jest.fn()
    ws.onConnected = onConnected
    ws.connect('room1', 'user1', 'Alice')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(onConnected).toHaveBeenCalledTimes(1)
  })

  test('reports not connected after disconnect', async () => {
    const ws = new PixelTogetherWS()
    ws.connect('room1', 'user1', 'Alice')
    await new Promise(resolve => setTimeout(resolve, 10))
    ws.disconnect()
    expect(ws.isConnected).toBe(false)
  })

  test('calls onDisconnected callback when connection closes', async () => {
    const ws = new PixelTogetherWS()
    const onDisconnected = jest.fn()
    ws.onDisconnected = onDisconnected
    ws.connect('room1', 'user1', 'Alice')
    await new Promise(resolve => setTimeout(resolve, 10))
    ws.disconnect()
    expect(onDisconnected).toHaveBeenCalled()
  })
})

// ─── Sending messages ─────────────────────────────────────────────────────────

describe('PixelTogetherWS - sending', () => {
  async function connectedWS() {
    const ws = new PixelTogetherWS()
    ws.connect('room1', 'user1', 'Alice')
    await new Promise(resolve => setTimeout(resolve, 10))
    mockWs.sentMessages = [] // clear the join message
    return ws
  }

  test('sendPixel sends a pixel message with coords and color', async () => {
    const ws = await connectedWS()
    ws.sendPixel(5, 10, 0xFF0000FF)

    expect(mockWs.sentMessages.length).toBe(1)
    const msg = JSON.parse(mockWs.sentMessages[0])
    expect(msg.type).toBe('pixel')
    expect(msg.x).toBe(5)
    expect(msg.y).toBe(10)
    expect(msg.color).toBe(0xFF0000FF)
    expect(typeof msg.ts).toBe('number')
  })

  test('sendPixel timestamps are monotonically increasing', async () => {
    const ws = await connectedWS()
    ws.sendPixel(0, 0, 0xFF0000FF)
    ws.sendPixel(1, 0, 0x00FF00FF)
    ws.sendPixel(2, 0, 0x0000FFFF)

    const msgs = mockWs.sentMessages.map((m) => JSON.parse(m))
    expect(msgs[1].ts).toBeGreaterThan(msgs[0].ts)
    expect(msgs[2].ts).toBeGreaterThan(msgs[1].ts)
  })

  test('sendCursor sends cursor message', async () => {
    const ws = await connectedWS()
    ws.sendCursor(3, 7)

    const msg = JSON.parse(mockWs.sentMessages[0])
    expect(msg.type).toBe('cursor')
    expect(msg.x).toBe(3)
    expect(msg.y).toBe(7)
  })

  test('sendUndo sends undo message with reverts', async () => {
    const ws = await connectedWS()
    const reverts: PixelUpdate[] = [{ x: 0, y: 0, color: 0, ts: 1, userId: 'user1' }]
    ws.sendUndo(reverts)

    const msg = JSON.parse(mockWs.sentMessages[0])
    expect(msg.type).toBe('undo')
    expect(msg.reverts).toEqual(reverts)
  })

  test('does not send when disconnected', async () => {
    const ws = await connectedWS()
    ws.disconnect()
    ws.sendPixel(0, 0, 0xFF0000FF)
    expect(mockWs.sentMessages.length).toBe(0)
  })
})

// ─── Receiving messages ───────────────────────────────────────────────────────

describe('PixelTogetherWS - receiving', () => {
  async function connectedWS() {
    const ws = new PixelTogetherWS()
    ws.connect('room1', 'user1', 'Alice', 32, 32, 0)
    await new Promise(resolve => setTimeout(resolve, 10))
    return ws
  }

  test('calls onCanvasSync with parsed canvas on sync message', async () => {
    const ws = await connectedWS()
    const onCanvasSync = jest.fn()
    ws.onCanvasSync = onCanvasSync

    // Empty canvas base64
    const pixels = Buffer.from(new Uint8Array(32 * 32 * 4)).toString('base64')
    const timestamps = Buffer.from(new Uint8Array(32 * 32 * 8)).toString('base64')

    mockWs.receive({ type: 'sync', pixels, timestamps, version: 5, presence: [] })

    expect(onCanvasSync).toHaveBeenCalledTimes(1)
    const canvas: PixelCanvas = onCanvasSync.mock.calls[0][0]
    expect(canvas.version).toBe(5)
    expect(canvas.width).toBe(32)
    expect(canvas.height).toBe(32)
  })

  test('calls onPixelUpdate on pixel message', async () => {
    const ws = await connectedWS()
    const onPixelUpdate = jest.fn()
    ws.onPixelUpdate = onPixelUpdate

    mockWs.receive({ type: 'pixel', x: 5, y: 7, color: 0xFF0000FF, ts: 999, userId: 'user2' })

    expect(onPixelUpdate).toHaveBeenCalledTimes(1)
    const update: PixelUpdate = onPixelUpdate.mock.calls[0][0]
    expect(update.x).toBe(5)
    expect(update.y).toBe(7)
    expect(update.color).toBe(0xFF0000FF)
    expect(update.userId).toBe('user2')
  })

  test('calls onPresenceUpdate on presence message', async () => {
    const ws = await connectedWS()
    const onPresenceUpdate = jest.fn()
    ws.onPresenceUpdate = onPresenceUpdate

    const users: UserPresence[] = [{
      userId: 'user2', username: 'Bob', color: '#E63946',
      cursorX: 0, cursorY: 0, activeColor: 0, lastSeen: Date.now(),
    }]
    mockWs.receive({ type: 'presence', users })

    expect(onPresenceUpdate).toHaveBeenCalledWith(users)
  })

  test('calls onUserJoin on join message', async () => {
    const ws = await connectedWS()
    const onUserJoin = jest.fn()
    ws.onUserJoin = onUserJoin

    const user: UserPresence = {
      userId: 'user2', username: 'Bob', color: '#E63946',
      cursorX: 0, cursorY: 0, activeColor: 0, lastSeen: Date.now(),
    }
    mockWs.receive({ type: 'join', user })

    expect(onUserJoin).toHaveBeenCalledWith(user)
  })

  test('calls onUserLeave on leave message', async () => {
    const ws = await connectedWS()
    const onUserLeave = jest.fn()
    ws.onUserLeave = onUserLeave

    mockWs.receive({ type: 'leave', userId: 'user2' })

    expect(onUserLeave).toHaveBeenCalledWith('user2')
  })

  test('ignores malformed JSON without throwing', async () => {
    const ws = await connectedWS()
    expect(() => {
      // @ts-expect-error — simulate raw message event
      mockWs.onmessage?.({ data: 'not valid json{{{' })
    }).not.toThrow()
  })
})
