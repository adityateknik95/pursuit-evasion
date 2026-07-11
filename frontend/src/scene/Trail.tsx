/**
 * Fading motion trail: a line strip through the agent's recent positions with
 * per-vertex alpha falloff (newest = opaque, oldest = transparent), rendered
 * with a small custom shader and additive blending.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { renderState } from './renderState'

const TRAIL_LENGTH = 140
/** min movement (world units) before we record a new trail point */
const MIN_STEP_SQ = 0.0004

const vertexShader = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha * vAlpha * 0.85);
  }
`

interface TrailProps {
  role: 'pursuer' | 'evader'
  color: string
}

export function Trail({ role, color }: TrailProps) {
  const initialized = useRef(false)

  const { line, geometry, positions } = useMemo(() => {
    const positions = new Float32Array(TRAIL_LENGTH * 3)
    const alphas = new Float32Array(TRAIL_LENGTH)
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      // head of the trail is index TRAIL_LENGTH-1
      alphas[i] = i / (TRAIL_LENGTH - 1)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const line = new THREE.Line(geometry, material)
    line.frustumCulled = false
    return { line, geometry, positions }
  }, [color])

  useFrame(() => {
    if (!renderState.hasData) return
    const pos = role === 'pursuer' ? renderState.pursuerPos : renderState.evaderPos

    if (!initialized.current) {
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        positions[i * 3] = pos.x
        positions[i * 3 + 1] = pos.y
        positions[i * 3 + 2] = pos.z
      }
      initialized.current = true
    } else {
      const headX = positions[(TRAIL_LENGTH - 1) * 3]
      const headY = positions[(TRAIL_LENGTH - 1) * 3 + 1]
      const headZ = positions[(TRAIL_LENGTH - 1) * 3 + 2]
      const dx = pos.x - headX
      const dy = pos.y - headY
      const dz = pos.z - headZ
      const distSq = dx * dx + dy * dy + dz * dz

      // teleport (episode reset): collapse the trail to the new position
      if (distSq > 9) {
        for (let i = 0; i < TRAIL_LENGTH; i++) {
          positions[i * 3] = pos.x
          positions[i * 3 + 1] = pos.y
          positions[i * 3 + 2] = pos.z
        }
      } else if (distSq > MIN_STEP_SQ) {
        positions.copyWithin(0, 3)
        positions[(TRAIL_LENGTH - 1) * 3] = pos.x
        positions[(TRAIL_LENGTH - 1) * 3 + 1] = pos.y
        positions[(TRAIL_LENGTH - 1) * 3 + 2] = pos.z
      } else {
        // still update the head so the trail sticks to the agent while slow
        positions[(TRAIL_LENGTH - 1) * 3] = pos.x
        positions[(TRAIL_LENGTH - 1) * 3 + 1] = pos.y
        positions[(TRAIL_LENGTH - 1) * 3 + 2] = pos.z
      }
    }

    const attr = geometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
  })

  return <primitive object={line} />
}
