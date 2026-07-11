/**
 * Camera system.
 *
 * free / pursuer / evader: OrbitControls, with the target eased onto the
 * followed agent so orbiting still works while following.
 *
 * auto ("DIRECTOR"): a two-shot auto-director —
 *   WIDE:  slow long-lens orbit around the duel (compressed, observational)
 *   CHASE: when the gap closes under CHASE_IN, smash-cut to a low handheld
 *          cam glued behind the pursuer, looking through it at the evader
 * Cuts are hard (position + FOV snap); within a shot everything is damped.
 * On capture, a brief FOV punch sells the slow-motion beat in any mode.
 */

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useSim } from '../store/simStore'
import { renderState } from './renderState'

const BASE_FOV = 55
const WIDE_FOV = 34 // long lens: compressed, observational
const CHASE_FOV = 66 // wide lens: kinetic, close

const CHASE_IN = 5 // cut to chase cam when distance drops below
const CHASE_OUT = 9.5 // cut back to wide when the gap reopens (hysteresis)

const WIDE_RADIUS = 34
const WIDE_HEIGHT = 11
const ORBIT_SPEED = 0.045

type Shot = 'wide' | 'chase'

export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { cameraMode } = useSim()
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

  const shot = useRef<Shot>('wide')
  const orbitAngle = useRef(Math.PI * 0.25)
  const clock = useRef(0)
  const desired = useRef(new THREE.Vector3())
  const lookTarget = useRef(new THREE.Vector3())
  const midpoint = useRef(new THREE.Vector3())
  const chaseBack = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!renderState.hasData) return
    clock.current += delta

    // ---------------- director mode ---------------- //
    if (cameraMode === 'auto') {
      if (controls) controls.enabled = false

      const dist = renderState.pursuerPos.distanceTo(renderState.evaderPos)

      // shot selection with hysteresis; hold the shot during the capture beat
      let cut = false
      if (renderState.captureFlash === 0) {
        if (shot.current === 'wide' && dist < CHASE_IN) {
          shot.current = 'chase'
          cut = true
        } else if (shot.current === 'chase' && dist > CHASE_OUT) {
          shot.current = 'wide'
          cut = true
        }
      }

      midpoint.current
        .copy(renderState.pursuerPos)
        .add(renderState.evaderPos)
        .multiplyScalar(0.5)

      let targetFov: number
      if (shot.current === 'wide') {
        // slow orbital dolly around the duel
        orbitAngle.current += delta * ORBIT_SPEED
        desired.current.set(
          Math.cos(orbitAngle.current) * WIDE_RADIUS,
          WIDE_HEIGHT,
          Math.sin(orbitAngle.current) * WIDE_RADIUS,
        )
        lookTarget.current.copy(midpoint.current)
        targetFov = WIDE_FOV
        camera.position.lerp(desired.current, cut ? 1 : 0.03)
      } else {
        // low chase cam glued behind the pursuer, looking through to the evader
        chaseBack.current.copy(renderState.pursuerVel)
        if (chaseBack.current.lengthSq() < 0.05) chaseBack.current.set(0, 0, 1)
        chaseBack.current.normalize().multiplyScalar(-4.4)
        desired.current.copy(renderState.pursuerPos).add(chaseBack.current)
        desired.current.y += 1.5
        // handheld micro-shake, a touch harder as tension rises
        const shake = 0.045 + renderState.tension * 0.08
        desired.current.x += Math.sin(clock.current * 13.7) * shake
        desired.current.y += Math.sin(clock.current * 17.3 + 1.4) * shake * 0.7
        desired.current.z += Math.cos(clock.current * 11.9 + 0.6) * shake
        lookTarget.current.copy(renderState.evaderPos)
        targetFov = CHASE_FOV
        camera.position.lerp(desired.current, cut ? 1 : 0.14)
      }

      camera.lookAt(lookTarget.current)

      // hard cut snaps the lens; within a shot it eases; capture punches in
      const fovGoal = targetFov - renderState.captureFlash * 9
      camera.fov = cut ? fovGoal : camera.fov + (fovGoal - camera.fov) * 0.09
      camera.updateProjectionMatrix()
      return
    }

    // ---------------- orbit / follow modes ---------------- //
    if (!controls) return
    controls.enabled = true

    if (cameraMode === 'pursuer') {
      controls.target.lerp(renderState.pursuerPos, 0.08)
    } else if (cameraMode === 'evader') {
      controls.target.lerp(renderState.evaderPos, 0.08)
    }

    // capture slow-mo: quick FOV tighten that eases back out
    const targetFov = BASE_FOV - renderState.captureFlash * 8
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * 0.12
      camera.updateProjectionMatrix()
    }

    controls.update()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={90}
      maxPolarAngle={Math.PI * 0.72}
    />
  )
}
