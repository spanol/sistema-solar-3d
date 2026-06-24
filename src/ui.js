import * as THREE from 'three';
import { camera, renderer, scene, composer } from './scene.js';
import { cam } from './camera.js';
import { state } from './state.js';
import { planets, allMoons, allBodies, asteroidBeltCompressed, asteroidBeltReal,
         kuiperBeltCompressed, kuiperBeltReal, TOP_CAM_COMPRESSED, TOP_CAM_REAL } from './planets.js';
import { comets } from './comets.js';
import { galaxyGroup, starGroups } from './background.js';
import { setPlanetsToDate, isMarsRetrograde } from './astronomy.js';
import { updateHash } from './hash.js';
import { moveCameraTo } from './camera.js';

// -- Callbacks injected by main.js to avoid circular imports
let _selectPlanet = null;
let _backToTop    = null;
let _navigatePlanet = null;

export function initUICallbacks({ selectPlanet, backToTop, navigatePlanet }) {
  _selectPlanet   = selectPlanet;
  _backToTop      = backToTop;
  _navigatePlanet = navigatePlanet;
  _wireStripClicks();
  _wireCardNav();
}

// -- Label wrap + planet labels
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

export function updateLabels() {
  const visible = state.viewMode === 'top' && !cam.animating && state.showLabels;
  labels.forEach((el, i) => {
    el.style.opacity = visible ? '1' : '0';
    if (!visible) return;
    const v = planets[i].group.position.clone().project(camera);
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top  = `${(-v.y * 0.5 + 0.5) * window.innerHeight + 14}px`;
    el.style.transform = 'translateX(-50%)';
  });
}

// -- Planet strip
const planetStrip = document.getElementById('planet-strip');
const stripBtns = planets.map(p => {
  const btn = document.createElement('button');
  btn.className = 'planet-strip-btn';
  btn.setAttribute('aria-label', p.data.name);
  const dot = document.createElement('span');
  dot.className = 'planet-strip-dot';
  dot.style.background = p.data.color;
  const name = document.createElement('span');
  name.className = 'planet-strip-name';
  name.textContent = p.data.name;
  btn.append(dot, name);
  planetStrip.appendChild(btn);
  return btn;
});

function _wireStripClicks() {
  stripBtns.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      if (!cam.animating && _selectPlanet) _selectPlanet(planets[i]);
    });
  });
}

export function updatePlanetStrip(active) {
  stripBtns.forEach((btn, i) => {
    btn.classList.toggle('active', planets[i] === active);
  });
}

// -- Hint
export const hint = document.createElement('div');
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

// -- Card DOM refs
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

document.getElementById('card-close').addEventListener('click', () => { if (_backToTop) _backToTop(); });

const btnCopyLink = document.getElementById('card-copy-link');
let copyResetTimer = null;
btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    btnCopyLink.textContent = '✓ Copiado!';
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => { btnCopyLink.textContent = '🔗 Copiar link'; }, 2000);
  });
});

function _wireCardNav() {
  cardPrev.addEventListener('click', () => { if (_navigatePlanet) _navigatePlanet(-1); });
  cardNext.addEventListener('click', () => { if (_navigatePlanet) _navigatePlanet(1); });
}

// -- Calculator DOM refs
const calcSection      = document.getElementById('card-calculators');
const calcWeightBlock  = document.getElementById('calc-weight-block');
const calcAgeBlock     = document.getElementById('calc-age-block');
const calcTravelBlock  = document.getElementById('calc-travel-block');
const calcWeightInput  = document.getElementById('calc-weight-input');
const calcWeightResult = document.getElementById('calc-weight-result');
const calcBirthInput   = document.getElementById('calc-birth-input');
const calcAgeResult    = document.getElementById('calc-age-result');
const calcTravelResult = document.getElementById('calc-travel-result');

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
  cmpRenderer.setSize(W, H, false);
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

  cmpMeshA.position.set(-(rB + GAP / 2), 0, 0);
  cmpMeshB.position.set(  rA + GAP / 2,  0, 0);

  const halfH = rA + rB + GAP / 2;
  const halfV = Math.max(rA, rB);
  const vFovHalf = (cmpCamera.fov / 2) * Math.PI / 180;
  const aspect = cmpCamera.aspect;
  const camZH  = (halfH * 1.22) / (Math.tan(vFovHalf) * aspect);
  const camZV  = (halfV * 1.45) / Math.tan(vFovHalf);
  cmpCamera.position.z = Math.max(camZH, camZV, 5);

  compareNameA.textContent = dataA.name;
  compareDiamA.textContent = dA.toLocaleString('pt-BR') + ' km';
  compareNameB.textContent = dataB.name;
  compareDiamB.textContent = dB.toLocaleString('pt-BR') + ' km';

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
  compareSelect.innerHTML = '';
  allBodies.forEach(b => {
    if (b.id === cardData.id) return;
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    if (b.id === 'earth') opt.selected = true;
    compareSelect.appendChild(opt);
  });
  const compareData = allBodies.find(b => b.id === compareSelect.value);
  if (compareData) renderComparison(cardData, compareData);
}

compareSelect.addEventListener('change', () => {
  if (!currentCardData) return;
  const compareData = allBodies.find(b => b.id === compareSelect.value);
  if (compareData) renderComparison(currentCardData, compareData);
});

// -- showCard / hideCard
export function showCard(data) {
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
  cardNav.classList.toggle('hidden', !state.activePlanet);

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

export function hideCard() {
  stopCompareAnim();
  card.classList.add('hidden');
}

// -- Quality management
export function applyQualityPixelRatio(scale) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

export function applyShowComets(show) {
  comets.forEach(cm => {
    cm.outerGroup.visible = show;
    cm.tailPts.visible    = show;
  });
}

export function applyStarDensity(density) {
  if (!state.showStars) { starGroups.forEach(g => { g.visible = false; }); return; }
  if (density === 'low') {
    starGroups.forEach((g, i) => { g.visible = i === 0; });
  } else if (density === 'medium') {
    starGroups.forEach((g, i) => { g.visible = i <= 2; });
  } else {
    starGroups.forEach(g => { g.visible = true; });
  }
}

export function applyShowKuiperBelt(show) {
  kuiperBeltCompressed.visible = show;
  kuiperBeltReal.visible = show;
}

// -- Date controls
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function applyDatePicker(dateStr, skipHash = false) {
  if (!dateStr) return;
  const date = new Date(dateStr + 'T12:00:00Z');
  if (isNaN(date.getTime())) return;
  setPlanetsToDate(date);
  const retrograde = isMarsRetrograde(date);
  document.getElementById('retrograde-badge').classList.toggle('hidden', !retrograde);
  if (!skipHash) updateHash();
}

export function setRealtimeMode(val) {
  state.realtimeMode = val;
  if (val) {
    state.positionFrozen = true;
    const now = new Date();
    datePicker.value = now.toISOString().slice(0, 10);
    applyDatePicker(datePicker.value);
    clearInterval(state._realtimeInterval);
    state._realtimeInterval = setInterval(() => {
      const n = new Date();
      datePicker.value = n.toISOString().slice(0, 10);
      applyDatePicker(datePicker.value);
    }, 2000);
  } else {
    clearInterval(state._realtimeInterval);
    state._realtimeInterval = null;
  }
  btnRealtime.classList.toggle('active', val);
  btnRealtime.setAttribute('aria-pressed', String(val));
  updateHash();
}

const datePicker = document.getElementById('date-picker');
const btnHoje    = document.getElementById('btn-hoje');
export const btnRealtime = document.getElementById('btn-realtime');

btnRealtime.addEventListener('click', () => setRealtimeMode(!state.realtimeMode));

datePicker.addEventListener('change', () => {
  if (state.realtimeMode) setRealtimeMode(false);
  state.positionFrozen = true;
  applyDatePicker(datePicker.value);
});

btnHoje.addEventListener('click', () => {
  if (state.realtimeMode) setRealtimeMode(false);
  state.positionFrozen = true;
  datePicker.value = todayStr();
  applyDatePicker(datePicker.value);
});

// Export datePicker so main.js can read its value during restoreFromHash
export { datePicker };

// -- View controls
export const btnOrbits   = document.getElementById('ctrl-orbits');
export const btnLabels   = document.getElementById('ctrl-labels');
export const btnRotation = document.getElementById('ctrl-rotation');
export const btnRealScale = document.getElementById('ctrl-real-scale');

btnOrbits.addEventListener('click', () => {
  state.showOrbits = !state.showOrbits;
  btnOrbits.classList.toggle('active', state.showOrbits);
  btnOrbits.setAttribute('aria-pressed', String(state.showOrbits));
  planets.forEach(p => { p.orbitMesh.visible = state.showOrbits; });
  comets.forEach(cm => { cm.orbitLine.visible = state.showOrbits; });
  updateHash();
});

btnLabels.addEventListener('click', () => {
  state.showLabels = !state.showLabels;
  btnLabels.classList.toggle('active', state.showLabels);
  btnLabels.setAttribute('aria-pressed', String(state.showLabels));
  updateHash();
});

export function toggleRotation() {
  state.timeSpeed = state.timeSpeed > 0 ? 0 : 1;
  const running = state.timeSpeed > 0;
  if (running) {
    if (state.realtimeMode) setRealtimeMode(false);
    state.positionFrozen = false;
  }
  btnRotation.classList.toggle('active', running);
  btnRotation.setAttribute('aria-pressed', String(running));
  btnRotation.textContent = running ? '▶ Rotação' : '⏸ Rotação';
  updateHash();
}
btnRotation.addEventListener('click', toggleRotation);

btnRealScale.addEventListener('click', () => {
  if (state.viewMode !== 'top' || cam.animating) return;
  state.realScale = !state.realScale;
  btnRealScale.classList.toggle('active', state.realScale);
  btnRealScale.setAttribute('aria-pressed', String(state.realScale));
  planets.forEach(p => {
    p.targetOrbitRadius = state.realScale ? p.realOrbitRadius : p.data.orbitRadius;
  });
  cam.tgtUp.set(0, 0, -1);
  moveCameraTo(
    (state.realScale ? TOP_CAM_REAL : TOP_CAM_COMPRESSED).clone(),
    new THREE.Vector3(0, 0, 0)
  );
  updateHash();
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
  qualityBloomBtn.textContent = state.bloomEnabled ? 'Ligado' : 'Desligado';
  qualityBloomBtn.classList.toggle('active', state.bloomEnabled);
  qualityBloomBtn.setAttribute('aria-pressed', String(state.bloomEnabled));
}
qualityBloomBtn.addEventListener('click', () => {
  state.bloomEnabled = !state.bloomEnabled;
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
    state.qualityPixelRatio = parseFloat(btn.dataset.val);
    applyQualityPixelRatio(state.qualityPixelRatio);
    syncSegmented('quality-resolution', state.qualityPixelRatio);
  });
});
syncSegmented('quality-resolution', state.qualityPixelRatio);

document.querySelectorAll('#quality-stars [data-val]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.starDensity = btn.dataset.val;
    applyStarDensity(state.starDensity);
    syncSegmented('quality-stars', state.starDensity);
  });
});
syncSegmented('quality-stars', state.starDensity);

// -- Visibility panel
export function syncVisBtn(btn, visible) {
  btn.textContent = visible ? 'Visível' : 'Oculto';
  btn.classList.toggle('active', visible);
  btn.setAttribute('aria-pressed', String(visible));
}

const btnVisibility   = document.getElementById('btn-visibility');
const visibilityPanel = document.getElementById('visibility-panel');

btnVisibility.addEventListener('click', e => {
  e.stopPropagation();
  visibilityPanel.classList.toggle('hidden');
  btnVisibility.setAttribute('aria-pressed', !visibilityPanel.classList.contains('hidden'));
  qualityPanel.classList.add('hidden');
});

document.addEventListener('click', e => {
  if (!visibilityPanel.classList.contains('hidden') &&
      !visibilityPanel.contains(e.target) && e.target !== btnVisibility) {
    visibilityPanel.classList.add('hidden');
    btnVisibility.setAttribute('aria-pressed', 'false');
  }
});

const visCometBtn  = document.getElementById('vis-comets');
const visGalaxyBtn = document.getElementById('vis-galaxies');
const visStarsBtn  = document.getElementById('vis-stars');
const visOrbitsBtn = document.getElementById('vis-orbits');
const visKuiperBtn = document.getElementById('vis-kuiper');

visCometBtn.addEventListener('click', () => {
  state.showComets = !state.showComets;
  applyShowComets(state.showComets);
  syncVisBtn(visCometBtn, state.showComets);
  updateHash();
});

visGalaxyBtn.addEventListener('click', () => {
  state.showGalaxies = !state.showGalaxies;
  galaxyGroup.visible = state.showGalaxies;
  syncVisBtn(visGalaxyBtn, state.showGalaxies);
  updateHash();
});

visStarsBtn.addEventListener('click', () => {
  state.showStars = !state.showStars;
  applyStarDensity(state.starDensity);
  syncVisBtn(visStarsBtn, state.showStars);
  updateHash();
});

visOrbitsBtn.addEventListener('click', () => {
  state.showOrbits = !state.showOrbits;
  btnOrbits.classList.toggle('active', state.showOrbits);
  btnOrbits.setAttribute('aria-pressed', String(state.showOrbits));
  planets.forEach(p => { p.orbitMesh.visible = state.showOrbits; });
  comets.forEach(cm => { cm.orbitLine.visible = state.showOrbits; });
  syncVisBtn(visOrbitsBtn, state.showOrbits);
  updateHash();
});

visKuiperBtn.addEventListener('click', () => {
  state.showKuiperBelt = !state.showKuiperBelt;
  applyShowKuiperBelt(state.showKuiperBelt);
  syncVisBtn(visKuiperBtn, state.showKuiperBelt);
  updateHash();
});

syncVisBtn(visCometBtn,  state.showComets);
syncVisBtn(visGalaxyBtn, state.showGalaxies);
syncVisBtn(visStarsBtn,  state.showStars);
syncVisBtn(visOrbitsBtn, state.showOrbits);
syncVisBtn(visKuiperBtn, state.showKuiperBelt);

// -- Shortcuts overlay
const shortcutsOverlay = document.getElementById('shortcuts-overlay');
const btnShortcuts     = document.getElementById('btn-shortcuts');

export function toggleShortcuts() {
  shortcutsOverlay.classList.toggle('hidden');
}

btnShortcuts.addEventListener('click', toggleShortcuts);
shortcutsOverlay.addEventListener('click', e => {
  if (e.target === shortcutsOverlay) toggleShortcuts();
});

// -- Screenshot
document.getElementById('btn-screenshot').addEventListener('click', () => {
  if (state.bloomEnabled) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }

  const gl = renderer.domElement;
  const oc = document.createElement('canvas');
  oc.width  = gl.width;
  oc.height = gl.height;
  const ctx = oc.getContext('2d');
  ctx.drawImage(gl, 0, 0);

  const pr  = Math.min(window.devicePixelRatio, 2);
  const fSz = Math.round(13 * pr);
  ctx.font = `${fSz}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(160,200,255,0.75)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const pad = Math.round(14 * pr);
  ctx.fillText('Sistema Solar 3D', oc.width - pad, oc.height - pad);

  const a = document.createElement('a');
  a.download = `sistema-solar-${new Date().toISOString().slice(0,10)}.png`;
  a.href = oc.toDataURL('image/png');
  a.click();
});
