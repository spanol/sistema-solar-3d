import * as THREE from 'three';
import allBodies from './data/planets.json';
import { scene } from './scene.js';

export const sunData = allBodies.find(b => b.isStar);
export const planetBodies = allBodies.filter(b => !b.isStar);
export { allBodies };

export const TOP_CAM_COMPRESSED = new THREE.Vector3(0, 130, 32);
export const TOP_CAM_REAL       = new THREE.Vector3(0, 560, 32);
export const SCENE_UNITS_PER_MKM = 16 / 149.6;

// -- Texture loader
export const textureLoader = new THREE.TextureLoader();

export const PLANET_TEXTURES = {
  sol:     '/textures/2k_sun.jpg',
  mercury: '/textures/2k_mercury.jpg',
  venus:   '/textures/2k_venus_surface.jpg',
  earth:   '/textures/2k_earth_daymap.jpg',
  mars:    '/textures/2k_mars.jpg',
  jupiter: '/textures/2k_jupiter.jpg',
  saturn:  '/textures/2k_saturn.jpg',
  uranus:  '/textures/2k_uranus.jpg',
  neptune: '/textures/2k_neptune.jpg',
};

// -- Sun
export const sunState = { textureLoaded: false };
export const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffee44 })
);
scene.add(sunMesh);

textureLoader.load(PLANET_TEXTURES.sol, (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  sunMesh.material.map = tex;
  sunMesh.material.color.set(0xffffff);
  sunMesh.material.needsUpdate = true;
  sunState.textureLoaded = true;
});

[
  { r: 5.8,  color: 0xffaa00, opacity: 0.22 },
  { r: 7.5,  color: 0xff6600, opacity: 0.10 },
  { r: 10.5, color: 0xff4400, opacity: 0.05 },
].forEach(({ r, color, opacity }) => {
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(r, 32, 32),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  ));
});

// -- Asteroid Belt
const asteroidSpriteTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0,    'rgba(255,255,255,1.0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.70, 'rgba(255,255,255,0.15)');
  g.addColorStop(1,    'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

function makeAsteroidBelt(innerR, outerR) {
  const count = 2000;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = innerR + Math.random() * (outerR - innerR);
    pos[i * 3]     = Math.cos(angle) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
    pos[i * 3 + 2] = Math.sin(angle) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x998877,
    size: 0.22,
    sizeAttenuation: true,
    map: asteroidSpriteTex,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.01,
    opacity: 0.75,
  }));
}

export const asteroidBeltCompressed = makeAsteroidBelt(22.5, 27.5);
export const asteroidBeltReal = makeAsteroidBelt(35.2, 51.2);
asteroidBeltReal.material.opacity = 0;
scene.add(asteroidBeltCompressed);
scene.add(asteroidBeltReal);

// -- Kuiper Belt
function makeKuiperBelt(innerR, outerR, count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = innerR + Math.random() * (outerR - innerR);
    pos[i * 3]     = Math.cos(angle) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 2.8;
    pos[i * 3 + 2] = Math.sin(angle) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x8aaab8,
    size: 0.18,
    sizeAttenuation: true,
    map: asteroidSpriteTex,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.01,
    opacity: 0.40,
  }));
}

export const kuiperBeltCompressed = makeKuiperBelt(64, 84, 1200);
export const kuiperBeltReal       = makeKuiperBelt(480, 880, 1200);
kuiperBeltReal.material.opacity = 0;
scene.add(kuiperBeltCompressed);
scene.add(kuiperBeltReal);

// -- Planets
export const planets = planetBodies.map((data, i) => {
  const startAngle = (i / planetBodies.length) * Math.PI * 2;
  const vr = Math.max(data.radius * 1.5, 0.65);
  const tiltRad = THREE.MathUtils.degToRad(data.axialTilt || 0);

  const orbitMesh = new THREE.Mesh(
    new THREE.RingGeometry(data.orbitRadius - 0.1, data.orbitRadius + 0.1, 128),
    new THREE.MeshBasicMaterial({ color: 0x1e3050, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  orbitMesh.rotation.x = Math.PI / 2;
  scene.add(orbitMesh);

  const group = new THREE.Group();
  group.position.set(Math.cos(startAngle) * data.orbitRadius, 0, Math.sin(startAngle) * data.orbitRadius);
  scene.add(group);

  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = tiltRad;
  group.add(tiltGroup);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(vr, 32, 32),
    new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.7, metalness: 0.0 })
  );
  tiltGroup.add(mesh);

  const planetTexPath = PLANET_TEXTURES[data.id];
  if (planetTexPath) {
    textureLoader.load(planetTexPath, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mesh.material.map = tex;
      mesh.material.color.set(0xffffff);
      mesh.material.needsUpdate = true;
    });
  }

  let ringMesh = null;
  if (data.hasRings) {
    const innerR = vr * 1.6;
    const outerR = vr * 2.8;
    const ringGeo = new THREE.RingGeometry(innerR, outerR, 192, 4);
    const pos = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j);
      const y = pos.getY(j);
      const r = Math.sqrt(x * x + y * y);
      uv.setXY(j, (r - innerR) / (outerR - innerR), 0.5);
    }
    uv.needsUpdate = true;

    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 512; ringCanvas.height = 4;
    const rCtx = ringCanvas.getContext('2d');
    const rGrad = rCtx.createLinearGradient(0, 0, 512, 0);
    rGrad.addColorStop(0.00, 'rgba(155,125,80,0.10)');
    rGrad.addColorStop(0.12, 'rgba(162,132,87,0.22)');
    rGrad.addColorStop(0.18, 'rgba(218,192,138,0.88)');
    rGrad.addColorStop(0.30, 'rgba(238,208,150,0.97)');
    rGrad.addColorStop(0.45, 'rgba(228,200,144,0.93)');
    rGrad.addColorStop(0.500, 'rgba(55,44,29,0.08)');
    rGrad.addColorStop(0.535, 'rgba(22,18,12,0.01)');
    rGrad.addColorStop(0.570, 'rgba(55,44,29,0.08)');
    rGrad.addColorStop(0.620, 'rgba(200,174,124,0.80)');
    rGrad.addColorStop(0.730, 'rgba(210,184,132,0.84)');
    rGrad.addColorStop(0.820, 'rgba(190,165,118,0.70)');
    rGrad.addColorStop(0.900, 'rgba(148,128,90,0.30)');
    rGrad.addColorStop(1.000, 'rgba(92,80,56,0.03)');
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(0, 0, 512, 4);
    const ringColorTex = new THREE.CanvasTexture(ringCanvas);

    ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshLambertMaterial({
        map: ringColorTex,
        emissive: new THREE.Color(0.15, 0.12, 0.06),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    tiltGroup.add(ringMesh);

    textureLoader.load('/textures/2k_saturn_ring_alpha.png', (tex) => {
      ringMesh.material.alphaMap = tex;
      ringMesh.material.needsUpdate = true;
    });
  }

  return { mesh, ringMesh, group, orbitMesh, data, angle: startAngle, speed: data.orbitSpeed * 0.007, vr };
});

export const meshList = planets.map(p => p.mesh);
export const clickTargets = planets.flatMap(p => p.ringMesh ? [p.mesh, p.ringMesh] : [p.mesh]);

planets.forEach(p => {
  p.realOrbitRadius    = p.data.distanceFromSunMkm * SCENE_UNITS_PER_MKM;
  p.currentOrbitRadius = p.data.orbitRadius;
  p.targetOrbitRadius  = p.data.orbitRadius;
});

// -- Moons
export const allMoons = [];
planets.forEach(p => {
  p.moons = [];
  if (!p.data.moons) return;
  p.data.moons.forEach((md, mi) => {
    const startAngle = (mi / p.data.moons.length) * Math.PI * 2;
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(md.radius, 0.12), 14, 14),
      new THREE.MeshStandardMaterial({ color: md.color, roughness: 0.88 })
    );
    moonMesh.visible = false;
    scene.add(moonMesh);
    const mo = {
      mesh: moonMesh,
      data: md,
      angle: startAngle,
      speed: md.orbitSpeed * 0.015,
      parent: p,
      labelEl: null,
    };
    p.moons.push(mo);
    allMoons.push(mo);
  });
});

// -- Hover ring
export const hoverRing = new THREE.Mesh(
  new THREE.RingGeometry(1.1, 1.45, 48),
  new THREE.MeshBasicMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
hoverRing.rotation.x = Math.PI / 2;
hoverRing.visible = false;
scene.add(hoverRing);
