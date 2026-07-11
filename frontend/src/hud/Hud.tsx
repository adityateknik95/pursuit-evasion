/**
 * Glassmorphism HUD: mission stats, connection status, distance sparkline,
 * and the control deck (pause/resume, reset, speed, policy mode, placement,
 * camera mode).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSim, setSim, useSim } from '../store/simStore'
import { sendControl } from '../ws/wsClient'
import type { CameraMode } from '../types/messages'
import { Sparkline } from './Sparkline'

/** white flash + slammed "CAPTURE" title card, fired when captureCount ticks up */
function CaptureStamp() {
  const { captureCount } = useSim()
  const prev = useRef(captureCount)
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    if (captureCount > prev.current) {
      setBurst(captureCount)
      const t = window.setTimeout(() => setBurst(0), 1500)
      prev.current = captureCount
      return () => window.clearTimeout(t)
    }
    prev.current = captureCount
  }, [captureCount])

  if (!burst) return null
  return (
    <>
      <div className="capture-flash" key={`flash-${burst}`} />
      <div className="capture-stamp" key={`stamp-${burst}`}>
        CAPTURE
      </div>
    </>
  )
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits)
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${String(m).padStart(2, '0')}:${s}`
}

export function Hud() {
  const sim = useSim()

  const handleReset = useCallback(() => {
    const { pendingPursuerPos, pendingEvaderPos } = getSim()
    sendControl({
      type: 'reset',
      ...(pendingPursuerPos ? { pursuer_pos: pendingPursuerPos } : {}),
      ...(pendingEvaderPos ? { evader_pos: pendingEvaderPos } : {}),
    })
    setSim({ pendingPursuerPos: null, pendingEvaderPos: null, placementTarget: null })
  }, [])

  const handlePauseResume = useCallback(() => {
    sendControl({ type: getSim().paused ? 'resume' : 'pause' })
  }, [])

  const handleSpeed = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    setSim({ speed: value })
    sendControl({ type: 'set_speed', value })
  }, [])

  const handlePolicy = useCallback((mode: 'ppo' | 'naive') => {
    sendControl({ type: 'set_policy_mode', value: mode })
  }, [])

  const handlePlace = useCallback(() => {
    const current = getSim().placementTarget
    setSim({
      placementTarget: current ? null : 'pursuer',
      ...(current ? {} : { pendingPursuerPos: null, pendingEvaderPos: null }),
    })
  }, [])

  const setCamera = useCallback((cameraMode: CameraMode) => {
    setSim({ cameraMode })
  }, [])

  const placementHint =
    sim.placementTarget === 'pursuer'
      ? 'CLICK FLOOR → PURSUER START'
      : sim.placementTarget === 'evader'
        ? 'CLICK FLOOR → EVADER START'
        : null

  return (
    <div className="hud">
      {/* 2.39:1 letterbox bars */}
      <div className="letterbox letterbox-top" />
      <div className="letterbox letterbox-bottom" />
      <CaptureStamp />

      {/* ---- top-left: mission stats ---- */}
      <section className="panel stats-panel">
        <header className="panel-title">
          <span className="title-main">PURSUIT // EVASION</span>
          <span className="title-sub">MISSION TELEMETRY</span>
        </header>

        <div className="stat-grid">
          <div className="stat">
            <span className="stat-label">DISTANCE</span>
            <span className="stat-value accent-cyan">{fmt(sim.distance)}<em>m</em></span>
          </div>
          <div className="stat">
            <span className="stat-label">EP TIME</span>
            <span className="stat-value">{fmtTime(sim.simTime)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">EPISODE</span>
            <span className="stat-value">{sim.episode}</span>
          </div>
          <div className="stat">
            <span className="stat-label">STEP</span>
            <span className="stat-value">{sim.step}</span>
          </div>
          <div className="stat">
            <span className="stat-label">CAPTURES</span>
            <span className="stat-value accent-orange">{sim.captureCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">REWARD</span>
            <span className="stat-value">{fmt(sim.pursuerReward, 1)}</span>
          </div>
        </div>

        <div className="spark-block">
          <span className="stat-label">DISTANCE / TIME</span>
          <Sparkline />
        </div>
      </section>

      {/* ---- top-right: connection + policy ---- */}
      <section className="panel status-panel">
        <div className={`conn conn-${sim.connection}`}>
          <span className="conn-dot" />
          {sim.connection.toUpperCase()}
        </div>
        <div className="policy-badge">
          POLICY&nbsp;
          <strong className={sim.policyMode === 'ppo' ? 'accent-cyan' : 'accent-orange'}>
            {sim.policyMode === 'ppo' ? 'PPO · TRAINED' : 'NAIVE · HEURISTIC'}
          </strong>
        </div>
        {!sim.modelLoaded && <div className="warn-badge">NO CHECKPOINT — NAIVE ONLY</div>}
        {sim.lastError && <div className="warn-badge">{sim.lastError}</div>}
        {placementHint && <div className="place-hint">{placementHint}</div>}
        {sim.paused && <div className="paused-badge">PAUSED</div>}
      </section>

      {/* ---- bottom: control deck ---- */}
      <section className="panel control-panel">
        <div className="control-group">
          <button className="btn" onClick={handlePauseResume}>
            {sim.paused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
          <button className="btn" onClick={handleReset}>
            ↺ RESET{sim.pendingPursuerPos || sim.pendingEvaderPos ? ' *' : ''}
          </button>
          <button
            className={`btn ${sim.placementTarget ? 'btn-active' : ''}`}
            onClick={handlePlace}
          >
            ⌖ PLACE
          </button>
        </div>

        <div className="control-group slider-group">
          <span className="stat-label">SPEED ×{fmt(sim.speed, 2)}</span>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={sim.speed}
            onChange={handleSpeed}
            aria-label="simulation speed"
          />
        </div>

        <div className="control-group">
          <span className="stat-label">POLICY</span>
          <div className="segmented">
            <button
              className={sim.policyMode === 'ppo' ? 'seg-active' : ''}
              onClick={() => handlePolicy('ppo')}
              disabled={!sim.modelLoaded}
            >
              PPO
            </button>
            <button
              className={sim.policyMode === 'naive' ? 'seg-active' : ''}
              onClick={() => handlePolicy('naive')}
            >
              NAIVE
            </button>
          </div>
        </div>

        <div className="control-group">
          <span className="stat-label">CAMERA</span>
          <div className="segmented">
            {(['free', 'pursuer', 'evader', 'auto'] as CameraMode[]).map((mode) => (
              <button
                key={mode}
                className={sim.cameraMode === mode ? 'seg-active' : ''}
                onClick={() => setCamera(mode)}
              >
                {mode === 'auto' ? 'DIRECTOR' : mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
