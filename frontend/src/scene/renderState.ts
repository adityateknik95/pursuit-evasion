/**
 * Mutable render-side state shared between the interpolator, agents, trails,
 * camera rig and capture FX. Lives outside React — updated once per rAF.
 */

import * as THREE from 'three'

export const renderState = {
  pursuerPos: new THREE.Vector3(),
  pursuerVel: new THREE.Vector3(),
  evaderPos: new THREE.Vector3(),
  evaderVel: new THREE.Vector3(),
  /** eased 0..1 factor: 1 while a capture flash/slow-mo is active */
  captureFlash: 0,
  /**
   * 0..1 threat level driven by pursuer-evader distance (1 = about to be
   * caught). Eased over time; drives the reactive lighting/atmosphere grade.
   */
  tension: 0,
  hasData: false,
}

const tmpPrev = new THREE.Vector3()
const tmpNext = new THREE.Vector3()

export function lerpVec3(
  out: THREE.Vector3,
  a: [number, number, number],
  b: [number, number, number],
  t: number,
) {
  tmpPrev.set(a[0], a[1], a[2])
  tmpNext.set(b[0], b[1], b[2])
  out.copy(tmpPrev).lerp(tmpNext, t)
}
