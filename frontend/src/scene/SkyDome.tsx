/**
 * CINE look: dusk-at-altitude gradient sky dome (deep indigo zenith falling
 * to a warm ember horizon) plus a low sun disc that blooms — the single
 * motivated light source of the scene.
 */

import { useMemo } from 'react'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 zenith  = vec3(0.020, 0.028, 0.070);
    vec3 mid     = vec3(0.075, 0.055, 0.105);
    vec3 horizon = vec3(0.360, 0.160, 0.095);
    vec3 below   = vec3(0.008, 0.010, 0.018);

    vec3 col = mix(mid, zenith, smoothstep(0.06, 0.62, h));
    col = mix(horizon, col, smoothstep(-0.015, 0.20, h));
    col = mix(below, col, smoothstep(-0.35, -0.02, h));

    // warm bias toward the sun azimuth (+x/-z) so the glow feels directional
    float sunSide = max(dot(normalize(vDir.xz), normalize(vec2(0.8, -0.6))), 0.0);
    col += vec3(0.10, 0.035, 0.008) * pow(sunSide, 3.0) * smoothstep(-0.05, 0.25, h) * (1.0 - smoothstep(0.25, 0.7, h));

    gl_FragColor = vec4(col, 1.0);
  }
`

function makeSunTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255, 235, 205, 1)')
  g.addColorStop(0.18, 'rgba(255, 190, 130, 0.9)')
  g.addColorStop(0.5, 'rgba(255, 140, 70, 0.25)')
  g.addColorStop(1, 'rgba(255, 120, 50, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

export function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  )
  const sunTex = useMemo(makeSunTexture, [])

  return (
    <group>
      <mesh material={material} renderOrder={-10}>
        <sphereGeometry args={[170, 32, 16]} />
      </mesh>
      {/* low sun disc along the warm horizon direction */}
      <sprite position={[105, 9, -80]} scale={[30, 30, 1]}>
        <spriteMaterial
          map={sunTex}
          color="#ffd9ae"
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </sprite>
    </group>
  )
}
