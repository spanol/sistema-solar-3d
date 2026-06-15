import * as THREE from 'three';
import allBodies from './data/planets.json';

const solData = allBodies.find((b) => b.isStar);
const planetsData = allBodies.filter((b) => !b.isStar);

// ── Scene bootstrap ──────────────────────────────────────────────
const canvas = document.getElementById('solar-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();

// Starfield background
const starGeo = new THREE.BufferGeometry();
const starCount = 2000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) {
  starPositions[i] = (Math.random() - 0.5) * 400;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 })));

// ── Camera ───────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
// Top-down view (overview)
const TOP_POS = new THREE.Vector3(0, 80, 0);
const TOP_LOOK = new THREE.Vector3(0, 0, 0);
camera.position.copy(TOP_POS);
camera.lookAt(TOP_LOOK);

// ── Lighting ─────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.15));
const sunLight = new THREE.PointLight(0xfff4e0, 3, 300);
scene.add(sunLight);

// ── Sun ──────────────────────────────────────────────────────────
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(3.5, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffcc00 })
);
sunMesh.userData = { planet: solData, angle: 0, isStar: true };
scene.add(sunMesh);

// ── Planets ──────────────────────────────────────────────────────
const planetMeshes = [];
const orbitLines = [];

planetsData.forEach((p) => {
  // Orbit ring
  const orbitGeo = new THREE.RingGeometry(p.orbitRadius - 0.05, p.orbitRadius + 0.05, 128);
  const orbitMat = new THREE.MeshBasicMaterial({ color: 0x334466, side: THREE.DoubleSide });
  const orbitLine = new THREE.Mesh(orbitGeo, orbitMat);
  orbitLine.rotation.x = -Math.PI / 2;
  scene.add(orbitLine);
  orbitLines.push(orbitLine);

  // Planet sphere
  const geo = new THREE.SphereGeometry(p.radius, 32, 32);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color), roughness: 0.8, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(p.orbitRadius, 0, 0);
  mesh.userData = { planet: p, angle: Math.random() * Math.PI * 2 };
  scene.add(mesh);
  planetMeshes.push(mesh);

  // Saturn rings
  if (p.hasRings) {
    const ringGeo = new THREE.RingGeometry(p.radius * 1.4, p.radius * 2.2, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8b87a, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    mesh.add(ring);
  }
});

// ── Card UI ──────────────────────────────────────────────────────
const card = document.getElementById('planet-card');
const cardName = document.getElementById('card-name');
const cardDesc = document.getElementById('card-description');
const cardFacts = document.getElementById('card-facts');
const cardClose = document.getElementById('card-close');

let selectedPlanet = null;
let isAnimatingCamera = false;
let animT = 0;
const ANIM_DURATION = 1.2; // seconds

let camFrom = new THREE.Vector3();
let camTo = new THREE.Vector3();
let lookFrom = new THREE.Vector3();
let lookTo = new THREE.Vector3();
const camTarget = new THREE.Vector3();

function showCard(planetData) {
  cardName.textContent = planetData.name;
  cardDesc.textContent = planetData.description;
  cardFacts.innerHTML = planetData.facts.map((f) => `<li>${f}</li>`).join('');
  card.classList.remove('hidden');
}

function hideCard() {
  card.classList.add('hidden');
}

function selectPlanet(mesh) {
  selectedPlanet = mesh;
  const p = mesh.userData.planet;

  // Animate camera from top-down → front view of planet
  camFrom.copy(camera.position);
  lookFrom.copy(camTarget.clone().setFromMatrixPosition(camera.matrixWorld));

  const planetPos = mesh.position.clone();
  // Front view: stand in front of planet at planet-level height
  const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mesh.userData.angle)
  );
  camTo.copy(planetPos).addScaledVector(dir, p.radius * 6 + 5);
  camTo.y = 0;
  lookTo.copy(planetPos);

  isAnimatingCamera = true;
  animT = 0;

  showCard(p);
}

function deselectPlanet() {
  selectedPlanet = null;
  camFrom.copy(camera.position);
  lookFrom.copy(camTarget);
  camTo.copy(TOP_POS);
  lookTo.copy(TOP_LOOK);
  isAnimatingCamera = true;
  animT = 0;
  hideCard();
}

cardClose.addEventListener('click', deselectPlanet);

// ── Raycasting / click ───────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('click', (e) => {
  if (isAnimatingCamera) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects([sunMesh, ...planetMeshes]);
  if (hits.length > 0) {
    const obj = hits[0].object;
    if (obj.userData.isStar) {
      showCard(obj.userData.planet);
    } else {
      selectPlanet(obj);
    }
  }
});

// ── Resize ────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Animate ───────────────────────────────────────────────────────
const clock = new THREE.Clock();

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Orbit planets
  planetMeshes.forEach((mesh) => {
    const p = mesh.userData.planet;
    mesh.userData.angle += p.orbitSpeed * delta * 0.15;
    mesh.position.x = Math.cos(mesh.userData.angle) * p.orbitRadius;
    mesh.position.z = Math.sin(mesh.userData.angle) * p.orbitRadius;
    mesh.rotation.y += delta * 0.3;
  });

  // Camera transition
  if (isAnimatingCamera) {
    animT += delta / ANIM_DURATION;
    if (animT >= 1) {
      animT = 1;
      isAnimatingCamera = false;
    }
    const t = easeInOut(animT);
    camera.position.lerpVectors(camFrom, camTo, t);
    camTarget.lerpVectors(lookFrom, lookTo, t);
    camera.lookAt(camTarget);
  }

  // Keep camera pointed at selected planet while it orbits
  if (selectedPlanet && !isAnimatingCamera) {
    const planetPos = selectedPlanet.position;
    camTo.copy(planetPos);
    camera.lookAt(camTo);
    camTarget.copy(camTo);
  }

  // Sun pulse
  sunMesh.material.color.setHSL(0.12, 1, 0.5 + Math.sin(elapsed * 2) * 0.03);

  renderer.render(scene, camera);
}

animate();
