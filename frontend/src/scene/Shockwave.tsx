/**
 * Capture shockwave: an emissive ring that races outward along the floor
 * from the capture point while fading — the "frame 0" of the capture beat.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { liveBuffer, getSim } from '../store/simStore'

const DURATION_MS = 950
const MAX_RADIUS = 17

export function Shockwave() {
  const meshRef = useRef<THREE.Mesh>(null!)
  const lastCaptureAt = useRef(0)

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffc9a3'),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useFrame(() => {
    const capture = liveBuffer.capture
    const mesh = meshRef.current
    if (!capture || !mesh) return

    if (capture.at !== lastCaptureAt.current) {
      lastCaptureAt.current = capture.at
      const half = getSim().arenaSize / 2
      mesh.position.set(capture.position[0], -half + 0.06, capture.position[2])
    }

    const age = performance.now() - capture.at
    if (age > DURATION_MS) {
      material.opacity = 0
      return
    }
    const t = age / DURATION_MS
    const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
    const r = 0.5 + eased * MAX_RADIUS
    mesh.scale.set(r, r, r)
    material.opacity = (1 - t) * 0.8
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={material} frustumCulled={false}>
      <ringGeometry args={[0.92, 1.0, 64]} />
    </mesh>
  )
}
