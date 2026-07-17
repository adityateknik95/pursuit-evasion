/**
 * WebSocket client with automatic exponential-backoff reconnect.
 * Frames are pushed into the sim store / live buffer; control messages
 * are sent through `sendControl`.
 */

import type { ClientMessage, ServerMessage } from '../types/messages'
import { ingestFrame, liveBuffer, setSim } from '../store/simStore'

const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  `ws://${window.location.hostname}:8000/ws`

const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 8000

let socket: WebSocket | null = null
let reconnectAttempt = 0
let reconnectTimer: number | null = null
let started = false

function scheduleReconnect() {
  if (reconnectTimer !== null) return
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS)
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function handleMessage(raw: string) {
  let msg: ServerMessage
  try {
    msg = JSON.parse(raw) as ServerMessage
  } catch {
    return
  }

  switch (msg.type) {
    case 'frame':
      ingestFrame(msg)
      break
    case 'status':
      setSim({
        paused: msg.paused,
        speed: msg.speed,
        policyMode: msg.policy_mode,
        evaderMode: msg.evader_mode,
        pursuerGen: msg.pursuer_gen,
        pursuerGens: msg.pursuer_gens,
        episode: msg.episode,
        captureCount: msg.capture_count,
        arenaSize: msg.arena_size,
        captureRadius: msg.capture_radius,
        modelLoaded: msg.model_loaded,
        evaderModelLoaded: msg.evader_model_loaded,
      })
      break
    case 'episode_end':
      // interpolation buffer must not lerp across the upcoming respawn
      liveBuffer.episodeResetAt = performance.now()
      break
    case 'error':
      setSim({ lastError: msg.message })
      window.setTimeout(() => setSim({ lastError: null }), 4000)
      break
  }
}

function connect() {
  setSim({ connection: 'connecting' })
  socket = new WebSocket(WS_URL)

  socket.onopen = () => {
    reconnectAttempt = 0
    setSim({ connection: 'connected' })
  }

  socket.onmessage = (ev) => handleMessage(ev.data as string)

  socket.onclose = () => {
    socket = null
    setSim({ connection: 'disconnected' })
    scheduleReconnect()
  }

  socket.onerror = () => {
    socket?.close()
  }
}

export function startWebSocket() {
  if (started) return
  started = true
  connect()
}

export function sendControl(msg: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg))
  }
}
