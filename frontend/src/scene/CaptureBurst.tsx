/**
 * Particle burst fired at the capture position. Watches the live buffer for
 * new capture events; particles expand with drag and fade out over ~1.4s.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { liveBuffer } from '../store/simStore'

const COUNT = 220
const LIFETIME_MS = 1400

export function CaptureBurst() {
  const pointsRef = useRef<THREE.Points>(null!)
  const lastCaptureAt = useRef(0)
  const active = useRef(false)

  const { geometry, material, velocities, positions } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const velocities = new Float32Array(COUNT * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: new THREE.Color('#ffb347'),
      size: 0.22,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    return { geometry, material, velocities, positions }
  }, [])

  useFrame((_, delta) => {
    const capture = liveBuffer.capture
    if (capture && capture.at !== lastCaptureAt.current) {
      // new capture: seed the burst at the capture position
      lastCaptureAt.current = capture.at
      active.current = true
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3] = capture.position[0]
        positions[i * 3 + 1] = capture.position[1]
        positions[i * 3 + 2] = capture.position[2]
        // random direction on a sphere, varied speed
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const speed = 3 + Math.random() * 9
        velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed
        velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed
        velocities[i * 3 + 2] = Math.cos(phi) * speed
      }
    }

    if (!active.current || !capture) return

    const age = performance.now() - capture.at
    if (age > LIFETIME_MS) {
      active.current = false
      material.opacity = 0
      return
    }

    const life = age / LIFETIME_MS
    material.opacity = (1 - life) * 0.95
    const drag = Math.exp(-2.2 * delta)
    for (let i = 0; i < COUNT; i++) {
      velocities[i * 3] *= drag
      velocities[i * 3 + 1] *= drag
      velocities[i * 3 + 2] *= drag
      positions[i * 3] += velocities[i * 3] * delta
      positions[i * 3 + 1] += velocities[i * 3 + 1] * delta
      positions[i * 3 + 2] += velocities[i * 3 + 2] * delta
    }
    ;(geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
}
