import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { WebSocket, WebSocketServer } from 'ws'
import { createServer, rooms } from '../index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_PORT = 3099

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), 3000)
    ws.once('message', (raw) => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(raw.toString()) as Record<string, unknown>)
      } catch (e) {
        reject(e)
      }
    })
  })
}

function waitForMessageOfType(
  ws: WebSocket,
  type: string,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for message of type "${type}"`)),
      timeoutMs,
    )
    const handler = (raw: Buffer | string) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }
      if (msg.type === type) {
        clearTimeout(timer)
        ws.off('message', handler)
        resolve(msg)
      }
    }
    ws.on('message', handler)
  })
}

function waitForClose(ws: WebSocket, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for close')), timeoutMs)
    ws.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function connectClient(roomId = 'room_test', userId = 'usr_test', username = 'Alice'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`)
    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomId, userId, username, version: 0 }))
      resolve(ws)
    })
    ws.once('error', reject)
  })
}

function send(ws: WebSocket, payload: unknown): void {
  ws.send(JSON.stringify(payload))
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('WebSocket Server', () => {
  let wss: WebSocketServer

  beforeEach((done) => {
    // Clear room state between tests
    rooms.clear()
    wss = createServer(TEST_PORT)
    wss.on('listening', done)
  })

  afterEach((done) => {
    wss.clients.forEach(c => c.terminate())
    wss.close(done)
  })

  // -------------------------------------------------------------------------
  test('client can join a room and receive sync', async () => {
    const ws = await connectClient('room1', 'usr_a', 'Alice')
    const msg = await waitForMessageOfType(ws, 'sync')

    expect(msg.type).toBe('sync')
    expect(typeof msg.pixels).toBe('string')
    expect(typeof msg.timestamps).toBe('string')
    expect(typeof msg.version).toBe('number')
    expect(Array.isArray(msg.presence)).toBe(true)

    ws.terminate()
  })

  // -------------------------------------------------------------------------
  test('pixel update broadcasts to all other clients in room', async () => {
    const ws1 = await connectClient('room2', 'usr_a', 'Alice')
    await waitForMessageOfType(ws1, 'sync')

    // Set up ws1's user_join listener BEFORE ws2 connects to avoid the race
    // where user_join arrives on ws1 before we register the listener.
    const ws1JoinP = waitForMessageOfType(ws1, 'user_join')
    const ws2 = await connectClient('room2', 'usr_b', 'Bob')
    const [, ws2Sync] = await Promise.all([ws1JoinP, waitForMessageOfType(ws2, 'sync')])
    expect(ws2Sync.type).toBe('sync')

    // ws1 sends a pixel
    send(ws1, { type: 'pixel', x: 3, y: 5, color: 0xFF0000FF, ts: 100.0 })

    // ws2 should receive the pixel broadcast
    const pixelMsg = await waitForMessageOfType(ws2, 'pixel')

    expect(pixelMsg.type).toBe('pixel')
    expect(pixelMsg.x).toBe(3)
    expect(pixelMsg.y).toBe(5)
    expect(pixelMsg.color).toBe(0xFF0000FF)
    expect(pixelMsg.userId).toBe('usr_a')

    ws1.terminate()
    ws2.terminate()
  })

  // -------------------------------------------------------------------------
  test('pixel with lower timestamp is rejected (LWW)', async () => {
    const ws1 = await connectClient('room3', 'usr_a', 'Alice')
    await waitForMessageOfType(ws1, 'sync')

    const ws1JoinP = waitForMessageOfType(ws1, 'user_join')
    const ws2 = await connectClient('room3', 'usr_b', 'Bob')
    await Promise.all([ws1JoinP, waitForMessageOfType(ws2, 'sync')])

    // ws1 sets pixel at ts=200
    send(ws1, { type: 'pixel', x: 0, y: 0, color: 0x00FF00FF, ts: 200.0 })
    await waitForMessageOfType(ws2, 'pixel')

    // Collect any further messages on ws2 for a short window
    const extraMessages: Record<string, unknown>[] = []
    ws2.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString()) as Record<string, unknown>
        if (m.type === 'pixel') extraMessages.push(m)
      } catch {/* ignore */}
    })

    // ws1 sends a stale pixel at ts=50 (lower than 200) — should be rejected
    send(ws1, { type: 'pixel', x: 0, y: 0, color: 0xFF0000FF, ts: 50.0 })

    // Wait briefly to ensure no spurious pixel message arrives on ws2
    await new Promise(r => setTimeout(r, 300))

    expect(extraMessages.length).toBe(0)

    // Verify server canvas still holds the winning value
    const room = rooms.get('room3')!
    expect(room).toBeDefined()
    expect(room.canvas.pixels[0]).toBe(0x00FF00FF)

    ws1.terminate()
    ws2.terminate()
  })

  // -------------------------------------------------------------------------
  test('cursor update broadcasts as presence', async () => {
    const ws1 = await connectClient('room4', 'usr_a', 'Alice')
    await waitForMessageOfType(ws1, 'sync')

    const ws1JoinP = waitForMessageOfType(ws1, 'user_join')
    const ws2 = await connectClient('room4', 'usr_b', 'Bob')
    await Promise.all([ws1JoinP, waitForMessageOfType(ws2, 'sync')])

    // Allow trailing join-phase broadcasts to settle before the cursor test
    await new Promise(r => setTimeout(r, 50))

    // Register the presence listener BEFORE sending the cursor so we don't miss it
    const presenceP = waitForMessageOfType(ws2, 'presence')
    send(ws1, { type: 'cursor', x: 7, y: 9 })
    const presenceMsg = await presenceP

    expect(presenceMsg.type).toBe('presence')
    const users = presenceMsg.users as Array<Record<string, unknown>>
    const alice = users.find(u => u.userId === 'usr_a')
    expect(alice).toBeDefined()
    expect(alice!.cursorX).toBe(7)
    expect(alice!.cursorY).toBe(9)

    ws1.terminate()
    ws2.terminate()
  })

  // -------------------------------------------------------------------------
  test('client disconnect triggers user_leave broadcast', async () => {
    const ws1 = await connectClient('room5', 'usr_a', 'Alice')
    await waitForMessageOfType(ws1, 'sync')

    const ws1JoinP = waitForMessageOfType(ws1, 'user_join')
    const ws2 = await connectClient('room5', 'usr_b', 'Bob')
    await Promise.all([ws1JoinP, waitForMessageOfType(ws2, 'sync')])

    // ws2 disconnects
    ws2.close()

    const leaveMsg = await waitForMessageOfType(ws1, 'user_leave')
    expect(leaveMsg.type).toBe('user_leave')
    expect(leaveMsg.userId).toBe('usr_b')

    ws1.terminate()
  })

  // -------------------------------------------------------------------------
  test('rate limit disconnects spamming client', async () => {
    const ws = await connectClient('room6', 'usr_spam', 'Spammer')
    await waitForMessageOfType(ws, 'sync')

    // Fire 110 pixel updates (exceeds 100/s limit)
    for (let i = 0; i < 110; i++) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'pixel',
            x: i % 64,
            y: 0,
            color: 0xFF0000FF,
            ts: 1000 + i,
          }),
        )
      }
    }

    await waitForClose(ws, 5000)
    expect(ws.readyState).not.toBe(WebSocket.OPEN)
  })

  // -------------------------------------------------------------------------
  test('malformed messages return error, not crash', async () => {
    const ws = await connectClient('room7', 'usr_a', 'Alice')
    await waitForMessageOfType(ws, 'sync')

    // Send raw garbage
    ws.send('not-json-at-all{{{{')
    const errMsg = await waitForMessageOfType(ws, 'error')
    expect(errMsg.type).toBe('error')
    expect(typeof errMsg.message).toBe('string')

    // Server should still be alive — send a ping and get a pong
    ws.send(JSON.stringify({ type: 'ping' }))
    const pong = await waitForMessageOfType(ws, 'pong')
    expect(pong.type).toBe('pong')

    ws.terminate()
  })

  // -------------------------------------------------------------------------
  test('connection without join is terminated after 5s', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`)
    await new Promise<void>((res) => ws.once('open', res))

    // Do NOT send join
    await waitForClose(ws, 8000)
    expect(ws.readyState).not.toBe(WebSocket.OPEN)
  }, 10_000)

  // -------------------------------------------------------------------------
  test('out-of-bounds pixel coordinates return error', async () => {
    const ws = await connectClient('room8', 'usr_a', 'Alice')
    await waitForMessageOfType(ws, 'sync')

    send(ws, { type: 'pixel', x: 9999, y: 0, color: 0xFF0000FF, ts: 1.0 })
    const err = await waitForMessageOfType(ws, 'error')
    expect(err.type).toBe('error')

    ws.terminate()
  })
})
