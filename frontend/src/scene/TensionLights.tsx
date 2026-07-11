/**
 * Threat-reactive lighting: as the pursuer closes in, a low red rim-light
 * rises across the arena, a danger glow tracks the midpoint of the duel,
 * and the dusk haze itself heats toward ember red — the whole frame becomes
 * the tension meter.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { renderState } from './renderState'

const BASE_FOG = '#151019'
const HOT_FOG = '#241017'

export function TensionLights() {
  const redRim = useRef<THREE.DirectionalLight>(null!)
  const floorGlow = useRef<THREE.PointLight>(null!)
  const scene = useThree((s) => s.scene)

  const baseFog = useMemo(() => new THREE.Color(BASE_FOG), [])
  const hotFog = useMemo(() => new THREE.Color(HOT_FOG), [])

  // restore the untinted haze if this layer ever unmounts
  useEffect(() => {
    return () => {
      if (scene.fog) (scene.fog as THREE.Fog).color.copy(baseFog)
    }
  }, [scene, baseFog])

  useFrame(() => {
    const t = renderState.tension
    if (redRim.current) redRim.current.intensity = t * 2.2
    if (floorGlow.current) {
      floorGlow.current.intensity = t * 14
      // the danger glow tracks the midpoint of the duel
      floorGlow.current.position
        .copy(renderState.pursuerPos)
        .add(renderState.evaderPos)
        .multiplyScalar(0.5)
    }
    // the atmosphere itself heats up as the kill closes in
    if (scene.fog) {
      ;(scene.fog as THREE.Fog).color.copy(baseFog).lerp(hotFog, t * 0.85)
    }
  })

  return (
    <>
      <directionalLight ref={redRim} position={[-22, 5, -16]} color="#ff2213" intensity={0} />
      <pointLight ref={floorGlow} color="#ff3a1e" intensity={0} distance={16} decay={2} />
    </>
  )
}
