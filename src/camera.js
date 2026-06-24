import * as THREE from 'three';
import { camera } from './scene.js';

export const cam = {
  pos:       new THREE.Vector3(0, 130, 32),
  lookAt:    new THREE.Vector3(0, 0, 0),
  up:        new THREE.Vector3(0, 0, -1),
  tgtPos:    new THREE.Vector3(0, 130, 32),
  tgtLookAt: new THREE.Vector3(0, 0, 0),
  tgtUp:     new THREE.Vector3(0, 0, -1),
  animating: false,
  onDone: null,
};

camera.position.copy(cam.pos);
camera.up.copy(cam.up);
camera.lookAt(cam.lookAt);

export const frontViewLookAtOffset = new THREE.Vector3();

export function moveCameraTo(toPos, toLookAt, onDone) {
  cam.tgtPos.copy(toPos);
  cam.tgtLookAt.copy(toLookAt);
  cam.animating = true;
  cam.onDone = onDone || null;
}

export function tickCamera(dt) {
  if (!cam.animating) return;
  const k = Math.min(1, dt * 2.6);
  cam.pos.lerp(cam.tgtPos, k);
  cam.lookAt.lerp(cam.tgtLookAt, k);
  cam.up.lerp(cam.tgtUp, k).normalize();
  camera.position.copy(cam.pos);
  camera.up.copy(cam.up);
  camera.lookAt(cam.lookAt);
  if (cam.pos.distanceTo(cam.tgtPos) < 0.3) {
    cam.pos.copy(cam.tgtPos);
    cam.lookAt.copy(cam.tgtLookAt);
    cam.up.copy(cam.tgtUp);
    camera.position.copy(cam.pos);
    camera.up.copy(cam.up);
    camera.lookAt(cam.lookAt);
    cam.animating = false;
    const cb = cam.onDone; cam.onDone = null;
    if (cb) cb();
  }
}

const ZOOM = { min: 14, max: 540, step: 0.0016 };

export function applyZoom(deltaY, state) {
  if (cam.animating) return;
  const offset = cam.pos.clone().sub(cam.lookAt);
  let dist = offset.length();
  if (dist < 1e-3) return;
  dist *= Math.exp(deltaY * ZOOM.step);
  dist = Math.min(state.realScale ? 1400 : ZOOM.max, Math.max(ZOOM.min, dist));
  offset.setLength(dist);
  cam.pos.copy(cam.lookAt).add(offset);
  cam.tgtPos.copy(cam.pos);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.lookAt);
}
