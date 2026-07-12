/**
 * The full 3D stage — the "hybrid" cinematic grade:
 *  - Deakins/Fraser dusk frame: gradient sky dome, one low warm sun as the
 *    motivated key, haze, wet reflective floor, anamorphic streaks,
 *    film grain + chromatic aberration + letterbox (in the HUD layer)
 *  - threat-reactive drama: red rim-light and heated fog as the pursuer
 *    closes in, danger glow tracking the duel, capture shockwave
 */

import { Canvas } from '@react-three/fiber'
import { Grid, MeshReflectorMaterial } from '@react-three/drei'
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Noise,
  Vignette,
} from '@react-three/postprocessing'
import * as THREE from 'three'
import { useSim } from '../store/simStore'
import { Interpolator } from './Interpolator'
import { Agent } from './Agent'
import { Trail } from './Trail'
import { CaptureBurst } from './CaptureBurst'
import { CameraRig } from './CameraRig'
import { GroundPicker } from './GroundPicker'
import { SkyDome } from './SkyDome'
import { DustMotes } from './DustMotes'
import { Shockwave } from './Shockwave'
import { TensionLights } from './TensionLights'
import { TacticalOverlay } from './TacticalOverlay'

const PURSUER_COLOR = '#ff4422'
const PURSUER_GLOW = '#ff7744'
const EVADER_COLOR = '#0891b2'
const EVADER_GLOW = '#22d3ee'

function ArenaBounds({ size }: { size: number }) {
  return (
    <mesh>
      <boxGeometry args={[size, size, size]} />
      <meshBasicMaterial color="#4a3a52" wireframe transparent opacity={0.1} />
    </mesh>
  )
}

/** Wet-tarmac reflective floor with the grid projected on top */
function ReflectiveFloor({ half }: { half: number }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -half - 0.02, 0]}>
        <planeGeometry args={[240, 240]} />
        <MeshReflectorMaterial
          blur={[280, 60]}
          resolution={512}
          mixBlur={0.9}
          mixStrength={6.5}
          roughness={0.85}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#0c0b10"
          metalness={0.55}
          mirror={0.5}
        />
      </mesh>
      <Grid
        position={[0, -half + 0.02, 0]}
        args={[240, 240]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#241d2e"
        sectionSize={5}
        sectionThickness={0.9}
        sectionColor="#463349"
        fadeDistance={85}
        fadeStrength={1.6}
        infiniteGrid
      />
    </>
  )
}

export function Scene() {
  const { arenaSize, tacticalMode } = useSim()
  const half = arenaSize / 2

  return (
    <Canvas
      camera={{ position: [24, 14, 24], fov: 55, near: 0.1, far: 400 }}
      gl={{ antialias: true }}
      dpr={[1, 1.75]}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0b0a12']} />
      <fog attach="fog" args={['#151019', 26, 115]} />

      {/* one motivated key: the low warm sun, plus a whisper of cool fill */}
      <ambientLight intensity={0.1} color="#2a2438" />
      <directionalLight position={[70, 11, -52]} intensity={1.5} color="#ffb27a" />
      <directionalLight position={[-24, 20, 14]} intensity={0.18} color="#5a76a8" />
      <SkyDome />
      <TensionLights />

      <ReflectiveFloor half={half} />
      <ArenaBounds size={arenaSize} />
      <GroundPicker />
      <DustMotes arenaSize={arenaSize} />

      <Interpolator />
      <Agent role="pursuer" color={PURSUER_COLOR} glowColor={PURSUER_GLOW} />
      <Agent role="evader" color={EVADER_COLOR} glowColor={EVADER_GLOW} />
      <Trail role="pursuer" color={PURSUER_GLOW} />
      <Trail role="evader" color={EVADER_GLOW} />
      <CaptureBurst />
      <Shockwave />
      {tacticalMode && <TacticalOverlay />}
      <CameraRig />

      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.22} luminanceSmoothing={0.7} mipmapBlur />
        <ChromaticAberration
          offset={new THREE.Vector2(0.0007, 0.0004)}
          radialModulation={false}
          modulationOffset={0}
        />
        <Noise opacity={0.07} />
        <Vignette eskil={false} offset={0.24} darkness={0.86} />
      </EffectComposer>
    </Canvas>
  )
}
