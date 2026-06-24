import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const canvas = document.getElementById('solar-canvas');

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020408);

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

export const orbitControls = new OrbitControls(camera, canvas);
orbitControls.enabled = false;
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.07;
orbitControls.screenSpacePanning = true;
orbitControls.minDistance = 5;
orbitControls.maxDistance = 1500;

scene.add(new THREE.AmbientLight(0x111133, 2.0));
scene.add(new THREE.HemisphereLight(0x223366, 0x000814, 0.8));

export const sunLight = new THREE.PointLight(0xfff5e0, 2.5, 0, 0);
scene.add(sunLight);

export const fillLight = new THREE.PointLight(0xfff8f0, 0, 0, 0);
scene.add(fillLight);

export const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, 0.45, 0.90
);

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
