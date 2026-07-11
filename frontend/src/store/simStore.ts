/**
 * Minimal typed external store (useSyncExternalStore-compatible).
 *
 * Two layers of state:
 *  - `simStore`: React-visible snapshot (HUD stats, connection status, UI modes).
 *    Updated at most once per animation frame to keep React render load low.
 *  - `liveBuffer`: mutable, non-reactive frame buffer read directly by the
 *    Three.js render loop for interpolation. Never triggers React renders.
 */

import { useSyncExternalStore } from 'react'
import type {
  CameraMode,
  ConnectionStatus,
  FrameMessage,
  PlacementTarget,
  PolicyMode,
  Vec3,
} from '../types/messages'

// ---------------------------------------------------------------- //
// Live (non-reactive) buffer, consumed by the 3D scene every rAF
// ---------------------------------------------------------------- //

export interface LiveFrame {
  pursuerPos: Vec3
  pursuerVel: Vec3
  evaderPos: Vec3
  evaderVel: Vec3
  receivedAt: number
}

export interface CaptureEvent {
  position: Vec3
  at: number
}

export const liveBuffer: {
  prev: LiveFrame | null
  next: LiveFrame | null
  /** expected ms between server frames (adapts to sim speed) */
  frameInterval: number
  capture: CaptureEvent | null
  episodeResetAt: number
} = {
  prev: null,
  next: null,
  frameInterval: 1000 / 30,
  capture: null,
  episodeResetAt: 0,
}

// ---------------------------------------------------------------- //
// Reactive snapshot store
// ---------------------------------------------------------------- //

export interface SimSnapshot {
  connection: ConnectionStatus
  episode: number
  step: number
  simTime: number
  distance: number
  captureCount: number
  pursuerReward: number
  evaderReward: number
  paused: boolean
  speed: number
  policyMode: PolicyMode
  modelLoaded: boolean
  arenaSize: number
  captureRadius: number
  distanceHistory: number[]
  cameraMode: CameraMode
  placementTarget: PlacementTarget
  pendingPursuerPos: Vec3 | null
  pendingEvaderPos: Vec3 | null
  lastError: string | null
}

const HISTORY_LEN = 240

let snapshot: SimSnapshot = {
  connection: 'connecting',
  episode: 0,
  step: 0,
  simTime: 0,
  distance: 0,
  captureCount: 0,
  pursuerReward: 0,
  evaderReward: 0,
  paused: false,
  speed: 1,
  policyMode: 'ppo',
  modelLoaded: false,
  arenaSize: 20,
  captureRadius: 0.9,
  distanceHistory: [],
  cameraMode: 'free',
  placementTarget: null,
  pendingPursuerPos: null,
  pendingEvaderPos: null,
  lastError: null,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function setSim(partial: Partial<SimSnapshot>) {
  snapshot = { ...snapshot, ...partial }
  emit()
}

export function getSim(): SimSnapshot {
  return snapshot
}

export function useSim(): SimSnapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
}

// ---------------------------------------------------------------- //
// Frame ingestion (called by the WebSocket client)
// ---------------------------------------------------------------- //

let pendingHudFrame: FrameMessage | null = null
let hudFlushScheduled = false

/** rAF is paused in hidden tabs; fall back to a timer so the HUD stays live */
function scheduleFlush(cb: () => void) {
  if (document.visibilityState === 'visible') {
    requestAnimationFrame(cb)
  } else {
    window.setTimeout(cb, 66)
  }
}

export function ingestFrame(msg: FrameMessage) {
  const now = performance.now()

  // rotate interpolation buffer
  if (liveBuffer.next) {
    const delta = now - liveBuffer.next.receivedAt
    // adaptive smoothing of the expected frame interval
    liveBuffer.frameInterval = liveBuffer.frameInterval * 0.9 + delta * 0.1
    liveBuffer.prev = liveBuffer.next
  }
  liveBuffer.next = {
    pursuerPos: msg.pursuer.pos,
    pursuerVel: msg.pursuer.vel,
    evaderPos: msg.evader.pos,
    evaderVel: msg.evader.vel,
    receivedAt: now,
  }

  // a big backwards jump in step count means a fresh episode: snap, don't lerp
  if (pendingHudFrame && msg.step < pendingHudFrame.step) {
    liveBuffer.prev = liveBuffer.next
    liveBuffer.episodeResetAt = now
  }

  if (msg.captured) {
    liveBuffer.capture = { position: msg.evader.pos, at: now }
  }

  // throttle React updates to one per animation frame
  pendingHudFrame = msg
  if (!hudFlushScheduled) {
    hudFlushScheduled = true
    scheduleFlush(() => {
      hudFlushScheduled = false
      if (!pendingHudFrame) return
      const f = pendingHudFrame
      const history = [...snapshot.distanceHistory, f.distance]
      if (history.length > HISTORY_LEN) history.splice(0, history.length - HISTORY_LEN)
      // paused/speed/policyMode are deliberately NOT taken from frames:
      // control changes always arrive via a `status` broadcast, and a stale
      // queued frame must not clobber a fresher status update
      setSim({
        episode: f.episode,
        step: f.step,
        simTime: f.time,
        distance: f.distance,
        captureCount: f.capture_count,
        pursuerReward: f.pursuer_reward,
        evaderReward: f.evader_reward,
        arenaSize: f.arena_size,
        captureRadius: f.capture_radius,
        distanceHistory: history,
      })
    })
  }
}
