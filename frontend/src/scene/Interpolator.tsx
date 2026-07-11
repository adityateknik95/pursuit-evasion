/**
 * Reads the WebSocket frame buffer each rAF and writes smoothly interpolated
 * agent positions/velocities into `renderState`. Renders nothing itself.
 */

import { useFrame } from '@react-three/fiber'
import { liveBuffer } from '../store/simStore'
import { lerpVec3, renderState } from './renderState'

const CAPTURE_FLASH_MS = 1100

export function Interpolator() {
  useFrame(() => {
    const { prev, next, frameInterval, capture, episodeResetAt } = liveBuffer
    if (!next) return

    const now = performance.now()

    if (!prev || next.receivedAt <= episodeResetAt) {
      // fresh episode or first frame: snap directly, no lerp across respawn
      renderState.pursuerPos.set(...next.pursuerPos)
      renderState.evaderPos.set(...next.evaderPos)
    } else {
      // render interpolated between the last two server frames; allow a
      // little extrapolation (t up to 1.25) to hide network jitter
      const t = Math.min((now - next.receivedAt) / frameInterval, 1.25)
      lerpVec3(renderState.pursuerPos, prev.pursuerPos, next.pursuerPos, t)
      lerpVec3(renderState.evaderPos, prev.evaderPos, next.evaderPos, t)
    }

    renderState.pursuerVel.set(...next.pursuerVel)
    renderState.evaderVel.set(...next.evaderVel)
    renderState.hasData = true

    // threat level: 1 when nearly caught, 0 beyond ~14m; eased so the
    // lighting grade breathes instead of flickering
    const dist = renderState.pursuerPos.distanceTo(renderState.evaderPos)
    const targetTension = Math.min(Math.max(1 - (dist - 1.5) / 12.5, 0), 1)
    renderState.tension += (targetTension - renderState.tension) * 0.04

    if (capture) {
      const age = now - capture.at
      renderState.captureFlash = age < CAPTURE_FLASH_MS ? 1 - age / CAPTURE_FLASH_MS : 0
    } else {
      renderState.captureFlash = 0
    }
  })

  return null
}
