/**
 * Invisible floor plane used in "place" mode: clicking it records a pending
 * spawn position for the selected agent. Also renders ghost markers at the
 * pending positions so you can see what the next reset will use.
 */

import { useCallback } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { getSim, setSim, useSim } from '../store/simStore'
import type { Vec3 } from '../types/messages'

const SPAWN_HEIGHT_ABOVE_FLOOR = 3

function GhostMarker({ position, color }: { position: Vec3; color: string }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.45, 20, 20]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} wireframe />
      </mesh>
      <mesh position={[0, -(position[1] + getSim().arenaSize / 2) / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, position[1] + getSim().arenaSize / 2, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

export function GroundPicker() {
  const { arenaSize, placementTarget, pendingPursuerPos, pendingEvaderPos } = useSim()
  const half = arenaSize / 2

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const target = getSim().placementTarget
      if (!target) return
      e.stopPropagation()
      const half = getSim().arenaSize / 2
      const x = Math.max(-half + 0.5, Math.min(half - 0.5, e.point.x))
      const z = Math.max(-half + 0.5, Math.min(half - 0.5, e.point.z))
      const pos: Vec3 = [x, -half + SPAWN_HEIGHT_ABOVE_FLOOR, z]
      if (target === 'pursuer') {
        setSim({ pendingPursuerPos: pos, placementTarget: 'evader' })
      } else {
        setSim({ pendingEvaderPos: pos, placementTarget: null })
      }
    },
    [],
  )

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -half + 0.01, 0]}
        onClick={handleClick}
        visible={placementTarget !== null}
      >
        <planeGeometry args={[arenaSize, arenaSize]} />
        <meshBasicMaterial color="#4a9eff" transparent opacity={0.07} depthWrite={false} />
      </mesh>
      {pendingPursuerPos && <GhostMarker position={pendingPursuerPos} color="#ff5533" />}
      {pendingEvaderPos && <GhostMarker position={pendingEvaderPos} color="#22d3ee" />}
    </>
  )
}
