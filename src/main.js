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
camera.up.copy(cam.up); // top-down "north" = -Z
camera.lookAt(cam.lookAt);

// ── Lights ────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x223366, 1.5));
const sunLight = new THREE.PointLight(0xffffff, 3, 500);
scene.add(sunLight);

// ── Stars ─────────────────────────────────────────────────────────
{
  const v = new Float32Array(6000 * 3);
  for (let i = 0; i < v.length; i++) v[i] = (Math.random() - 0.5) * 1400;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 })));
}

// ── Sun ───────────────────────────────────────────────────────────
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffee55 })
);
scene.add(sunMesh);
// Soft glow corona
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(5.8, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.1, side: THREE.BackSide })
));

// ── Planets ───────────────────────────────────────────────────────
const planets = planetBodies.map((data, i) => {
  const startAngle = (i / planetBodies.length) * Math.PI * 2;
  const vr = Math.max(data.radius * 1.5, 0.65); // min size so small planets are visible

  const orbitMesh = new THREE.Mesh(
    new THREE.RingGeometry(data.orbitRadius - 0.1, data.orbitRadius + 0.1, 128),
    new THREE.MeshBasicMaterial({ color: 0x2a3a55, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
  );
  orbitMesh.rotation.x = Math.PI / 2;
  scene.add(orbitMesh);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(vr, 32, 32),
    new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.75, metalness: 0.05 })
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

  return { mesh, data, angle: startAngle, speed: data.orbitSpeed * 0.007, vr };
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
    position: 'absolute', color: 'rgba(180,220,255,0.85)',
    fontSize: '11px', fontFamily: "'Segoe UI', system-ui, sans-serif",
    pointerEvents: 'none', whiteSpace: 'nowrap',
    textShadow: '0 1px 4px rgba(0,0,0,0.9)', transition: 'opacity 0.4s',
  });
  labelWrap.appendChild(el);
  return el;
});

// ── Hint ──────────────────────────────────────────────────────────
const hint = document.createElement('div');
hint.textContent = 'Clique em um planeta para explorar';
Object.assign(hint.style, {
  position: 'absolute', bottom: '1.5rem', left: '50%',
  transform: 'translateX(-50%)',
  color: 'rgba(160,200,255,0.55)', fontSize: '13px',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  pointerEvents: 'none', transition: 'opacity 0.5s',
});
document.getElementById('app').appendChild(hint);

// ── State ─────────────────────────────────────────────────────────
let viewMode = 'top';
let activePlanet = null;

// ── Card DOM ──────────────────────────────────────────────────────
const card      = document.getElementById('planet-card');
const cardName  = document.getElementById('card-name');
const cardDesc  = document.getElementById('card-description');
const cardFacts = document.getElementById('card-facts');
document.getElementById('card-close').addEventListener('click', backToTop);

function showCard(data) {
  cardName.textContent = data.name;
  cardDesc.textContent = data.description;
  cardFacts.innerHTML = data.facts.map(f => `<li>${f}</li>`).join('');
  card.classList.remove('hidden');
}
function hideCard() { card.classList.add('hidden'); }

// ── Camera animation ──────────────────────────────────────────────
function moveCameraTo(toPos, toLookAt, toUp, onDone) {
  cam.tgtPos.copy(toPos);
  cam.tgtLookAt.copy(toLookAt);
  cam.tgtUp.copy(toUp);
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
  hint.style.opacity = '0';
  hideCard();

  const { x, z } = p.mesh.position;
  const or = p.data.orbitRadius;
  const camDist = p.vr * 8 + 10;
  const camPos = new THREE.Vector3(x + (x / or) * camDist, 3, z + (z / or) * camDist);

  moveCameraTo(camPos, new THREE.Vector3(x, 0, z), new THREE.Vector3(0, 1, 0), () => showCard(p.data));
}

function backToTop() {
  hideCard();
  activePlanet = null;
  viewMode = 'top';
  hint.style.opacity = '1';

  moveCameraTo(new THREE.Vector3(0, 110, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1), null);
}

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
    // Check planets first
    const hits = raycaster.intersectObjects(meshList, true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj.parent && !meshList.includes(obj)) obj = obj.parent;
      const p = planets.find(q => q.mesh === obj);
      if (p) { selectPlanet(p); return; }
    }
    // Check sun
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
  const visible = viewMode === 'top' && !cam.animating;
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

  const mult = viewMode === 'top' ? 1 : 0.06;
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
