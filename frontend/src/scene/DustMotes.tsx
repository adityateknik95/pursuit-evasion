/**
 * Slow-drifting atmospheric dust throughout the arena volume — cheap depth
 * cue that makes the light feel volumetric (Fraser-style haze particles).
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const COUNT = 260

export function DustMotes({ arenaSize }: { arenaSize: number }) {
  const drift = useRef(0)

  const { geometry, material, positions, span } = useMemo(() => {
    const span = arenaSize * 1.4
    const positions = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * span
      positions[i * 3 + 1] = (Math.random() - 0.5) * span
      positions[i * 3 + 2] = (Math.random() - 0.5) * span
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: new THREE.Color('#96b6d8'),
      size: 0.07,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    return { geometry, material, positions, span }
  }, [arenaSize])

  useFrame((_, delta) => {
    drift.current += delta
    const half = span / 2
    for (let i = 0; i < COUNT; i++) {
      // gentle upward current with a per-particle sideways sway
      positions[i * 3 + 1] += delta * 0.18
      positions[i * 3] += Math.sin(drift.current * 0.3 + i) * delta * 0.05
      if (positions[i * 3 + 1] > half) positions[i * 3 + 1] = -half
    }
    ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
