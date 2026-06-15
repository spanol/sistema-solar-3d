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
const positions = new Float32Array(starCount * 3);
// Deterministic pseudo-random via LCG so no Math.random() surprises
let seed = 1234567;
function lcg() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
for (let i = 0; i < starCount * 3; i++) positions[i] = (lcg() - 0.5) * 400;
starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 })));

// ── Camera ───────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
const TOP_POS = new THREE.Vector3(0, 80, 0);
const TOP_LOOK = new THREE.Vector3(0, 0, 0);
camera.position.copy(TOP_POS);
camera.lookAt(TOP_LOOK);

// ── Lighting ─────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.18));
const sunLight = new THREE.PointLight(0xfff4e0, 3, 300);
scene.add(sunLight);

// ── Sun ──────────────────────────────────────────────────────────
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(3.5, 32, 32),
  new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    emissive: 0xffaa00,
    emissiveIntensity: 1.2,
    roughness: 1,
    metalness: 0,
  })
);
sunMesh.userData = { planet: solData, angle: 0, isStar: true };
scene.add(sunMesh);

// Soft corona halo (sprite-free billboard ring)
const haloGeo = new THREE.RingGeometry(3.6, 5.8, 64);
const haloMat = new THREE.MeshBasicMaterial({
  color: 0xffdd55,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
});
const haloMesh = new THREE.Mesh(haloGeo, haloMat);
scene.add(haloMesh);

// ── Planets ──────────────────────────────────────────────────────
const planetMeshes = [];
// Spread initial angles evenly so planets aren't clumped
const angleStep = (Math.PI * 2) / planetsData.length;

planetsData.forEach((p, i) => {
  // Orbit ring
  const orbitGeo = new THREE.RingGeometry(p.orbitRadius - 0.06, p.orbitRadius + 0.06, 128);
  const orbitMat = new THREE.MeshBasicMaterial({ color: 0x3a5080, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
  const orbitLine = new THREE.Mesh(orbitGeo, orbitMat);
  orbitLine.rotation.x = -Math.PI / 2;
  scene.add(orbitLine);

  // Planet sphere
  const geo = new THREE.SphereGeometry(p.radius, 32, 32);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color), roughness: 0.75, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  const startAngle = angleStep * i;
  mesh.position.set(Math.cos(startAngle) * p.orbitRadius, 0, Math.sin(startAngle) * p.orbitRadius);
  mesh.userData = { planet: p, angle: startAngle };
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
const ANIM_DURATION = 1.2;

const camFrom = new THREE.Vector3();
const camTo = new THREE.Vector3();
const lookFrom = new THREE.Vector3();
const lookTo = new THREE.Vector3();
const camTarget = new THREE.Vector3(); // tracks current look-at point

function showCard(planetData) {
  cardName.textContent = planetData.name;
  cardDesc.textContent = planetData.description;
  cardFacts.innerHTML = planetData.facts.map((f) => `<li>${f}</li>`).join('');
  card.classList.remove('hidden');
}

function hideCard() {
  card.classList.add('hidden');
}

function startCameraAnim(toCamPos, toLookAt) {
  camFrom.copy(camera.position);
  lookFrom.copy(camTarget); // current look-at, not camera position
  camTo.copy(toCamPos);
  lookTo.copy(toLookAt);
  isAnimatingCamera = true;
  animT = 0;
}

function selectPlanet(mesh) {
  selectedPlanet = mesh;
  const p = mesh.userData.planet;

  const planetPos = mesh.position.clone();
  // Place camera in the outward radial direction from Sun, at planet height
  const radialDir = new THREE.Vector3(Math.cos(mesh.userData.angle), 0, Math.sin(mesh.userData.angle)).normalize();
  const targetCamPos = planetPos.clone().addScaledVector(radialDir, p.radius * 6 + 5);
  targetCamPos.y = p.radius * 0.5; // slight elevation so planet reads well

  startCameraAnim(targetCamPos, planetPos);
  showCard(p);
}

function deselectPlanet() {
  selectedPlanet = null;
  startCameraAnim(TOP_POS, TOP_LOOK);
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

// Cursor feedback
canvas.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects([sunMesh, ...planetMeshes]);
  canvas.style.cursor = hits.length > 0 ? 'pointer' : 'default';
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

  // Track selected planet as it orbits
  if (selectedPlanet && !isAnimatingCamera) {
    camTarget.copy(selectedPlanet.position);
    camera.lookAt(camTarget);
  }

  // Sun pulse
  sunMesh.material.emissiveIntensity = 1.1 + Math.sin(elapsed * 1.5) * 0.15;
  haloMesh.material.opacity = 0.10 + Math.sin(elapsed * 2) * 0.025;

  // Halo always faces camera (billboard)
  haloMesh.quaternion.copy(camera.quaternion);

  renderer.render(scene, camera);
}

animate();
