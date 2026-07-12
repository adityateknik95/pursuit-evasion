/**
 * TACTICAL mode: predictive geometry that makes the learned strategy legible.
 *
 *  - ghost trajectories: dashed constant-velocity projections (~2.4s ahead)
 *    for both agents, clamped to the arena
 *  - interception solve: fixed-point iteration on "when can the pursuer,
 *    flying at max speed, meet the evader's projected position?" — drawn as
 *    an amber line from the pursuer to a pulsing ring at the meet point
 *  - engagement line: pursuer↔evader, color sliding green→red with tension,
 *    with the live gap readout floating at its midpoint
 *
 * Watching PPO vs NAIVE with this on is the whole story: the naive line
 * points at the evader, the learned one points where the evader will be.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { renderState } from './renderState'
import { getSim, useSim } from '../store/simStore'

/** must match EnvConfig.pursuer_max_speed in the backend */
const PURSUER_MAX_SPEED = 4.6
const PREDICT_S = 2.4
const PATH_POINTS = 24

const SAFE = new THREE.Vector3()
function clampToArena(v: THREE.Vector3, half: number): THREE.Vector3 {
  v.x = Math.max(-half, Math.min(half, v.x))
  v.y = Math.max(-half, Math.min(half, v.y))
  v.z = Math.max(-half, Math.min(half, v.z))
  return v
}

function makeDashedLine(color: string, opacity: number, points: number) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3))
  const material = new THREE.LineDashedMaterial({
    color: new THREE.Color(color),
    dashSize: 0.5,
    gapSize: 0.32,
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const line = new THREE.Line(geometry, material)
  line.frustumCulled = false
  return line
}

export function TacticalOverlay() {
  const { distance } = useSim()

  const labelGroup = useRef<THREE.Group>(null!)
  const ringRef = useRef<THREE.Mesh>(null!)
  const clock = useRef(0)

  const parts = useMemo(() => {
    const pursuerPath = makeDashedLine('#ff7744', 0.4, PATH_POINTS)
    const evaderPath = makeDashedLine('#22d3ee', 0.4, PATH_POINTS)
    const interceptLine = makeDashedLine('#ffc45e', 0.55, 2)

    const gapGeometry = new THREE.BufferGeometry()
    gapGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const gapMaterial = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    })
    const gapLine = new THREE.Line(gapGeometry, gapMaterial)
    gapLine.frustumCulled = false

    return { pursuerPath, evaderPath, interceptLine, gapLine, gapMaterial }
  }, [])

  const greenCol = useMemo(() => new THREE.Color('#34d399'), [])
  const redCol = useMemo(() => new THREE.Color('#ff4433'), [])
  const intercept = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    if (!renderState.hasData) return
    clock.current += delta
    const half = getSim().arenaSize / 2
    const p = renderState.pursuerPos
    const e = renderState.evaderPos
    const pv = renderState.pursuerVel
    const ev = renderState.evaderVel

    // ---- ghost trajectories (constant-velocity, arena-clamped) ----
    for (const [line, pos, vel] of [
      [parts.pursuerPath, p, pv],
      [parts.evaderPath, e, ev],
    ] as const) {
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < PATH_POINTS; i++) {
        const t = (i / (PATH_POINTS - 1)) * PREDICT_S
        SAFE.copy(vel).multiplyScalar(t).add(pos)
        clampToArena(SAFE, half)
        attr.setXYZ(i, SAFE.x, SAFE.y, SAFE.z)
      }
      attr.needsUpdate = true
      line.computeLineDistances()
    }

    // ---- interception solve (fixed-point, 5 iterations) ----
    let t = p.distanceTo(e) / PURSUER_MAX_SPEED
    for (let i = 0; i < 5; i++) {
      intercept.copy(ev).multiplyScalar(t).add(e)
      clampToArena(intercept, half)
      t = p.distanceTo(intercept) / PURSUER_MAX_SPEED
    }
    const ia = parts.interceptLine.geometry.getAttribute('position') as THREE.BufferAttribute
    ia.setXYZ(0, p.x, p.y, p.z)
    ia.setXYZ(1, intercept.x, intercept.y, intercept.z)
    ia.needsUpdate = true
    parts.interceptLine.computeLineDistances()

    if (ringRef.current) {
      ringRef.current.position.copy(intercept)
      const pulse = 1 + Math.sin(clock.current * 4.2) * 0.16
      ringRef.current.scale.setScalar(pulse)
    }

    // ---- engagement line + floating gap label ----
    const ga = parts.gapLine.geometry.getAttribute('position') as THREE.BufferAttribute
    ga.setXYZ(0, p.x, p.y, p.z)
    ga.setXYZ(1, e.x, e.y, e.z)
    ga.needsUpdate = true
    parts.gapMaterial.color.copy(greenCol).lerp(redCol, renderState.tension)

    if (labelGroup.current) {
      labelGroup.current.position.copy(p).add(e).multiplyScalar(0.5)
    }
  })

  return (
    <group>
      <primitive object={parts.pursuerPath} />
      <primitive object={parts.evaderPath} />
      <primitive object={parts.interceptLine} />
      <primitive object={parts.gapLine} />
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.68, 40]} />
        <meshBasicMaterial
          color="#ffc45e"
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <group ref={labelGroup}>
        <Html center distanceFactor={26} style={{ pointerEvents: 'none' }}>
          <div className="tact-label">{distance.toFixed(2)}m</div>
        </Html>
      </group>
    </group>
  )
}
