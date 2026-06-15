import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import allBodies from './data/planets.json';

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

// -- Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

const cam = {
  pos:       new THREE.Vector3(0, 110, 0),
  lookAt:    new THREE.Vector3(0, 0, 0),
  up:        new THREE.Vector3(0, 0, -1),
  tgtPos:    new THREE.Vector3(0, 110, 0),
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

// -- Stars
function makeStars(count, spread, size, color) {
  const v = new Float32Array(count * 3);
  for (let i = 0; i < v.length; i++) v[i] = (Math.random() - 0.5) * spread;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true }));
}
scene.add(makeStars(5000, 1800, 0.32, 0xffffff));
scene.add(makeStars(600,  1800, 0.85, 0xd0e8ff));
scene.add(makeStars(120,  1600, 1.4,  0xfff0cc));

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

// -- Asteroid Belt (procedural Points between Mars r=21 and Jupiter r=30)
(function buildAsteroidBelt() {
  const count = 2000;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 22.5 + Math.random() * 5.0;
    pos[i * 3]     = Math.cos(angle) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
    pos[i * 3 + 2] = Math.sin(angle) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x998877,
    size: 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
  })));
})();

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
});

btnLabels.addEventListener('click', () => {
  showLabels = !showLabels;
  btnLabels.classList.toggle('active', showLabels);
  btnLabels.setAttribute('aria-pressed', showLabels);
});

btnRotation.addEventListener('click', () => {
  timeSpeed = timeSpeed > 0 ? 0 : 1;
  const running = timeSpeed > 0;
  btnRotation.classList.toggle('active', running);
  btnRotation.setAttribute('aria-pressed', running);
  btnRotation.textContent = running ? '▶ Rotação' : '⏸ Rotação';
});

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

  hint.style.opacity = '0';
  card.classList.remove('hidden');
}

function hideCard() {
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

// -- Selection / back
function selectPlanet(p) {
  activePlanet = p;
  viewMode = 'front';
  hideCard();
  hoveredPlanet = null;
  viewControls.classList.add('hidden');

  const { x, z } = p.group.position;
  const or = p.data.orbitRadius;
  const camDist = p.vr * 8 + 10;
  const camPos = new THREE.Vector3(x + (x / or) * camDist, 3, z + (z / or) * camDist);

  cam.tgtUp.set(0, 1, 0);
  moveCameraTo(camPos, new THREE.Vector3(x, 0, z), () => showCard(p.data));
}

function backToTop() {
  hideCard();
  activePlanet = null;
  viewMode = 'top';
  hint.style.opacity = '1';
  viewControls.classList.remove('hidden');

  cam.tgtUp.set(0, 0, -1);
  moveCameraTo(new THREE.Vector3(0, 110, 0), new THREE.Vector3(0, 0, 0));
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

document.addEventListener('keydown', e => {
  if (viewMode === 'front') {
    if (e.key === 'ArrowLeft')  navigatePlanet(-1);
    if (e.key === 'ArrowRight') navigatePlanet(1);
    if (e.key === 'Escape')     backToTop();
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
  const t = e.changedTouches[0];
  trySelect(t.clientX, t.clientY);
}, { passive: false });

// -- Post-processing bloom (skipped on mobile to preserve FPS)
const isMobile = navigator.maxTouchPoints > 0 && window.innerWidth < 768;
let composer = null;

if (!isMobile) {
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.50,  // strength
    0.50,  // radius
    0.78   // threshold — sun luminance ~0.89 exceeds this
  );
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// -- Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
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

// -- Animation loop
const clock = new THREE.Clock();

(function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  const mult = viewMode === 'top' ? timeSpeed : 0.06;
  planets.forEach(p => {
    p.angle += p.speed * dt * 60 * mult;
    p.group.position.x = Math.cos(p.angle) * p.data.orbitRadius;
    p.group.position.z = Math.sin(p.angle) * p.data.orbitRadius;
    p.mesh.rotation.y += dt * 0.2;  // spins around tiltGroup's tilted local Y
  });

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
    cam.lookAt.lerp(activePlanet.group.position, 0.04);
    camera.lookAt(cam.lookAt);
  } else {
    camera.lookAt(cam.lookAt);
  }

  if (sunTextureLoaded) {
    // subtle warm pulse on texture
    sunMesh.material.color.setHSL(0.10, 0.35, 0.90 + Math.sin(elapsed * 2) * 0.06);
  } else {
    sunMesh.material.color.setHSL(0.12, 1, 0.5 + Math.sin(elapsed * 2) * 0.04);
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

  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
})();
