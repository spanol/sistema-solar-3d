import * as THREE from 'three';
import { scene } from './scene.js';

// -- Space background: dark with galactic band + colorful nebula patches
(function makeSpaceBackground() {
  const W = 2048, H = 1024;
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = W; bgCanvas.height = H;
  const ctx = bgCanvas.getContext('2d');

  ctx.fillStyle = '#010209';
  ctx.fillRect(0, 0, W, H);

  [
    { spread: 0.28, alpha: 0.22, rgb: [22, 10, 55] },
    { spread: 0.12, alpha: 0.18, rgb: [40, 18, 80] },
  ].forEach(({ spread, alpha, rgb }) => {
    const g = ctx.createLinearGradient(0, H * (0.5 - spread), 0, H * (0.5 + spread));
    g.addColorStop(0,   'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });

  [
    [0.18, 0.42, 180, 'rgba(90,15,120,0.18)'],
    [0.68, 0.58, 150, 'rgba(8,60,110,0.16)'],
    [0.44, 0.35, 210, 'rgba(20,8,60,0.12)'],
    [0.82, 0.30, 120, 'rgba(100,45,10,0.14)'],
    [0.30, 0.68, 130, 'rgba(10,80,90,0.13)'],
    [0.56, 0.70, 100, 'rgba(70,10,100,0.12)'],
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

// -- Stars on a spherical shell (900–1200 units)
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

export const starGroups = [
  makeStars(4000, 900, 1200, 0.48, 0xffffff),
  makeStars(1200, 900, 1200, 0.30, 0xffffff),
  makeStars(600,  900, 1200, 0.78, 0xc8dcff),
  makeStars(280,  900, 1200, 0.62, 0xfff5cc),
  makeStars(100,  900, 1200, 1.10, 0xffcc88),
  makeStars(80,   900, 1200, 0.90, 0xff88cc),
  makeStars(60,   900, 1200, 0.85, 0x88ffee),
];
starGroups.forEach(g => scene.add(g));

// -- Galaxies: 4 procedural spiral/elliptical sprites at shell distance ~950–1100
export const galaxyGroup = new THREE.Group();
scene.add(galaxyGroup);

(function makeGalaxies() {
  function makeGalaxyTex(colorInner, colorOuter, arms, width, height) {
    const c = document.createElement('canvas');
    c.width = width || 256; c.height = height || 256;
    const ctx = c.getContext('2d');
    const cx = c.width / 2, cy = c.height / 2;

    const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.25);
    coreG.addColorStop(0, colorInner);
    coreG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coreG;
    ctx.fillRect(0, 0, c.width, c.height);

    const diskG = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.85);
    diskG.addColorStop(0,   colorInner.replace(/[\d.]+\)$/, '0.35)'));
    diskG.addColorStop(0.4, colorOuter.replace(/[\d.]+\)$/, '0.20)'));
    diskG.addColorStop(1,   'rgba(0,0,0,0)');

    if (arms > 0) {
      for (let i = 0; i < arms; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((Math.PI * 2 / arms) * i);
        ctx.scale(1, 0.25);
        const ag = ctx.createRadialGradient(cx * 0.3, 0, 0, cx * 0.3, 0, cx * 0.65);
        ag.addColorStop(0,   colorOuter.replace(/[\d.]+\)$/, '0.22)'));
        ag.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = ag;
        ctx.fillRect(-cx, -cx, c.width * 2, c.height * 2);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = diskG;
      ctx.fillRect(0, 0, c.width, c.height);
    }

    return new THREE.CanvasTexture(c);
  }

  const GALAXY_DEFS = [
    {
      pos: new THREE.Vector3(-405, -913, -51).normalize().multiplyScalar(970),
      scale: 110,
      tex: makeGalaxyTex('rgba(140,170,255,0.90)', 'rgba(60,80,200,0.50)', 2),
    },
    {
      pos: new THREE.Vector3(460, -884, 102).normalize().multiplyScalar(1010),
      scale: 90,
      tex: makeGalaxyTex('rgba(220,120,255,0.85)', 'rgba(130,30,180,0.45)', 0),
    },
    {
      pos: new THREE.Vector3(-291, -874, -388).normalize().multiplyScalar(980),
      scale: 105,
      tex: makeGalaxyTex('rgba(255,210,100,0.88)', 'rgba(180,90,20,0.45)', 3),
    },
    {
      pos: new THREE.Vector3(99, -994, 50).normalize().multiplyScalar(990),
      scale: 80,
      tex: makeGalaxyTex('rgba(80,230,220,0.82)', 'rgba(20,110,130,0.42)', 2),
    },
  ];

  GALAXY_DEFS.forEach(({ pos, scale, tex }) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    sprite.position.copy(pos);
    sprite.scale.set(scale, scale * 0.6, 1);
    galaxyGroup.add(sprite);
  });
})();
