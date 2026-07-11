/**
 * A glowing agent: sleek cone body oriented along its velocity vector,
 * emissive core sphere, additive glow sprite and a point light.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { renderState } from './renderState'

const UP = new THREE.Vector3(0, 1, 0)

interface AgentProps {
  role: 'pursuer' | 'evader'
  color: string
  glowColor: string
}

function makeGlowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

/** thin horizontal gradient used for the CINE anamorphic lens streak */
function makeStreakTexture(): THREE.Texture {
  const w = 256
  const h = 16
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, w, 0)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.85)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  return new THREE.CanvasTexture(canvas)
}

export function Agent({ role, color, glowColor }: AgentProps) {
  const group = useRef<THREE.Group>(null!)
  const cone = useRef<THREE.Mesh>(null!)
  const glowMat = useRef<THREE.SpriteMaterial>(null!)
  const streak = useRef<THREE.Sprite>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const glowTex = useMemo(makeGlowTexture, [])
  const streakTex = useMemo(makeStreakTexture, [])
  const quat = useMemo(() => new THREE.Quaternion(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    if (!renderState.hasData) return
    const pos = role === 'pursuer' ? renderState.pursuerPos : renderState.evaderPos
    const vel = role === 'pursuer' ? renderState.pursuerVel : renderState.evaderVel

    group.current.position.copy(pos)

    // orient the cone's +Y axis along the velocity vector
    if (vel.lengthSq() > 0.01) {
      dir.copy(vel).normalize()
      quat.setFromUnitVectors(UP, dir)
      cone.current.quaternion.slerp(quat, 0.2)
    }

    // the pursuer's glow heats up as the kill closes in
    if (glowMat.current && light.current && role === 'pursuer') {
      glowMat.current.opacity = 0.55 + renderState.tension * 0.35
      light.current.intensity = 6 + renderState.tension * 10
    }
  })

  return (
    <group ref={group}>
      <mesh ref={cone}>
        <coneGeometry args={[0.34, 1.15, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={glowColor}
          emissiveIntensity={2.2}
          roughness={0.25}
          metalness={0.4}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshBasicMaterial color={glowColor} />
      </mesh>
      <sprite scale={[2.6, 2.6, 1]}>
        <spriteMaterial
          ref={glowMat}
          map={glowTex}
          color={glowColor}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={streak} scale={[7.2, 0.3, 1]}>
        <spriteMaterial
          map={streakTex}
          color={glowColor}
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <pointLight ref={light} color={glowColor} intensity={6} distance={9} decay={2} />
    </group>
  )
}
