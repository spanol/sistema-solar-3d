import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import allBodies from './data/planets.json';
import * as Astronomy from 'astronomy-engine';

const sunData = allBodies.find(b => b.isStar);
const planetBodies = allBodies.filter(b => !b.isStar);

// -- Renderer
const canvas = document.getElementById('solar-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

// -- Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020408);

// -- Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

const cam = {
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

// -- Lights
scene.add(new THREE.AmbientLight(0x111133, 2.0));
scene.add(new THREE.HemisphereLight(0x223366, 0x000814, 0.8));
const sunLight = new THREE.PointLight(0xfff5e0, 2.5, 0, 0);
scene.add(sunLight);
// fill light follows camera in front view (camera sits on the dark side of the planet)
const fillLight = new THREE.PointLight(0xfff8f0, 0, 0, 0);
scene.add(fillLight);

// -- Space background: dark navy with galactic band + nebula patches
(function makeSpaceBackground() {
  const W = 2048, H = 1024;
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = W; bgCanvas.height = H;
  const ctx = bgCanvas.getContext('2d');

  ctx.fillStyle = '#010209';
  ctx.fillRect(0, 0, W, H);

  // Galactic band — two overlapping horizontal gradients
  [
    { spread: 0.28, alpha: 0.20, rgb: [18, 10, 42] },
    { spread: 0.12, alpha: 0.14, rgb: [30, 18, 60] },
  ].forEach(({ spread, alpha, rgb }) => {
    const g = ctx.createLinearGradient(0, H * (0.5 - spread), 0, H * (0.5 + spread));
    g.addColorStop(0,   'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });

  // Subtle nebula patches
  [
    [0.18, 0.42, 140, 'rgba(25,8,55,0.11)'],
    [0.68, 0.58, 110, 'rgba(8,22,50,0.09)'],
    [0.44, 0.35, 160, 'rgba(12,6,38,0.08)'],
  ].forEach(([fx, fy, r, c]) => {
    const grd = ctx.createRadialGradient(fx*W, fy*H, 0, fx*W, fy*H, r);
    grd.addColorStop(0, c);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  });

  const tex = new THREE.CanvasTexture(bgCanvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
})();

// -- Stars on a spherical shell (900–1200 units) — safely outside the solar system
const starSpriteTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,    'rgba(255,255,255,1.0)');
  g.addColorStop(0.20, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1,    'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function makeStars(count, minR, maxR, size, color) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = minR + Math.random() * (maxR - minR);
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color, size, sizeAttenuation: true,
    map: starSpriteTex,
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
}

// Star layers on shell 900–1200 — white, blue-white, warm yellow
const starGroups = [
  makeStars(4000, 900, 1200, 0.48, 0xffffff),
  makeStars(1200, 900, 1200, 0.30, 0xffffff),
  makeStars(600,  900, 1200, 0.78, 0xc8dcff),
  makeStars(280,  900, 1200, 0.62, 0xfff5cc),
  makeStars(100,  900, 1200, 1.10, 0xffcc88),
];
starGroups.forEach(g => scene.add(g));

// -- Texture loader
const textureLoader = new THREE.TextureLoader();

const PLANET_TEXTURES = {
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
let sunTextureLoaded = false;
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffee44 })
);
scene.add(sunMesh);

textureLoader.load(PLANET_TEXTURES.sol, (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  sunMesh.material.map = tex;
  sunMesh.material.color.set(0xffffff);
  sunMesh.material.needsUpdate = true;
  sunTextureLoaded = true;
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
    transparent: true,
    opacity: 0.75,
  }));
}

const asteroidBeltCompressed = makeAsteroidBelt(22.5, 27.5);
// Real-scale belt: 2.2–3.2 AU at 16 units/AU
const asteroidBeltReal = makeAsteroidBelt(35.2, 51.2);
asteroidBeltReal.material.opacity = 0;
scene.add(asteroidBeltCompressed);
scene.add(asteroidBeltReal);

// -- Planets
const planets = planetBodies.map((data, i) => {
  const startAngle = (i / planetBodies.length) * Math.PI * 2;
  const vr = Math.max(data.radius * 1.5, 0.65);
  const tiltRad = THREE.MathUtils.degToRad(data.axialTilt || 0);

  const orbitMesh = new THREE.Mesh(
    new THREE.RingGeometry(data.orbitRadius - 0.1, data.orbitRadius + 0.1, 128),
    new THREE.MeshBasicMaterial({ color: 0x1e3050, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  orbitMesh.rotation.x = Math.PI / 2;
  scene.add(orbitMesh);

  // Orbit group: moves around the sun, holds tiltGroup at origin
  const group = new THREE.Group();
  group.position.set(Math.cos(startAngle) * data.orbitRadius, 0, Math.sin(startAngle) * data.orbitRadius);
  scene.add(group);

  // Tilt group: applies axial tilt via Z rotation; does not spin
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

  // Ring as sibling of planet mesh inside tiltGroup so it stays in the equatorial plane
  // while the planet sphere spins independently
  let ringMesh = null;
  if (data.hasRings) {
    ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(vr * 1.6, vr * 2.8, 64),
      new THREE.MeshBasicMaterial({
        color: 0xd4b87a,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;  // equatorial plane; parent tiltGroup provides the visual tilt
    tiltGroup.add(ringMesh);

    textureLoader.load('/textures/2k_saturn_ring_alpha.png', (tex) => {
      ringMesh.material.alphaMap = tex;
      ringMesh.material.needsUpdate = true;
    });
  }

  return { mesh, ringMesh, group, orbitMesh, data, angle: startAngle, speed: data.orbitSpeed * 0.007, vr };
});

const meshList = planets.map(p => p.mesh);
// clickTargets includes rings so clicking Saturn's ring also selects the planet
const clickTargets = planets.flatMap(p => p.ringMesh ? [p.mesh, p.ringMesh] : [p.mesh]);

// -- Real-scale orbit radii: 1 AU = 16 scene units (Earth compressed orbit at 149.6 Mkm)
const SCENE_UNITS_PER_MKM = 16 / 149.6;
planets.forEach(p => {
  p.realOrbitRadius    = p.data.distanceFromSunMkm * SCENE_UNITS_PER_MKM;
  p.currentOrbitRadius = p.data.orbitRadius;
  p.targetOrbitRadius  = p.data.orbitRadius;
});

const TOP_CAM_COMPRESSED = new THREE.Vector3(0, 130, 32);
const TOP_CAM_REAL       = new THREE.Vector3(0, 560, 32);

// -- Moons
const allMoons = [];
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

// -- Hover ring (flat in XZ plane; scaled per hovered planet each frame)
const hoverRing = new THREE.Mesh(
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

// -- Planet Labels
const labelWrap = document.createElement('div');
Object.assign(labelWrap.style, {
  position: 'absolute', top: '0', left: '0',
  width: '100%', height: '100%',
  pointerEvents: 'none', overflow: 'hidden',
});
document.getElementById('app').appendChild(labelWrap);

const labels = planets.map(p => {
  const el = document.createElement('div');
  el.textContent = p.data.name;
  Object.assign(el.style, {
    position: 'absolute', color: 'rgba(180,220,255,0.9)',
    fontSize: '11px', fontFamily: "'Segoe UI', system-ui, sans-serif",
    pointerEvents: 'none', whiteSpace: 'nowrap',
    textShadow: '0 1px 4px rgba(0,0,0,0.9)', transition: 'opacity 0.4s',
  });
  labelWrap.appendChild(el);
  return el;
});

// Moon name labels (visible only in front view of the parent planet)
allMoons.forEach(m => {
  const el = document.createElement('div');
  el.textContent = m.data.name;
  Object.assign(el.style, {
    position: 'absolute',
    color: 'rgba(200,230,255,0.72)',
    fontSize: '9px',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    textShadow: '0 1px 3px rgba(0,0,0,0.95)',
    opacity: '0',
    transition: 'opacity 0.5s',
  });
  labelWrap.appendChild(el);
  m.labelEl = el;
});

// -- Hint
const hint = document.createElement('div');
hint.textContent = 'Clique ou toque em um planeta para explorar';
Object.assign(hint.style, {
  position: 'absolute', bottom: '1.5rem', left: '50%',
  transform: 'translateX(-50%)',
  color: 'rgba(160,200,255,0.5)', fontSize: '13px',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  pointerEvents: 'none', transition: 'opacity 0.5s',
  whiteSpace: 'nowrap',
});
document.getElementById('app').appendChild(hint);

// -- State
let viewMode = 'top';
let activePlanet = null;
let hoveredPlanet = null;
let showOrbits = true;
let showLabels = true;
let timeSpeed = 1;
let realScale      = false;
let realScaleLerpT = 0;

// -- Device detection + quality state
const isMobile = navigator.maxTouchPoints > 0 && window.innerWidth < 768;
let qualityPixelRatio = isMobile ? 0.75 : 1.0;
let bloomEnabled = !isMobile;
let starDensity = isMobile ? 'low' : 'high';
let composer = null;

function applyQualityPixelRatio(scale) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function applyStarDensity(density) {
  if (density === 'low') {
    starGroups.forEach((g, i) => { g.visible = i === 0; });
  } else if (density === 'medium') {
    starGroups.forEach((g, i) => { g.visible = i <= 2; });
  } else {
    starGroups.forEach(g => { g.visible = true; });
  }
}

// -- Astronomy / Modo Hoje
const ASTRO_BODY = {
  mercury: 'Mercury',
  venus:   'Venus',
  earth:   'Earth',
  mars:    'Mars',
  jupiter: 'Jupiter',
  saturn:  'Saturn',
  uranus:  'Uranus',
  neptune: 'Neptune',
};

function helioLonRad(bodyName, date) {
  return Astronomy.EclipticLongitude(bodyName, date) * Math.PI / 180;
}

function setPlanetsToDate(date) {
  planets.forEach(p => {
    const body = ASTRO_BODY[p.data.id];
    if (!body) return;
    p.angle = helioLonRad(body, date);
    p.group.position.x = Math.cos(p.angle) * p.currentOrbitRadius;
    p.group.position.z = Math.sin(p.angle) * p.currentOrbitRadius;
  });
}

function isMarsRetrograde(date) {
  const dt1 = new Date(date.getTime() + 86400000);
  function geoLon(d) {
    const gv = Astronomy.GeoVector('Mars', d, false);
    const ec = Astronomy.Ecliptic(gv);
    return ec.elon;
  }
  const lon0 = geoLon(date);
  const lon1 = geoLon(dt1);
  let delta = lon1 - lon0;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta < 0;
}

// -- URL hash deep-link
function parseHash() {
  const h = location.hash.slice(1);
  if (!h) return {};
  return Object.fromEntries(
    h.split('&').filter(Boolean).map(p => {
      const eq = p.indexOf('=');
      return eq === -1 ? [p, ''] : [p.slice(0, eq), decodeURIComponent(p.slice(eq + 1))];
    })
  );
}

function serializeHash() {
  const parts = [];
  if (activePlanet) parts.push(`planet=${activePlanet.data.id}`);
  parts.push(`orbits=${showOrbits ? 1 : 0}`);
  parts.push(`labels=${showLabels ? 1 : 0}`);
  parts.push(`speed=${timeSpeed}`);
  if (realScale) parts.push('realscale=1');
  const dp = document.getElementById('date-picker');
  if (dp && dp.value) parts.push(`date=${encodeURIComponent(dp.value)}`);
  return '#' + parts.join('&');
}

function updateHash() {
  history.replaceState(null, '', serializeHash());
}

function restoreFromHash() {
  const params = parseHash();
  if (!Object.keys(params).length) return;

  if ('orbits' in params) {
    showOrbits = params.orbits !== '0';
    btnOrbits.classList.toggle('active', showOrbits);
    btnOrbits.setAttribute('aria-pressed', String(showOrbits));
    planets.forEach(p => { p.orbitMesh.visible = showOrbits; });
  }

  if ('labels' in params) {
    showLabels = params.labels !== '0';
    btnLabels.classList.toggle('active', showLabels);
    btnLabels.setAttribute('aria-pressed', String(showLabels));
  }

  if ('speed' in params) {
    const s = parseFloat(params.speed);
    if (isFinite(s)) {
      timeSpeed = s;
      const running = timeSpeed > 0;
      btnRotation.classList.toggle('active', running);
      btnRotation.setAttribute('aria-pressed', String(running));
      btnRotation.textContent = running ? '▶ Rotação' : '⏸ Rotação';
    }
  }

  if (params.realscale && params.realscale !== '0') {
    realScale = true;
    btnRealScale.classList.add('active');
    btnRealScale.setAttribute('aria-pressed', 'true');
    planets.forEach(p => {
      p.currentOrbitRadius = p.realOrbitRadius;
      p.targetOrbitRadius  = p.realOrbitRadius;
    });
    cam.pos.copy(TOP_CAM_REAL);
    cam.tgtPos.copy(TOP_CAM_REAL);
    camera.position.copy(cam.pos);
    camera.lookAt(cam.lookAt);
  }

  if (params.planet) {
    const p = planets.find(pl => pl.data.id === params.planet);
    if (p) selectPlanet(p);
  }

  if (params.date) {
    const dp = document.getElementById('date-picker');
    if (dp) {
      dp.value = params.date;
      applyDatePicker(params.date);
    }
  }
}

// -- Card DOM
const card         = document.getElementById('planet-card');
const cardName     = document.getElementById('card-name');
const cardDesc     = document.getElementById('card-description');
const cardDiameter = document.getElementById('card-diameter');
const cardDistRow  = document.getElementById('card-distance-row');
const cardDistance = document.getElementById('card-distance');
const cardDay      = document.getElementById('card-day');
const cardYear     = document.getElementById('card-year');
const cardFacts    = document.getElementById('card-facts');
const cardNav      = document.getElementById('card-nav');
const cardPrev     = document.getElementById('card-prev');
const cardNext     = document.getElementById('card-next');
document.getElementById('card-close').addEventListener('click', backToTop);

const btnCopyLink = document.getElementById('card-copy-link');
let copyResetTimer = null;
btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    btnCopyLink.textContent = '✓ Copiado!';
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => { btnCopyLink.textContent = '🔗 Copiar link'; }, 2000);
  });
});

// -- Calculator DOM
const calcSection      = document.getElementById('card-calculators');
const calcWeightBlock  = document.getElementById('calc-weight-block');
const calcAgeBlock     = document.getElementById('calc-age-block');
const calcTravelBlock  = document.getElementById('calc-travel-block');
const calcWeightInput  = document.getElementById('calc-weight-input');
const calcWeightResult = document.getElementById('calc-weight-result');
const calcBirthInput   = document.getElementById('calc-birth-input');
const calcAgeResult    = document.getElementById('calc-age-result');
const calcTravelResult = document.getElementById('calc-travel-result');

// -- Interactive calculators
const PROBE_SPEED_KMH = 58000;
let currentCardData = null;

function formatTravelTime(distMkm) {
  const hours = (distMkm * 1e6) / PROBE_SPEED_KMH;
  const days  = hours / 24;
  if (days < 1)   return `~${Math.round(hours)} horas`;
  if (days < 730) return `~${Math.round(days)} dias`;
  return `~${(days / 365.25).toFixed(1)} anos`;
}

function calcWeight() {
  const kg = parseFloat(calcWeightInput.value);
  if (!currentCardData || !isFinite(kg) || kg <= 0) { calcWeightResult.textContent = '—'; return; }
  const gf = currentCardData.gravityFactor;
  if (!gf) { calcWeightResult.textContent = '—'; return; }
  calcWeightResult.textContent = (kg * gf).toFixed(1) + ' kg';
}

function calcAge() {
  const yld = currentCardData && currentCardData.yearLengthDays;
  if (!yld) { calcAgeResult.textContent = '—'; return; }
  const val = calcBirthInput.value;
  if (!val) { calcAgeResult.textContent = '—'; return; }
  const ageMs = Date.now() - new Date(val).getTime();
  if (ageMs < 0) { calcAgeResult.textContent = '—'; return; }
  const planetYears = (ageMs / 86400000) / yld;
  calcAgeResult.textContent = planetYears >= 10
    ? `${Math.round(planetYears)} anos`
    : planetYears >= 1
    ? `${planetYears.toFixed(1)} anos`
    : `${planetYears.toFixed(2)} anos`;
}

calcWeightInput.addEventListener('input', calcWeight);
calcBirthInput.addEventListener('change', calcAge);

// -- Size comparison widget
const compareSelect = document.getElementById('compare-select');
const compareNameA  = document.getElementById('compare-name-a');
const compareDiamA  = document.getElementById('compare-diam-a');
const compareNameB  = document.getElementById('compare-name-b');
const compareDiamB  = document.getElementById('compare-diam-b');

let cmpRenderer = null, cmpScene = null, cmpCamera = null;
let cmpMeshA = null, cmpMeshB = null;
let cmpAnimId = null;

function ensureCompareRenderer() {
  if (cmpRenderer) return;
  const cmpCanvas = document.getElementById('compare-canvas');
  const W = cmpCanvas.offsetWidth  || 272;
  const H = cmpCanvas.offsetHeight || 110;

  cmpRenderer = new THREE.WebGLRenderer({ canvas: cmpCanvas, antialias: true, alpha: true });
  cmpRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  cmpRenderer.setSize(W, H, false); // false = don't override CSS width/height
  cmpRenderer.outputColorSpace = THREE.SRGBColorSpace;

  cmpScene  = new THREE.Scene();
  cmpCamera = new THREE.PerspectiveCamera(40, W / H, 0.1, 300);
  cmpCamera.position.set(0, 0, 15);

  cmpScene.add(new THREE.AmbientLight(0x334466, 3.5));
  const dLight = new THREE.DirectionalLight(0xfff8f0, 3);
  dLight.position.set(3, 4, 5);
  cmpScene.add(dLight);

  const geo = new THREE.SphereGeometry(1, 28, 28);
  cmpMeshA = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0 }));
  cmpMeshB = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 28), new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0 }));
  cmpScene.add(cmpMeshA);
  cmpScene.add(cmpMeshB);
}

function renderComparison(dataA, dataB) {
  ensureCompareRenderer();

  const dA = dataA.diameterKm;
  const dB = dataB.diameterKm;
  const maxD = Math.max(dA, dB);
  const MAX_R = 2.0;
  const GAP   = 0.55;

  const rA = (dA / maxD) * MAX_R;
  const rB = (dB / maxD) * MAX_R;

  cmpMeshA.scale.setScalar(rA);
  cmpMeshB.scale.setScalar(rB);
  cmpMeshA.material.color.set(dataA.color || '#8899aa');
  cmpMeshB.material.color.set(dataB.color || '#8899aa');

  // Place spheres so their combined bounding box is centered at x=0
  // A right edge → -GAP/2 ; B left edge → +GAP/2
  cmpMeshA.position.set(-(rB + GAP / 2), 0, 0);
  cmpMeshB.position.set(  rA + GAP / 2,  0, 0);

  // Frame camera to fit both spheres with padding
  const halfH = rA + rB + GAP / 2;
  const halfV = Math.max(rA, rB);
  const vFovHalf = (cmpCamera.fov / 2) * Math.PI / 180;
  const aspect = cmpCamera.aspect;
  const camZH  = (halfH * 1.22) / (Math.tan(vFovHalf) * aspect);
  const camZV  = (halfV * 1.45) / Math.tan(vFovHalf);
  cmpCamera.position.z = Math.max(camZH, camZV, 5);

  // Update footer labels
  compareNameA.textContent = dataA.name;
  compareDiamA.textContent = dA.toLocaleString('pt-BR') + ' km';
  compareNameB.textContent = dataB.name;
  compareDiamB.textContent = dB.toLocaleString('pt-BR') + ' km';

  // Kick off slow-rotation animation loop
  if (cmpAnimId) cancelAnimationFrame(cmpAnimId);
  let lastT = null;
  function cmpLoop(t) {
    const dt = lastT === null ? 0 : (t - lastT) / 1000;
    lastT = t;
    cmpMeshA.rotation.y += dt * 0.40;
    cmpMeshB.rotation.y += dt * 0.40;
    cmpRenderer.render(cmpScene, cmpCamera);
    cmpAnimId = requestAnimationFrame(cmpLoop);
  }
  cmpAnimId = requestAnimationFrame(cmpLoop);
}

function stopCompareAnim() {
  if (cmpAnimId) { cancelAnimationFrame(cmpAnimId); cmpAnimId = null; }
}

function openCompare(cardData) {
  // Populate dropdown with every body except the current one
  compareSelect.innerHTML = '';
  allBodies.forEach(b => {
    if (b.id === cardData.id) return;
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    // Default to Earth if available; otherwise keep first option
    if (b.id === 'earth') opt.selected = true;
    compareSelect.appendChild(opt);
  });
  // If earth was excluded (current planet IS earth), first option is selected by default
  const compareData = allBodies.find(b => b.id === compareSelect.value);
  if (compareData) renderComparison(cardData, compareData);
}

compareSelect.addEventListener('change', () => {
  if (!currentCardData) return;
  const compareData = allBodies.find(b => b.id === compareSelect.value);
  if (compareData) renderComparison(currentCardData, compareData);
});

// -- View controls
const viewControls = document.getElementById('view-controls');
const btnOrbits    = document.getElementById('ctrl-orbits');
const btnLabels    = document.getElementById('ctrl-labels');
const btnRotation  = document.getElementById('ctrl-rotation');

btnOrbits.addEventListener('click', () => {
  showOrbits = !showOrbits;
  btnOrbits.classList.toggle('active', showOrbits);
  btnOrbits.setAttribute('aria-pressed', showOrbits);
  planets.forEach(p => { p.orbitMesh.visible = showOrbits; });
  updateHash();
});

btnLabels.addEventListener('click', () => {
  showLabels = !showLabels;
  btnLabels.classList.toggle('active', showLabels);
  btnLabels.setAttribute('aria-pressed', showLabels);
  updateHash();
});

function toggleRotation() {
  timeSpeed = timeSpeed > 0 ? 0 : 1;
  const running = timeSpeed > 0;
  btnRotation.classList.toggle('active', running);
  btnRotation.setAttribute('aria-pressed', running);
  btnRotation.textContent = running ? '▶ Rotação' : '⏸ Rotação';
  updateHash();
}
btnRotation.addEventListener('click', toggleRotation);

const btnRealScale = document.getElementById('ctrl-real-scale');
btnRealScale.addEventListener('click', () => {
  if (viewMode !== 'top' || cam.animating) return;
  realScale = !realScale;
  btnRealScale.classList.toggle('active', realScale);
  btnRealScale.setAttribute('aria-pressed', String(realScale));
  planets.forEach(p => {
    p.targetOrbitRadius = realScale ? p.realOrbitRadius : p.data.orbitRadius;
  });
  cam.tgtUp.set(0, 0, -1);
  moveCameraTo(
    (realScale ? TOP_CAM_REAL : TOP_CAM_COMPRESSED).clone(),
    new THREE.Vector3(0, 0, 0)
  );
  updateHash();
});

// -- Date controls
const dateControls     = document.getElementById('date-controls');
const datePicker       = document.getElementById('date-picker');
const btnHoje          = document.getElementById('btn-hoje');
const retrogradeBadge  = document.getElementById('retrograde-badge');

function todayStr() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function applyDatePicker(dateStr) {
  if (!dateStr) return;
  const date = new Date(dateStr + 'T12:00:00Z');
  if (isNaN(date.getTime())) return;
  setPlanetsToDate(date);
  const retrograde = isMarsRetrograde(date);
  retrogradeBadge.classList.toggle('hidden', !retrograde);
  updateHash();
}

datePicker.value = todayStr();
applyDatePicker(datePicker.value);

datePicker.addEventListener('change', () => {
  applyDatePicker(datePicker.value);
});

btnHoje.addEventListener('click', () => {
  datePicker.value = todayStr();
  applyDatePicker(datePicker.value);
});

// -- Quality panel
const btnQuality   = document.getElementById('btn-quality');
const qualityPanel = document.getElementById('quality-panel');

btnQuality.addEventListener('click', e => {
  e.stopPropagation();
  qualityPanel.classList.toggle('hidden');
});

document.addEventListener('click', e => {
  if (!qualityPanel.classList.contains('hidden') &&
      !qualityPanel.contains(e.target) && e.target !== btnQuality) {
    qualityPanel.classList.add('hidden');
  }
});

const qualityBloomBtn = document.getElementById('quality-bloom');
function syncBloomBtn() {
  qualityBloomBtn.textContent = bloomEnabled ? 'Ligado' : 'Desligado';
  qualityBloomBtn.classList.toggle('active', bloomEnabled);
  qualityBloomBtn.setAttribute('aria-pressed', String(bloomEnabled));
}
qualityBloomBtn.addEventListener('click', () => {
  bloomEnabled = !bloomEnabled;
  syncBloomBtn();
});
syncBloomBtn();

function syncSegmented(id, val) {
  document.querySelectorAll('#' + id + ' [data-val]').forEach(b => {
    b.classList.toggle('active', b.dataset.val === String(val));
  });
}

document.querySelectorAll('#quality-resolution [data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    qualityPixelRatio = parseFloat(btn.dataset.val);
    applyQualityPixelRatio(qualityPixelRatio);
    syncSegmented('quality-resolution', qualityPixelRatio);
  });
});
syncSegmented('quality-resolution', qualityPixelRatio);

document.querySelectorAll('#quality-stars [data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    starDensity = btn.dataset.val;
    applyStarDensity(starDensity);
    syncSegmented('quality-stars', starDensity);
  });
});
syncSegmented('quality-stars', starDensity);
function showCard(data) {
  currentCardData = data;
  cardName.textContent     = data.name;
  cardDesc.textContent     = data.description;
  cardDiameter.textContent = data.diameterKm.toLocaleString('pt-BR') + ' km';
  if (data.distanceFromSunMkm) {
    cardDistRow.style.display = '';
    cardDistance.textContent  = data.distanceFromSunMkm.toLocaleString('pt-BR') + ' M km';
  } else {
    cardDistRow.style.display = 'none';
  }
  cardDay.textContent  = data.dayLength;
  cardYear.textContent = data.yearLength;
  cardFacts.innerHTML  = data.facts.map(f => `<li>${f}</li>`).join('');
  cardNav.classList.toggle('hidden', !activePlanet);

  // Moons section
  let moonsSect = document.getElementById('card-moons-section');
  if (!moonsSect) {
    moonsSect = document.createElement('div');
    moonsSect.id = 'card-moons-section';
    moonsSect.style.marginBottom = '0.8rem';
    cardFacts.insertAdjacentElement('afterend', moonsSect);
  }
  if (data.moons && data.moons.length) {
    moonsSect.innerHTML = '<p class="card-section-label">Luas</p>' +
      `<div style="font-size:0.84rem;color:rgba(204,228,255,0.88);line-height:1.7">${data.moons.map(m => m.name).join(' · ')}</div>`;
    moonsSect.style.display = '';
  } else {
    moonsSect.style.display = 'none';
  }

  // Calculadoras
  const hasGravity = typeof data.gravityFactor === 'number';
  const hasYear    = typeof data.yearLengthDays === 'number';
  const hasDist    = data.distanceFromSunMkm > 0;
  calcSection.classList.toggle('hidden', !hasGravity && !hasYear && !hasDist);
  calcWeightBlock.style.display = hasGravity ? '' : 'none';
  calcAgeBlock.style.display    = hasYear    ? '' : 'none';
  calcTravelBlock.style.display = hasDist    ? '' : 'none';
  calcWeightResult.textContent  = '—';
  calcAgeResult.textContent     = '—';
  if (hasDist) calcTravelResult.textContent = formatTravelTime(data.distanceFromSunMkm);
  calcWeight();
  calcAge();

  openCompare(data);

  hint.style.opacity = '0';
  card.classList.remove('hidden');
}

function hideCard() {
  stopCompareAnim();
  card.classList.add('hidden');
}

// -- Camera animation (tgtUp must be set on cam before calling)
function moveCameraTo(toPos, toLookAt, onDone) {
  cam.tgtPos.copy(toPos);
  cam.tgtLookAt.copy(toLookAt);
  cam.animating = true;
  cam.onDone = onDone || null;
}

function tickCamera(dt) {
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

// Horizontal offset in world space so the planet sits in the right third of the screen
// (card panel occupies the left ~30% — we shift the lookAt leftward in camera space)
const frontViewLookAtOffset = new THREE.Vector3();

// -- Selection / back
function selectPlanet(p) {
  activePlanet = p;
  viewMode = 'front';
  updateHash();
  hideCard();
  hoveredPlanet = null;
  viewControls.classList.add('hidden');
  dateControls.classList.add('hidden');
  qualityPanel.classList.add('hidden');

  const { x, z } = p.group.position;
  const or = Math.sqrt(x * x + z * z) || p.data.orbitRadius;
  const camDist = p.vr * 8 + 10;

  // 3/4 elevation angle: camera sits ~27–33° above the planet's equator
  const elevation = p.vr * 3.5 + 8;

  // Camera is on the sun-side: nx,nz = unit vector from sun toward planet
  const nx = x / or, nz = z / or;

  const camPos = new THREE.Vector3(
    x - nx * camDist,
    elevation,
    z - nz * camDist,
  );

  // Camera left in XZ = (nz, 0, -nx) (90° CCW from forward when viewed from +Y)
  // Shift lookAt left so the planet projects onto the right third of the screen
  const isMobileLayout = window.innerWidth < 768;
  const shift = isMobileLayout ? 0 : camDist * 0.22;
  frontViewLookAtOffset.set(nz * shift, 0, -nx * shift);

  cam.tgtUp.set(0, 1, 0);
  moveCameraTo(camPos, new THREE.Vector3(x, 0, z).add(frontViewLookAtOffset), () => showCard(p.data));
}

function backToTop() {
  hideCard();
  activePlanet = null;
  viewMode = 'top';
  updateHash();
  hint.style.opacity = '1';
  viewControls.classList.remove('hidden');
  dateControls.classList.remove('hidden');

  cam.tgtUp.set(0, 0, -1);
  moveCameraTo((realScale ? TOP_CAM_REAL : TOP_CAM_COMPRESSED).clone(), new THREE.Vector3(0, 0, 0));
}

// -- Sequential navigation
function navigatePlanet(dir) {
  if (cam.animating || !activePlanet) return;
  const idx = planets.indexOf(activePlanet);
  if (idx === -1) return;
  selectPlanet(planets[(idx + dir + planets.length) % planets.length]);
}

cardPrev.addEventListener('click', () => navigatePlanet(-1));
cardNext.addEventListener('click', () => navigatePlanet(1));

// -- Shortcuts overlay
const shortcutsOverlay = document.getElementById('shortcuts-overlay');
const btnShortcuts     = document.getElementById('btn-shortcuts');

function toggleShortcuts() {
  shortcutsOverlay.classList.toggle('hidden');
}

btnShortcuts.addEventListener('click', toggleShortcuts);
shortcutsOverlay.addEventListener('click', e => {
  if (e.target === shortcutsOverlay) toggleShortcuts();
});

// -- Unified keyboard handler
document.addEventListener('keydown', e => {
  // Suppress browser native page zoom (Ctrl/⌘ + wheel, +/-/0)
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
    e.preventDefault();
    return;
  }

  // Don't capture shortcuts when the user is typing in a form field
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  switch (e.key) {
    case 'ArrowLeft':
      if (viewMode === 'front') navigatePlanet(-1);
      break;
    case 'ArrowRight':
      if (viewMode === 'front') navigatePlanet(1);
      break;
    case 'Escape':
      if (!shortcutsOverlay.classList.contains('hidden')) toggleShortcuts();
      else if (viewMode === 'front') backToTop();
      break;
    case ' ':
      e.preventDefault();
      toggleRotation();
      break;
    case '?':
      toggleShortcuts();
      break;
    default:
      if (e.key >= '1' && e.key <= '8' && !e.ctrlKey && !e.metaKey && !e.altKey && !cam.animating) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < planets.length) selectPlanet(planets[idx]);
      }
  }
});

// -- Raycaster
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setPointer(cx, cy) {
  const r = canvas.getBoundingClientRect();
  pointer.x =  ((cx - r.left) / r.width)  * 2 - 1;
  pointer.y = -((cy - r.top)  / r.height) * 2 + 1;
}

function trySelect(cx, cy) {
  if (cam.animating) return;
  setPointer(cx, cy);
  raycaster.setFromCamera(pointer, camera);

  if (viewMode === 'top') {
    const hits = raycaster.intersectObjects(clickTargets);
    if (hits.length) {
      const hitObj = hits[0].object;
      const p = planets.find(q => q.mesh === hitObj || q.ringMesh === hitObj);
      if (p) { selectPlanet(p); return; }
    }
    if (raycaster.intersectObject(sunMesh).length) {
      showCard(sunData);
    }
  }
}

canvas.addEventListener('click', e => trySelect(e.clientX, e.clientY));

canvas.addEventListener('mousemove', e => {
  if (cam.animating) {
    canvas.style.cursor = 'default';
    hoveredPlanet = null;
    return;
  }
  setPointer(e.clientX, e.clientY);
  raycaster.setFromCamera(pointer, camera);

  if (viewMode === 'top') {
    const hits = raycaster.intersectObjects(clickTargets);
    const sunHit = raycaster.intersectObject(sunMesh).length > 0;

    canvas.style.cursor = (hits.length || sunHit) ? 'pointer' : 'default';

    if (hits.length) {
      const hitObj = hits[0].object;
      hoveredPlanet = planets.find(q => q.mesh === hitObj || q.ringMesh === hitObj) || null;
    } else {
      hoveredPlanet = null;
    }
  } else {
    hoveredPlanet = null;
    canvas.style.cursor = 'default';
  }
});

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (e.changedTouches.length === 1 && !pinch.active) {
    const t = e.changedTouches[0];
    trySelect(t.clientX, t.clientY);
  }
  if (e.touches.length < 2) pinch.active = false;
}, { passive: false });

// -- Interactive zoom (replaces the browser's native zoom)
// Dollies the camera along its view direction, clamped to a sane range.
const ZOOM = { min: 14, max: 540, step: 0.0016 };

function applyZoom(deltaY) {
  if (cam.animating) return;
  const offset = cam.pos.clone().sub(cam.lookAt);
  let dist = offset.length();
  if (dist < 1e-3) return;
  dist *= Math.exp(deltaY * ZOOM.step);
  dist = Math.min(realScale ? 1400 : ZOOM.max, Math.max(ZOOM.min, dist));
  offset.setLength(dist);
  cam.pos.copy(cam.lookAt).add(offset);
  cam.tgtPos.copy(cam.pos);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.lookAt);
}

// Wheel over the canvas zooms the scene instead of scrolling/zooming the page.
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  applyZoom(e.deltaY);
}, { passive: false });

// Pinch-to-zoom on touch devices.
const pinch = { active: false, dist: 0 };
function touchDist(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.hypot(dx, dy);
}
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    pinch.active = true;
    pinch.dist = touchDist(e.touches);
  }
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const d = touchDist(e.touches);
    if (pinch.dist > 0) applyZoom((pinch.dist - d) * 1.4);
    pinch.dist = d;
  }
}, { passive: false });

// Suppress the browser's native page zoom (Ctrl/⌘ + wheel).
window.addEventListener('wheel', e => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

// -- Post-processing bloom (always created; bloomEnabled controls whether it renders)
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55,  // strength
  0.45,  // radius
  0.90   // threshold — sol HDR >1.0 (setRGB); planetas ficam abaixo com luma ~0.6-0.85
);
composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Apply initial quality presets
applyQualityPixelRatio(qualityPixelRatio);
applyStarDensity(starDensity);

// -- Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// -- Labels update
function updateLabels() {
  const visible = viewMode === 'top' && !cam.animating && showLabels;
  labels.forEach((el, i) => {
    el.style.opacity = visible ? '1' : '0';
    if (!visible) return;
    const v = planets[i].group.position.clone().project(camera);
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top  = `${(-v.y * 0.5 + 0.5) * window.innerHeight + 14}px`;
    el.style.transform = 'translateX(-50%)';
  });
}

// -- Restore state from URL hash on first load
restoreFromHash();

// -- Animation loop
const clock = new THREE.Clock();

(function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  const mult = viewMode === 'top' ? timeSpeed : 0.06;
  const orbitLerpK = Math.min(1, dt * 2.0);
  planets.forEach(p => {
    p.currentOrbitRadius = THREE.MathUtils.lerp(p.currentOrbitRadius, p.targetOrbitRadius, orbitLerpK);
    p.angle += p.speed * dt * 60 * mult;
    p.group.position.x = Math.cos(p.angle) * p.currentOrbitRadius;
    p.group.position.z = Math.sin(p.angle) * p.currentOrbitRadius;
    p.mesh.rotation.y += dt * 0.2;
    p.orbitMesh.scale.setScalar(p.currentOrbitRadius / p.data.orbitRadius);
  });

  // Asteroid belt cross-fade between compressed and real-scale positions
  realScaleLerpT = THREE.MathUtils.lerp(realScaleLerpT, realScale ? 1 : 0, orbitLerpK);
  asteroidBeltCompressed.material.opacity = 0.75 * (1 - realScaleLerpT);
  asteroidBeltReal.material.opacity       = 0.75 * realScaleLerpT;

  // Moon orbits – always accumulate, visible only in front view of parent
  const isFront = viewMode === 'front';
  allMoons.forEach(m => {
    const show = isFront && activePlanet === m.parent;
    m.mesh.visible = show;
    m.angle += m.speed * dt * 60 * 0.5;
    const pp = m.parent.group.position;
    m.mesh.position.set(
      pp.x + Math.cos(m.angle) * m.data.orbitRadius,
      pp.y,
      pp.z + Math.sin(m.angle) * m.data.orbitRadius
    );
    if (m.labelEl) {
      m.labelEl.style.opacity = show ? '1' : '0';
      if (show) {
        const v = m.mesh.position.clone().project(camera);
        m.labelEl.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
        m.labelEl.style.top  = `${(-v.y * 0.5 + 0.5) * window.innerHeight + 10}px`;
        m.labelEl.style.transform = 'translateX(-50%)';
      }
    }
  });

  if (cam.animating) {
    tickCamera(dt);
  } else if (viewMode === 'front' && activePlanet) {
    const targetLookAt = activePlanet.group.position.clone().add(frontViewLookAtOffset);
    cam.lookAt.lerp(targetLookAt, 0.04);
    camera.lookAt(cam.lookAt);
  } else {
    camera.lookAt(cam.lookAt);
  }

  // Subtle star twinkle — different phase per group keeps it natural
  starGroups.forEach((g, i) => {
    g.material.opacity = 0.78 + Math.sin(elapsed * (0.45 + i * 0.22) + i * 2.09) * 0.13;
  });

  if (sunTextureLoaded) {
    // HDR pulse: mantém luma acima do bloom threshold (0.90) para o sol sempre brilhar
    const p = 1.22 + Math.sin(elapsed * 2) * 0.08;
    sunMesh.material.color.setRGB(p, p * 0.88, p * 0.56);
  } else {
    const p = 1.35 + Math.sin(elapsed * 2) * 0.08;
    sunMesh.material.color.setRGB(p, p * 0.82, p * 0.20);
  }

  // Hover ring follows hovered planet with pulsing opacity
  if (viewMode === 'top' && hoveredPlanet && !cam.animating) {
    hoverRing.position.copy(hoveredPlanet.group.position);
    hoverRing.position.y = 0;
    hoverRing.scale.setScalar(hoveredPlanet.vr + 0.35);
    hoverRing.material.opacity = 0.45 + Math.sin(elapsed * 4) * 0.20;
    hoverRing.visible = true;
  } else {
    hoverRing.visible = false;
  }

  updateLabels();

  // fill light tracks camera so the planet face visible to the viewer stays lit
  if (viewMode === 'front') {
    fillLight.position.copy(camera.position);
    fillLight.intensity = 3.0;
  } else {
    fillLight.intensity = 0;
  }

  if (bloomEnabled) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
})();

