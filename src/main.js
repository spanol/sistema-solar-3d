import * as THREE from 'three';

// Core modules (order matters — scene first, then everything that adds to it)
import './background.js';
import { renderer, scene, camera, orbitControls, fillLight, composer } from './scene.js';
import { state } from './state.js';
import { planets, allMoons, sunMesh, sunData, sunState, clickTargets, orbitHitTargets,
         TOP_CAM_COMPRESSED, TOP_CAM_REAL, asteroidBeltCompressed, asteroidBeltReal,
         kuiperBeltCompressed, kuiperBeltReal, hoverRing } from './planets.js';
import { comets, updateComets } from './comets.js';
import { cam, moveCameraTo, tickCamera, frontViewLookAtOffset, applyZoom } from './camera.js';
import { startPlanetTone, stopPlanetTone } from './audio.js';
import { tourMode, tickTourCamera, stopTour, initTourCallbacks } from './tour.js';
import { parseHash, updateHash } from './hash.js';
import { starGroups, galaxyGroup } from './background.js';
import {
  hint, showCard, hideCard, updateLabels, updatePlanetStrip,
  applyQualityPixelRatio, applyShowComets, applyStarDensity, applyShowKuiperBelt,
  applyDatePicker, setRealtimeMode, syncVisBtn, todayStr, datePicker,
  btnOrbits, btnLabels, btnRotation, btnRealScale,
  toggleShortcuts, toggleRotation,
  initUICallbacks,
} from './ui.js';

// -- selectPlanet, backToTop, navigatePlanet
function selectPlanet(p) {
  state.activePlanet = p;
  state.viewMode = 'front';
  updateHash();
  hideCard();
  state.hoveredPlanet = null;
  document.getElementById('view-controls').classList.add('hidden');
  document.getElementById('date-controls').classList.add('hidden');
  document.getElementById('quality-panel').classList.add('hidden');
  searchWrap.classList.add('hidden');
  document.getElementById('planet-strip').classList.remove('hidden');
  updatePlanetStrip(p);

  const { x, z } = p.group.position;
  const or = Math.sqrt(x * x + z * z) || p.data.orbitRadius;
  const camDist = p.vr * 8 + 10;
  const elevation = p.vr * 3.5 + 8;
  const nx = x / or, nz = z / or;

  const camPos = new THREE.Vector3(x - nx * camDist, elevation, z - nz * camDist);
  const isMobileLayout = window.innerWidth < 768;
  const shift = isMobileLayout ? 0 : camDist * 0.22;
  frontViewLookAtOffset.set(nz * shift, 0, -nx * shift);

  cam.tgtUp.set(0, 1, 0);
  moveCameraTo(camPos, new THREE.Vector3(x, 0, z).add(frontViewLookAtOffset), () => {
    showCard(p.data);
    startPlanetTone(p);
  });
}

function backToTop() {
  hideCard();
  stopPlanetTone();
  state.activePlanet = null;
  state.viewMode = 'top';
  updateHash();
  hint.style.opacity = '1';
  document.getElementById('view-controls').classList.remove('hidden');
  document.getElementById('date-controls').classList.remove('hidden');
  searchWrap.classList.remove('hidden');
  document.getElementById('planet-strip').classList.add('hidden');
  cam.tgtUp.set(0, 0, -1);
  moveCameraTo(
    (state.realScale ? TOP_CAM_REAL : TOP_CAM_COMPRESSED).clone(),
    new THREE.Vector3(0, 0, 0)
  );
}

function navigatePlanet(dir) {
  if (cam.animating || !state.activePlanet) return;
  const idx = planets.indexOf(state.activePlanet);
  if (idx === -1) return;
  selectPlanet(planets[(idx + dir + planets.length) % planets.length]);
}

// -- Freecam
const btnFreecam = document.getElementById('btn-freecam');

function enterFreecam() {
  if (state.viewMode === 'freecam') return;
  if (tourMode) stopTour();
  if (state.viewMode === 'front') {
    hideCard();
    stopPlanetTone();
    state.activePlanet = null;
    document.getElementById('planet-strip').classList.add('hidden');
  }
  state.viewMode = 'freecam';
  hint.style.opacity = '0';
  document.getElementById('view-controls').classList.remove('hidden');
  document.getElementById('date-controls').classList.remove('hidden');
  searchWrap.classList.remove('hidden');
  document.getElementById('quality-panel').classList.add('hidden');
  orbitControls.target.copy(cam.lookAt);
  orbitControls.update();
  orbitControls.enabled = true;
  btnFreecam.classList.add('active');
  btnFreecam.setAttribute('aria-pressed', 'true');
}

function exitFreecam() {
  if (state.viewMode !== 'freecam') return;
  orbitControls.enabled = false;
  cam.pos.copy(camera.position);
  cam.lookAt.copy(orbitControls.target);
  backToTop();
  btnFreecam.classList.remove('active');
  btnFreecam.setAttribute('aria-pressed', 'false');
}

function toggleFreecam() {
  if (state.viewMode === 'freecam') exitFreecam();
  else enterFreecam();
}

btnFreecam.addEventListener('click', toggleFreecam);

// -- Planet Search (SIS-123)
const searchWrap    = document.getElementById('planet-search');
const searchInput   = document.getElementById('planet-search-input');
const searchResults = document.getElementById('planet-search-results');
let _searchMatches   = [];
let _searchSelectIdx = -1;

function _searchFilter(q) {
  if (!q.trim()) return [];
  const lower = q.toLowerCase();
  return planets.filter(p => p.data.name.toLowerCase().includes(lower));
}

function _searchHighlight(idx) {
  searchResults.querySelectorAll('.search-result-item').forEach((el, i) => {
    el.setAttribute('aria-selected', String(i === idx));
  });
  _searchSelectIdx = idx;
}

function _searchRender(matches) {
  _searchMatches   = matches;
  _searchSelectIdx = -1;
  searchResults.innerHTML = '';
  if (!matches.length) { searchResults.classList.add('hidden'); return; }
  matches.forEach(p => {
    const li  = document.createElement('li');
    li.className = 'search-result-item';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    const dot = document.createElement('span');
    dot.className = 'search-result-dot';
    dot.style.background = p.data.color;
    const txt = document.createElement('span');
    txt.textContent = p.data.name;
    li.append(dot, txt);
    li.addEventListener('mousedown', e => { e.preventDefault(); _searchCommit(p); });
    searchResults.appendChild(li);
  });
  searchResults.classList.remove('hidden');
}

function _searchCommit(p) {
  searchInput.value = '';
  searchResults.classList.add('hidden');
  searchInput.blur();
  if (tourMode) stopTour();
  if (state.viewMode === 'freecam') exitFreecam();
  selectPlanet(p);
}

searchInput.addEventListener('input', () => {
  _searchRender(_searchFilter(searchInput.value));
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _searchHighlight(Math.min(_searchSelectIdx + 1, _searchMatches.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _searchHighlight(Math.max(_searchSelectIdx - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = _searchSelectIdx >= 0 ? _searchMatches[_searchSelectIdx]
                 : _searchMatches.length === 1 ? _searchMatches[0] : null;
    if (target) _searchCommit(target);
  } else if (e.key === 'Escape') {
    searchInput.value = '';
    searchResults.classList.add('hidden');
    searchInput.blur();
  }
});

searchInput.addEventListener('blur', () => {
  setTimeout(() => searchResults.classList.add('hidden'), 150);
});

// -- Wire UI + tour callbacks
initUICallbacks({ selectPlanet, backToTop, navigatePlanet });
initTourCallbacks({ hideCard });

// -- Keyboard
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
    e.preventDefault();
    return;
  }
  // SIS-104: in freecam, Ctrl/Cmd+F would open browser Find - suppress it
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && state.viewMode === 'freecam') {
    e.preventDefault();
    return;
  }
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  switch (e.key) {
    case 'ArrowLeft':
      if (state.viewMode === 'front') navigatePlanet(-1);
      break;
    case 'ArrowRight':
      if (state.viewMode === 'front') navigatePlanet(1);
      break;
    case 'Escape':
      if (!document.getElementById('shortcuts-overlay').classList.contains('hidden')) toggleShortcuts();
      else if (tourMode) stopTour();
      else if (state.viewMode === 'front') backToTop();
      else if (state.viewMode === 'freecam') exitFreecam();
      break;
    case 'f':
    case 'F':
      if (!e.ctrlKey && !e.metaKey && !e.altKey) toggleFreecam();
      break;
    case ' ':
      e.preventDefault();
      toggleRotation();
      break;
    case '?':
      toggleShortcuts();
      break;
    case '/':
      if (state.viewMode === 'top' || state.viewMode === 'freecam') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
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
const pointer   = new THREE.Vector2();
const canvas    = renderer.domElement;

function setPointer(cx, cy) {
  const r = canvas.getBoundingClientRect();
  pointer.x =  ((cx - r.left) / r.width)  * 2 - 1;
  pointer.y = -((cy - r.top)  / r.height) * 2 + 1;
}

// -- Orbit distance tooltip (SIS-122)
const orbitTooltip = document.createElement('div');
Object.assign(orbitTooltip.style, {
  position: 'absolute', pointerEvents: 'none',
  background: 'rgba(5,8,18,0.90)',
  border: '1px solid rgba(80,140,255,0.30)',
  borderRadius: '8px',
  padding: '0.45rem 0.8rem',
  color: '#cce4ff',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  fontSize: '12px',
  lineHeight: '1.6',
  boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  whiteSpace: 'nowrap',
  zIndex: '20',
  opacity: '0',
  transition: 'opacity 0.12s',
});
document.getElementById('app').appendChild(orbitTooltip);
let _orbitTooltipVisible = false;

function showOrbitTooltip(p, mx, my) {
  const distMkm = p.data.distanceFromSunMkm;
  const distAU  = (distMkm / 149.6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  orbitTooltip.innerHTML =
    '<span style="color:#4fa3e0;font-weight:600">' + p.data.name + '</span><br>' +
    distAU + ' UA &nbsp;·&nbsp; ' + distMkm.toLocaleString('pt-BR') + ' M km';
  const flipLeft = mx > window.innerWidth * 0.68;
  orbitTooltip.style.left = (mx + (flipLeft ? -210 : 16)) + 'px';
  orbitTooltip.style.top  = Math.max(4, my - 44) + 'px';
  orbitTooltip.style.opacity = '1';
  _orbitTooltipVisible = true;
}

function hideOrbitTooltip() {
  if (!_orbitTooltipVisible) return;
  orbitTooltip.style.opacity = '0';
  _orbitTooltipVisible = false;
}

function trySelect(cx, cy) {
  if (cam.animating) return;
  setPointer(cx, cy);
  raycaster.setFromCamera(pointer, camera);

  if (state.viewMode === 'top') {
    const hits = raycaster.intersectObjects(clickTargets);
    if (hits.length) {
      const hitObj = hits[0].object;
      const p = planets.find(q => q.mesh === hitObj || q.ringMesh === hitObj);
      if (p) { selectPlanet(p); return; }
    }
    if (raycaster.intersectObject(sunMesh).length) {
      showCard(sunData);
    }
  } else if (state.viewMode === 'front') {
    const hits = raycaster.intersectObjects(clickTargets);
    if (hits.length) {
      const hitObj = hits[0].object;
      const p = planets.find(q => q.mesh === hitObj || q.ringMesh === hitObj);
      if (p && p !== state.activePlanet) { selectPlanet(p); return; }
    }
  }
}

canvas.addEventListener('click', e => trySelect(e.clientX, e.clientY));

canvas.addEventListener('mousemove', e => {
  if (cam.animating) {
    canvas.style.cursor = 'default';
    state.hoveredPlanet = null;
    hideOrbitTooltip();
    return;
  }
  setPointer(e.clientX, e.clientY);
  raycaster.setFromCamera(pointer, camera);

  if (state.viewMode === 'top') {
    const hits = raycaster.intersectObjects(clickTargets);
    const sunHit = raycaster.intersectObject(sunMesh).length > 0;
    canvas.style.cursor = (hits.length || sunHit) ? 'pointer' : 'default';
    if (hits.length) {
      const hitObj = hits[0].object;
      state.hoveredPlanet = planets.find(q => q.mesh === hitObj || q.ringMesh === hitObj) || null;
      hideOrbitTooltip();
    } else {
      state.hoveredPlanet = null;
      if (!sunHit && state.showOrbits) {
        const orbitHits = raycaster.intersectObjects(orbitHitTargets);
        if (orbitHits.length) {
          const hp = planets.find(q => q.orbitHitMesh === orbitHits[0].object);
          if (hp) showOrbitTooltip(hp, e.clientX, e.clientY);
          else hideOrbitTooltip();
        } else {
          hideOrbitTooltip();
        }
      } else {
        hideOrbitTooltip();
      }
    }
  } else if (state.viewMode === 'front') {
    hideOrbitTooltip();
    const hits = raycaster.intersectObjects(clickTargets);
    if (hits.length) {
      const hitObj = hits[0].object;
      const p = planets.find(q => q.mesh === hitObj || q.ringMesh === hitObj);
      canvas.style.cursor = (p && p !== state.activePlanet) ? 'pointer' : 'default';
    } else {
      canvas.style.cursor = 'default';
    }
    state.hoveredPlanet = null;
  } else {
    state.hoveredPlanet = null;
    canvas.style.cursor = 'default';
    hideOrbitTooltip();
  }
});

canvas.addEventListener('mouseleave', () => hideOrbitTooltip());

const pinch = { active: false, dist: 0 };
function touchDist(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.hypot(dx, dy);
}

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (e.changedTouches.length === 1 && !pinch.active) {
    const t = e.changedTouches[0];
    trySelect(t.clientX, t.clientY);
  }
  if (e.touches.length < 2) pinch.active = false;
}, { passive: false });

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (state.viewMode !== 'freecam') applyZoom(e.deltaY, state);
}, { passive: false });

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
    if (pinch.dist > 0 && state.viewMode !== 'freecam') applyZoom((pinch.dist - d) * 1.4, state);
    pinch.dist = d;
  }
}, { passive: false });

window.addEventListener('wheel', e => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

// -- Initial setup
applyQualityPixelRatio(state.qualityPixelRatio);
applyStarDensity(state.starDensity);

const _initParams = parseHash();
const initialDate = _initParams.date || todayStr();
datePicker.value = initialDate;
applyDatePicker(initialDate, true);

// -- Restore from URL hash
function restoreFromHash() {
  const params = parseHash();
  if (!Object.keys(params).length) return;

  if ('orbits' in params) {
    state.showOrbits = params.orbits !== '0';
    btnOrbits.classList.toggle('active', state.showOrbits);
    btnOrbits.setAttribute('aria-pressed', String(state.showOrbits));
    planets.forEach(p => { p.orbitMesh.visible = state.showOrbits; });
    comets.forEach(cm => { cm.orbitLine.visible = state.showOrbits; });
    syncVisBtn(document.getElementById('vis-orbits'), state.showOrbits);
  }

  if ('labels' in params) {
    state.showLabels = params.labels !== '0';
    btnLabels.classList.toggle('active', state.showLabels);
    btnLabels.setAttribute('aria-pressed', String(state.showLabels));
  }

  if ('comets' in params) {
    state.showComets = params.comets !== '0';
    applyShowComets(state.showComets);
    syncVisBtn(document.getElementById('vis-comets'), state.showComets);
  }

  if ('galaxies' in params) {
    state.showGalaxies = params.galaxies !== '0';
    galaxyGroup.visible = state.showGalaxies;
    syncVisBtn(document.getElementById('vis-galaxies'), state.showGalaxies);
  }

  if ('stars' in params) {
    state.showStars = params.stars !== '0';
    applyStarDensity(state.starDensity);
    syncVisBtn(document.getElementById('vis-stars'), state.showStars);
  }

  if ('kuiper' in params) {
    state.showKuiperBelt = params.kuiper !== '0';
    applyShowKuiperBelt(state.showKuiperBelt);
    syncVisBtn(document.getElementById('vis-kuiper'), state.showKuiperBelt);
  }

  if ('speed' in params) {
    const s = parseFloat(params.speed);
    if (isFinite(s)) {
      state.timeSpeed = s;
      const running = state.timeSpeed > 0;
      btnRotation.classList.toggle('active', running);
      btnRotation.setAttribute('aria-pressed', String(running));
      btnRotation.textContent = running ? '▶ Rotação' : '⏸ Rotação';
    }
  }

  if (params.realscale && params.realscale !== '0') {
    state.realScale = true;
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
    datePicker.value = params.date;
    applyDatePicker(params.date);
  }

  if (params.realtime && params.realtime !== '0') {
    setRealtimeMode(true);
  }
}

restoreFromHash();

// -- Animation loop
const clock = new THREE.Clock();

(function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  const mult = state.viewMode === 'top' ? state.timeSpeed : 0.06;
  const orbitLerpK = Math.min(1, dt * 2.0);
  planets.forEach(p => {
    p.currentOrbitRadius = THREE.MathUtils.lerp(p.currentOrbitRadius, p.targetOrbitRadius, orbitLerpK);
    if (!state.positionFrozen) p.angle += p.speed * dt * 60 * mult;
    p.group.position.x = Math.cos(p.angle) * p.currentOrbitRadius;
    p.group.position.z = Math.sin(p.angle) * p.currentOrbitRadius;
    p.mesh.rotation.y += dt * 0.2;
    p.orbitMesh.scale.setScalar(p.currentOrbitRadius / p.data.orbitRadius);
    p.orbitHitMesh.scale.setScalar(p.currentOrbitRadius / p.data.orbitRadius);
  });

  state.realScaleLerpT = THREE.MathUtils.lerp(state.realScaleLerpT, state.realScale ? 1 : 0, orbitLerpK);
  asteroidBeltCompressed.material.opacity = 0.75 * (1 - state.realScaleLerpT);
  asteroidBeltReal.material.opacity       = 0.75 * state.realScaleLerpT;
  kuiperBeltCompressed.material.opacity   = 0.40 * (1 - state.realScaleLerpT) * (state.showKuiperBelt ? 1 : 0);
  kuiperBeltReal.material.opacity         = 0.40 * state.realScaleLerpT * (state.showKuiperBelt ? 1 : 0);

  const isFront = state.viewMode === 'front';
  allMoons.forEach(m => {
    const show = isFront && state.activePlanet === m.parent;
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

  updateComets(elapsed);

  if (tourMode) {
    tickTourCamera(dt);
  } else if (state.viewMode === 'freecam') {
    orbitControls.update();
  } else if (cam.animating) {
    tickCamera(dt);
  } else if (state.viewMode === 'front' && state.activePlanet) {
    const targetLookAt = state.activePlanet.group.position.clone().add(frontViewLookAtOffset);
    cam.lookAt.lerp(targetLookAt, 0.04);
    camera.lookAt(cam.lookAt);
  } else {
    camera.lookAt(cam.lookAt);
  }

  starGroups.forEach((g, i) => {
    g.material.opacity = 0.78 + Math.sin(elapsed * (0.45 + i * 0.22) + i * 2.09) * 0.13;
  });

  if (sunState.textureLoaded) {
    const p = 1.22 + Math.sin(elapsed * 2) * 0.08;
    sunMesh.material.color.setRGB(p, p * 0.88, p * 0.56);
  } else {
    const p = 1.35 + Math.sin(elapsed * 2) * 0.08;
    sunMesh.material.color.setRGB(p, p * 0.82, p * 0.20);
  }

  if (state.viewMode === 'top' && state.hoveredPlanet && !cam.animating) {
    hoverRing.position.copy(state.hoveredPlanet.group.position);
    hoverRing.position.y = 0;
    hoverRing.scale.setScalar(state.hoveredPlanet.vr + 0.35);
    hoverRing.material.opacity = 0.45 + Math.sin(elapsed * 4) * 0.20;
    hoverRing.visible = true;
  } else {
    hoverRing.visible = false;
  }

  updateLabels();

  if (state.viewMode === 'front' || tourMode) {
    fillLight.position.copy(camera.position);
    fillLight.intensity = 3.0;
  } else {
    fillLight.intensity = 0;
  }

  if (state.bloomEnabled) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
})();
