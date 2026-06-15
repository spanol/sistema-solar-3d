import * as THREE from 'three';
import allBodies from './data/planets.json';

const sunData = allBodies.find(b => b.isStar);
const planetBodies = allBodies.filter(b => !b.isStar);

// ── Renderer ─────────────────────────────────────────────────────
const canvas = document.getElementById('solar-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// ── Scene ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();

// ── Camera ────────────────────────────────────────────────────────
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

// ── Lights ────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x0a0a1e, 1.2));
scene.add(new THREE.HemisphereLight(0x223366, 0x000814, 0.6));
const sunLight = new THREE.PointLight(0xfff5e0, 4.5, 700);
scene.add(sunLight);

// ── Stars ─────────────────────────────────────────────────────────
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

// ── Sun ───────────────────────────────────────────────────────────
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffee44 })
);
scene.add(sunMesh);

// Glow layers (innermost → outermost)
[
  { r: 5.8, color: 0xffaa00, opacity: 0.18 },
  { r: 7.5, color: 0xff6600, opacity: 0.08 },
  { r: 10.5, color: 0xff4400, opacity: 0.04 },
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

// ── Planets ───────────────────────────────────────────────────────
const planets = planetBodies.map((data, i) => {
  const startAngle = (i / planetBodies.length) * Math.PI * 2;
  const vr = Math.max(data.radius * 1.5, 0.65);

  const orbitMesh = new THREE.Mesh(
    new THREE.RingGeometry(data.orbitRadius - 0.1, data.orbitRadius + 0.1, 128),
    new THREE.MeshBasicMaterial({ color: 0x1e3050, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  orbitMesh.rotation.x = Math.PI / 2;
  scene.add(orbitMesh);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(vr, 32, 32),
    new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.7, metalness: 0.0 })
  );
  mesh.position.set(Math.cos(startAngle) * data.orbitRadius, 0, Math.sin(startAngle) * data.orbitRadius);
  scene.add(mesh);

  if (data.hasRings) {
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(vr * 1.6, vr * 2.8, 64),
      new THREE.MeshBasicMaterial({ color: 0xcab96a, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    ringMesh.rotation.x = Math.PI / 3;
    mesh.add(ringMesh);
  }

  return { mesh, orbitMesh, data, angle: startAngle, speed: data.orbitSpeed * 0.007, vr };
});

const meshList = planets.map(p => p.mesh);

// ── Planet Labels ─────────────────────────────────────────────────
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

// ── Hint ──────────────────────────────────────────────────────────
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

// ── State ─────────────────────────────────────────────────────────
let viewMode = 'top';
let activePlanet = null;
let showOrbits = true;
let showLabels = true;
let timeSpeed = 1;

// ── Card DOM ──────────────────────────────────────────────────────
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

// ── Calculator DOM ────────────────────────────────────────────────
const calcSection      = document.getElementById('card-calculators');
const calcWeightBlock  = document.getElementById('calc-weight-block');
const calcAgeBlock     = document.getElementById('calc-age-block');
const calcTravelBlock  = document.getElementById('calc-travel-block');
const calcWeightInput  = document.getElementById('calc-weight-input');
const calcWeightResult = document.getElementById('calc-weight-result');
const calcBirthInput   = document.getElementById('calc-birth-input');
const calcAgeResult    = document.getElementById('calc-age-result');
const calcTravelResult = document.getElementById('calc-travel-result');

// ── Calculadoras interativas ──────────────────────────────────────
const PROBE_SPEED_KMH = 58000;
let currentCardData = null;

function formatTravelTime(distMkm) {
  const hours = (distMkm * 1e6) / PROBE_SPEED_KMH;
  const days  = hours / 24;
  if (days < 1)   return `~${Math.round(hours)} horas`;
  if (days < 730) return `~${Math.round(days)} dias`;
  const years = days / 365.25;
  return `~${years.toFixed(1)} anos`;
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

// ── View controls ─────────────────────────────────────────────────
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

// ── Camera animation ──────────────────────────────────────────────
// tgtUp must be set on cam directly before calling this.
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

// ── Selection / back ──────────────────────────────────────────────
function selectPlanet(p) {
  activePlanet = p;
  viewMode = 'front';
  hideCard();
  viewControls.classList.add('hidden');

  const { x, z } = p.mesh.position;
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

// ── Sequential navigation ─────────────────────────────────────────
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

// ── Raycaster ─────────────────────────────────────────────────────
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
    const hits = raycaster.intersectObjects(meshList, true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj.parent && !meshList.includes(obj)) obj = obj.parent;
      const p = planets.find(q => q.mesh === obj);
      if (p) { selectPlanet(p); return; }
    }
    if (raycaster.intersectObject(sunMesh).length) {
      showCard(sunData);
    }
  }
}

canvas.addEventListener('click', e => trySelect(e.clientX, e.clientY));

canvas.addEventListener('mousemove', e => {
  if (cam.animating) { canvas.style.cursor = 'default'; return; }
  setPointer(e.clientX, e.clientY);
  raycaster.setFromCamera(pointer, camera);
  const hit = viewMode === 'top' &&
    (raycaster.intersectObjects(meshList, true).length || raycaster.intersectObject(sunMesh).length);
  canvas.style.cursor = hit ? 'pointer' : 'default';
});

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  trySelect(t.clientX, t.clientY);
}, { passive: false });

// ── Resize ────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Labels update ─────────────────────────────────────────────────
function updateLabels() {
  const visible = viewMode === 'top' && !cam.animating && showLabels;
  labels.forEach((el, i) => {
    el.style.opacity = visible ? '1' : '0';
    if (!visible) return;
    const v = planets[i].mesh.position.clone().project(camera);
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top  = `${(-v.y * 0.5 + 0.5) * window.innerHeight + 14}px`;
    el.style.transform = 'translateX(-50%)';
  });
}

// ── Animation loop ────────────────────────────────────────────────
const clock = new THREE.Clock();

(function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  const mult = viewMode === 'top' ? timeSpeed : 0.06;
  planets.forEach(p => {
    p.angle += p.speed * dt * 60 * mult;
    p.mesh.position.x = Math.cos(p.angle) * p.data.orbitRadius;
    p.mesh.position.z = Math.sin(p.angle) * p.data.orbitRadius;
    p.mesh.rotation.y += dt * 0.2;
  });

  if (cam.animating) {
    tickCamera(dt);
  } else if (viewMode === 'front' && activePlanet) {
    cam.lookAt.lerp(activePlanet.mesh.position, 0.04);
    camera.lookAt(cam.lookAt);
  } else {
    camera.lookAt(cam.lookAt);
  }

  sunMesh.material.color.setHSL(0.12, 1, 0.5 + Math.sin(elapsed * 2) * 0.04);
  updateLabels();
  renderer.render(scene, camera);
})();
