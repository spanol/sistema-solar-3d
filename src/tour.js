import * as THREE from 'three';
import { camera } from './scene.js';
import { cam, moveCameraTo } from './camera.js';
import { planets, TOP_CAM_COMPRESSED, TOP_CAM_REAL } from './planets.js';
import { state } from './state.js';
import { updateHash } from './hash.js';
import { hint } from './ui.js';

const TOUR_CAPTIONS = {
  mercury: { name: 'Mercúrio',  hint: 'O planeta mais próximo do Sol — um ano dura apenas 88 dias terrestres' },
  venus:   { name: 'Vênus',    hint: 'O planeta mais brilhante do céu noturno — superfície a 465°C' },
  earth:   { name: 'Terra',    hint: 'Nosso lar azul — o único planeta habitado que conhecemos' },
  mars:    { name: 'Marte',    hint: 'O Planeta Vermelho — lar do Olympus Mons, o maior vulcão do sistema solar' },
  jupiter: { name: 'Júpiter',  hint: 'A Grande Mancha Vermelha — tempestade com mais de 350 anos de duração' },
  saturn:  { name: 'Saturno',  hint: 'Anéis majestosos de gelo e rocha — visíveis com um telescópio básico' },
  uranus:  { name: 'Urano',    hint: 'Inclinado de lado — o eixo de rotação inclina 98° em relação à órbita' },
  neptune: { name: 'Netuno',   hint: 'Ventos supersônicos de 2.100 km/h — o planeta mais ventoso do sistema solar' },
  pluto:   { name: 'Plutão',  hint: 'Planeta anão no Cinturão de Kuiper — Caronte tem metade do seu tamanho' },
};

export let tourMode = false;
let tourIndex     = 0;
let tourPlaying   = true;
let tourAutoTimer = null;
let tourCurve     = null;
let tourCurveT    = 0;
const TOUR_CURVE_DURATION = 2.8;
const TOUR_STOP_DWELL    = 5000;

const tourOverlay     = document.getElementById('tour-overlay');
const tourBodyName    = document.getElementById('tour-body-name');
const tourBodyHint    = document.getElementById('tour-body-hint');
const tourPlayPauseBtn = document.getElementById('tour-play-pause');

// Injected by initTourCallbacks() in main.js (avoids circular imports)
let _hideCard = null;

export function initTourCallbacks({ hideCard }) {
  _hideCard = hideCard;
}

function computeTourCamPos(p) {
  const { x, z } = p.group.position;
  const or = Math.sqrt(x * x + z * z) || p.data.orbitRadius;
  const camDist = p.vr * 8 + 10;
  const elevation = p.vr * 3.5 + 8;
  const nx = x / or, nz = z / or;
  return new THREE.Vector3(x - nx * camDist, elevation, z - nz * camDist);
}

function flyTourStop(idx) {
  const p = planets[idx];
  const targetPos    = computeTourCamPos(p);
  const targetLookAt = p.group.position.clone();

  const fromPos = cam.pos.clone();
  const mid = fromPos.clone().add(targetPos).multiplyScalar(0.5);
  mid.y += Math.max(fromPos.distanceTo(targetPos) * 0.3, 15);
  tourCurve  = new THREE.CatmullRomCurve3([fromPos, mid, targetPos]);
  tourCurveT = 0;

  cam.tgtLookAt.copy(targetLookAt);
  cam.tgtUp.set(0, 1, 0);

  const cap = TOUR_CAPTIONS[p.data.id];
  if (cap) {
    tourBodyName.textContent = cap.name;
    tourBodyHint.textContent = cap.hint;
  }
}

export function tickTourCamera(dt) {
  if (!tourCurve) return;
  tourCurveT += dt / TOUR_CURVE_DURATION;
  if (tourCurveT >= 1.0) {
    tourCurveT = 1.0;
    cam.pos.copy(tourCurve.getPoint(1));
    cam.tgtPos.copy(cam.pos);
    camera.position.copy(cam.pos);
    tourCurve = null;
    if (tourPlaying) {
      tourAutoTimer = setTimeout(() => { if (tourMode && tourPlaying) tourAdvance(1); }, TOUR_STOP_DWELL);
    }
  } else {
    const pt = tourCurve.getPoint(tourCurveT);
    cam.pos.copy(pt);
    camera.position.copy(pt);
  }
  cam.lookAt.lerp(cam.tgtLookAt, Math.min(1, dt * 1.8));
  cam.up.lerp(cam.tgtUp, Math.min(1, dt * 2.5)).normalize();
  camera.up.copy(cam.up);
  camera.lookAt(cam.lookAt);
}

function tourAdvance(dir) {
  clearTimeout(tourAutoTimer);
  tourIndex = (tourIndex + dir + planets.length) % planets.length;
  flyTourStop(tourIndex);
}

function tourTogglePlay() {
  tourPlaying = !tourPlaying;
  tourPlayPauseBtn.innerHTML = tourPlaying ? '&#9646;&#9646;' : '&#9654;';
  tourPlayPauseBtn.setAttribute('aria-label', tourPlaying ? 'Pausar tour' : 'Retomar tour');
  if (tourPlaying && !tourCurve) {
    tourAutoTimer = setTimeout(() => { if (tourMode && tourPlaying) tourAdvance(1); }, TOUR_STOP_DWELL);
  } else {
    clearTimeout(tourAutoTimer);
  }
}

export function startTour() {
  if (tourMode) return;
  tourMode    = true;
  tourPlaying = true;
  tourIndex   = 0;
  if (_hideCard) _hideCard();
  state.activePlanet = null;
  state.viewMode = 'front';
  document.getElementById('view-controls').classList.add('hidden');
  document.getElementById('planet-strip').classList.add('hidden');
  document.getElementById('quality-panel').classList.add('hidden');
  tourOverlay.classList.remove('hidden');
  tourPlayPauseBtn.innerHTML = '&#9646;&#9646;';
  tourPlayPauseBtn.setAttribute('aria-label', 'Pausar tour');
  hint.style.opacity = '0';
  cam.tgtUp.set(0, 1, 0);
  flyTourStop(0);
}

export function stopTour() {
  tourMode = false;
  tourCurve = null;
  clearTimeout(tourAutoTimer);
  tourOverlay.classList.add('hidden');
  state.activePlanet = null;
  state.viewMode = 'top';
  updateHash();
  hint.style.opacity = '1';
  document.getElementById('view-controls').classList.remove('hidden');
  cam.tgtUp.set(0, 0, -1);
  moveCameraTo(
    (state.realScale ? TOP_CAM_REAL : TOP_CAM_COMPRESSED).clone(),
    new THREE.Vector3(0, 0, 0)
  );
}

document.getElementById('btn-tour').addEventListener('click', startTour);
document.getElementById('tour-exit').addEventListener('click', stopTour);
document.getElementById('tour-prev').addEventListener('click', () => tourAdvance(-1));
document.getElementById('tour-next').addEventListener('click', () => tourAdvance(1));
tourPlayPauseBtn.addEventListener('click', tourTogglePlay);
