import * as THREE from 'three';
import { scene } from './scene.js';
import { state } from './state.js';

const COMET_DEFS = [
  { name: 'Halley',    a:  59,  e: 0.967, periodS:  7400, inclRad: Math.PI * 162.0 / 180, Omega: 0.80, argPeri: 1.93, M0: 0.0,    tailScale: 1.00 },
  { name: 'Encke',    a:   7.4, e: 0.847, periodS:   330, inclRad: Math.PI *  11.8 / 180, Omega: 2.42, argPeri: 0.61, M0: Math.PI, tailScale: 0.65 },
  { name: 'Hale-Bopp',a: 100,  e: 0.995, periodS: 18600, inclRad: Math.PI *  89.4 / 180, Omega: 1.10, argPeri: 3.05, M0: 2.10,   tailScale: 1.40 },
  { name: 'Ikeya',   a:   28,  e: 0.921, periodS:  3100, inclRad: Math.PI *  51.7 / 180, Omega: 4.25, argPeri: 2.60, M0: 1.50,   tailScale: 0.80 },
];

function solveKepler(M, e) {
  M = M - Math.PI * 2 * Math.floor(M / (Math.PI * 2));
  let E = M + 0.85 * e * (Math.sin(M) >= 0 ? 1 : -1);
  for (let i = 0; i < 30; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  return E;
}

const cometSpriteTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0,   'rgba(210,235,255,1)');
  g.addColorStop(0.45,'rgba(130,190,255,0.35)');
  g.addColorStop(1,   'rgba(40,100,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

const TAIL_N = 64;
const _cometWPos = new THREE.Vector3();

export const comets = COMET_DEFS.map((def) => {
  const { a, e, inclRad, Omega, argPeri, M0 } = def;
  const b = a * Math.sqrt(1 - e * e);
  const cfoc = a * e;

  const outerGroup  = new THREE.Group(); outerGroup.rotation.y  = Omega;
  const middleGroup = new THREE.Group(); middleGroup.rotation.x = inclRad;
  const innerGroup  = new THREE.Group(); innerGroup.rotation.y  = argPeri;
  outerGroup.add(middleGroup);
  middleGroup.add(innerGroup);
  scene.add(outerGroup);

  const SUN_GAP = 7;
  const orbitPts = [];
  for (let i = 0; i <= 256; i++) {
    const theta = (i / 256) * Math.PI * 2;
    const x = a * Math.cos(theta) - cfoc;
    const z = b * Math.sin(theta);
    if (Math.hypot(x, z) < SUN_GAP) continue;
    orbitPts.push(new THREE.Vector3(x, 0, z));
  }
  const orbitLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitPts),
    new THREE.LineBasicMaterial({ color: 0x1a2e4a, transparent: true, opacity: 0.35 })
  );
  innerGroup.add(orbitLine);

  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xbbddff, emissive: 0x88bbff, emissiveIntensity: 2.5, roughness: 0.3 })
  );
  innerGroup.add(nucleus);

  const tailPos = new Float32Array(TAIL_N * 3);
  const tailRandA = new Float32Array(TAIL_N);
  const tailRandS = new Float32Array(TAIL_N);
  for (let i = 0; i < TAIL_N; i++) {
    tailRandA[i] = Math.random() * Math.PI * 2;
    tailRandS[i] = Math.random() * 0.5 + 0.5;
  }
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
  const tailPts = new THREE.Points(tailGeo, new THREE.PointsMaterial({
    size: 0.9,
    map: cometSpriteTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    opacity: 0.75,
  }));
  scene.add(tailPts);

  return { def, a, e, b, cfoc, M0, nucleus, tailPts, tailPos, tailGeo, tailRandA, tailRandS, orbitLine, outerGroup };
});

export function updateComets(elapsed) {
  comets.forEach(cm => {
    const { def, a, e, M0, nucleus, tailPts, tailPos, tailGeo, tailRandA, tailRandS } = cm;
    const M = M0 + (elapsed / def.periodS) * Math.PI * 2;
    const E = solveKepler(M, e);
    const sinHalf = Math.sin(E / 2);
    const cosHalf = Math.cos(E / 2);
    const v = 2 * Math.atan2(Math.sqrt(1 + e) * sinHalf, Math.sqrt(1 - e) * cosHalf);
    const r = a * (1 - e * Math.cos(E));

    nucleus.position.set(r * Math.cos(v), 0, r * Math.sin(v));

    nucleus.updateWorldMatrix(true, false);
    nucleus.getWorldPosition(_cometWPos);
    const wx = _cometWPos.x, wy = _cometWPos.y, wz = _cometWPos.z;

    const len = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
    const ax = -wx / len, ay = -wy / len, az = -wz / len;

    const tailLength = THREE.MathUtils.clamp((a / r) * 9 * def.tailScale, 0.5, 60);
    const opacity    = THREE.MathUtils.clamp(1.1 - r / (a * 0.7), 0.05, 0.85);
    tailPts.material.opacity = opacity;

    const perpX = -az, perpZ = ax;

    for (let i = 0; i < TAIL_N; i++) {
      const t = i / TAIL_N;
      const dist = tailLength * t * t;
      const spread = dist * 0.18 * tailRandS[i];
      const ca = Math.cos(tailRandA[i]), sa = Math.sin(tailRandA[i]);
      tailPos[i * 3]     = wx + ax * dist + ca * spread * perpX;
      tailPos[i * 3 + 1] = wy + ay * dist;
      tailPos[i * 3 + 2] = wz + az * dist + sa * spread * perpZ;
    }
    tailGeo.attributes.position.needsUpdate = true;
    cm.orbitLine.visible = state.showOrbits;
  });
}
