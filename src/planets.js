import * as THREE from 'three';
import allBodies from './data/planets.json';
import { scene } from './scene.js';

export const sunData = allBodies.find(b => b.isStar);
export const planetBodies = allBodies.filter(b => !b.isStar);
export { allBodies };

export const TOP_CAM_COMPRESSED = new THREE.Vector3(0, 130, 32);
export const TOP_CAM_REAL       = new THREE.Vector3(0, 560, 32);
export const SCENE_UNITS_PER_MKM = 16 / 149.6;

// -- Texture loader
export const textureLoader = new THREE.TextureLoader();

export const PLANET_TEXTURES = {
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

export const MOON_TEXTURES = {
  moon:     '/textures/1k_moon.jpg',
  io:       '/textures/1k_io.jpg',
  europa:   '/textures/1k_europa.jpg',
  ganymede: '/textures/1k_ganymede.jpg',
  callisto: '/textures/1k_callisto.jpg',
  titan:    '/textures/1k_titan.webp',
};

// -- Loading screen: fades out when all planet textures finish loading
// (regressed in SIS-124 refactor — restored here where texture loading lives)
const _loadScreen = document.getElementById('loading-screen');
const _loadBar    = document.getElementById('loading-bar');
const _loadPct    = document.getElementById('loading-percent');
const _TOTAL_TEX  = Object.keys(PLANET_TEXTURES).length + 1; // +1 for saturn ring alpha
let   _loadedTex  = 0;

function _onTex() {
  _loadedTex++;
  const pct = Math.round((_loadedTex / _TOTAL_TEX) * 100);
  _loadBar.style.width  = pct + '%';
  _loadPct.textContent  = pct + '%';
  if (_loadedTex >= _TOTAL_TEX) {
    setTimeout(() => {
      _loadScreen.classList.add('loaded');
      setTimeout(() => { if (_loadScreen.parentNode) _loadScreen.remove(); }, 550);
    }, 180);
  }
}

// Rocky planets / moons that receive procedural normal maps.
// [sobelStrength, normalScale]: strength controls elevation contrast depth;
// normalScale further multiplies the final per-pixel shading.
const ROCKY_NORMAL_PARAMS = {
  mercury: [3.2, 1.4],
  mars:    [2.0, 0.9],
  moon:    [3.8, 1.6],
};

// Generate an RGB normal map from a loaded THREE.Texture using a 3×3 Sobel filter.
// Converts the color image to grayscale luminance, computes XY surface gradients,
// and packs the resulting normal direction into R/G/B channels (OpenGL convention).
function genNormalMap(colorTex, strength) {
  try {
    const img = colorTex.image;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const srcC = document.createElement('canvas');
    srcC.width = w; srcC.height = h;
    srcC.getContext('2d').drawImage(img, 0, 0);
    const src = srcC.getContext('2d').getImageData(0, 0, w, h).data;

    const dstC = document.createElement('canvas');
    dstC.width = w; dstC.height = h;
    const dstCtx = dstC.getContext('2d');
    const out = dstCtx.createImageData(w, h);
    const dst = out.data;

    function lum(x, y) {
      x = ((x % w) + w) % w;
      y = Math.max(0, Math.min(h - 1, y));
      const i = (y * w + x) * 4;
      return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tl = lum(x-1,y-1), t = lum(x,y-1), tr = lum(x+1,y-1);
        const  l = lum(x-1,y  ),                   r = lum(x+1,y  );
        const bl = lum(x-1,y+1), b = lum(x,y+1), br = lum(x+1,y+1);

        let nx = -((tr + 2*r + br) - (tl + 2*l + bl)) * strength;
        let ny = -((bl + 2*b + br) - (tl + 2*t + tr)) * strength;
        const nz = 1.0;
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);

        const i = (y * w + x) * 4;
        dst[i  ] = (nx / len * 0.5 + 0.5) * 255 | 0;
        dst[i+1] = (ny / len * 0.5 + 0.5) * 255 | 0;
        dst[i+2] = (nz / len * 0.5 + 0.5) * 255 | 0;
        dst[i+3] = 255;
      }
    }

    dstCtx.putImageData(out, 0, 0);
    return new THREE.CanvasTexture(dstC);
  } catch (_) {
    return null;
  }
}

// -- Sun
export const sunState = { textureLoaded: false };
export const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffee44 })
);
scene.add(sunMesh);

textureLoader.load(PLANET_TEXTURES.sol, (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  sunMesh.material.map = tex;
  sunMesh.material.color.set(0xffffff);
  sunMesh.material.needsUpdate = true;
  sunState.textureLoaded = true;
  _onTex();
}, undefined, _onTex);

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

// -- Asteroid Belt
const asteroidSpriteTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0,    'rgba(255,255,255,1.0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.70, 'rgba(255,255,255,0.15)');
  g.addColorStop(1,    'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();

function makeAsteroidBelt(innerR, outerR) {
  const count = 2000;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = innerR + Math.random() * (outerR - innerR);
    pos[i * 3]     = Math.cos(angle) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
    pos[i * 3 + 2] = Math.sin(angle) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x998877,
    size: 0.22,
    sizeAttenuation: true,
    map: asteroidSpriteTex,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.01,
    opacity: 0.75,
  }));
}

export const asteroidBeltCompressed = makeAsteroidBelt(22.5, 27.5);
export const asteroidBeltReal = makeAsteroidBelt(35.2, 51.2);
asteroidBeltReal.material.opacity = 0;
scene.add(asteroidBeltCompressed);
scene.add(asteroidBeltReal);

// -- Kuiper Belt
function makeKuiperBelt(innerR, outerR, count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = innerR + Math.random() * (outerR - innerR);
    pos[i * 3]     = Math.cos(angle) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 2.8;
    pos[i * 3 + 2] = Math.sin(angle) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x8aaab8,
    size: 0.18,
    sizeAttenuation: true,
    map: asteroidSpriteTex,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.01,
    opacity: 0.40,
  }));
}

export const kuiperBeltCompressed = makeKuiperBelt(64, 84, 1200);
export const kuiperBeltReal       = makeKuiperBelt(480, 880, 1200);
kuiperBeltReal.material.opacity = 0;
scene.add(kuiperBeltCompressed);
scene.add(kuiperBeltReal);

// -- Earth day/night shader helpers
function makeNightMapTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000208';
  ctx.fillRect(0, 0, W, H);

  function city(lon, lat, rad, bright) {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    const r = (rad / 360) * W;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,   `rgba(255,245,200,${bright})`);
    g.addColorStop(0.3, `rgba(255,220,140,${bright * 0.55})`);
    g.addColorStop(0.7, `rgba(255,180, 80,${bright * 0.20})`);
    g.addColorStop(1,   `rgba(255,160, 40,0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  [
    // North America
    [-74,40.7,4.0,.95],[-87.6,41.9,3.0,.85],[-118.2,34,3.5,.90],
    [-122.4,37.8,2.5,.80],[-71,42.4,2.2,.75],[-77,39,1.8,.65],
    [-75.2,39.9,1.8,.65],[-84.4,33.7,1.5,.60],[-97,32.8,2.0,.70],
    [-95.4,29.8,1.5,.60],[-112,33.4,1.5,.60],[-80.2,25.8,1.5,.60],
    [-90.1,30,1.2,.50],[-86.8,36.2,1.0,.45],[-93.1,44.9,1.2,.50],
    [-81.7,41.5,1.0,.45],[-83,39.9,1.0,.45],[-122.3,47.6,1.5,.60],
    [-79.4,43.7,2.0,.70],[-73.6,45.5,1.8,.65],[-99.1,19.4,2.5,.80],
    [-66.9,10.5,.8,.35],[-88,15,.7,.30],
    // South America
    [-46.6,-23.5,3.0,.85],[-43.2,-22.9,2.5,.80],[-58.4,-34.6,2.0,.70],
    [-70.7,-33.4,1.5,.60],[-77,-12,1.0,.40],[-74.1,4.7,.8,.35],
    // Europe
    [-8.7,38.7,1.2,.50],[2.3,48.9,3.0,.92],[-0.1,51.5,3.0,.92],
    [4.9,52.4,2.2,.82],[6.9,50.9,2.0,.78],[8.7,50.1,1.5,.65],
    [13.4,52.5,2.0,.78],[12.5,41.9,2.0,.72],[9.2,45.5,2.0,.72],
    [-3.7,40.4,2.0,.72],[28.9,41,2.0,.78],[37.6,55.8,2.5,.88],
    [30.3,59.9,1.5,.62],[17,48.2,1.5,.62],[23.7,38,1.5,.58],
    [14.5,50.1,1.2,.52],[18,59.3,1.0,.48],[21,52.2,1.2,.52],
    [26.1,44.4,1.0,.48],[24.9,60.2,.8,.42],[-2.2,53.5,1.5,.62],
    [-1.9,52.5,1.5,.60],[4.4,50.8,1.5,.68],[16.4,48.2,1.2,.52],
    // Middle East
    [31.2,30.1,2.0,.72],[46.7,24.7,2.0,.72],[55.3,25.2,1.5,.62],
    [51.4,35.7,1.5,.62],[44.4,33.3,1.2,.52],[35.2,31.8,1.5,.62],
    [67.1,24.9,1.5,.62],[51.5,25.3,1.0,.48],[49.1,55.8,.8,.38],
    [56.8,53.2,.7,.32],[60.6,56.9,.8,.38],[82.9,54.9,.7,.32],
    // Africa
    [3.4,6.5,1.5,.58],[28,-26.2,1.5,.62],[18.4,-33.9,1.0,.42],
    [36.8,-1.3,1.0,.42],[38.8,9,.8,.38],[7.5,9.1,.8,.38],
    [32.5,.3,.7,.32],[15.3,4.4,.5,.22],
    // South/Southeast Asia
    [72.9,19.1,2.5,.88],[77.2,28.6,2.5,.88],[80.3,13.1,1.5,.62],
    [88.4,22.6,2.0,.78],[90.4,23.8,2.0,.78],[78.5,17.4,1.2,.52],
    [77.6,12.9,1.2,.52],[72.6,23,1.0,.48],[75.8,26.9,1.0,.48],
    [80.9,26.9,.8,.38],[85.3,27.7,.7,.32],[83,17.7,.8,.35],
    [100.5,13.8,1.5,.62],[101.7,3.2,1.5,.62],[103.8,1.3,1.2,.52],
    [106.8,-6.2,1.5,.62],[106.7,10.8,1.2,.52],[107.6,16.5,.8,.35],
    // East Asia
    [121,14.6,1.5,.62],[114.2,22.3,2.5,.88],[121.5,31.2,3.0,.92],
    [116.4,39.9,3.0,.92],[104.1,30.6,1.5,.62],[117.2,39.1,1.5,.62],
    [113.3,23.1,2.5,.88],[118.8,32.1,1.5,.62],[114.3,30.6,1.5,.62],
    [126.6,45.8,1.0,.48],[125.3,43.9,1.0,.48],[123.4,41.8,1.2,.52],
    [106.6,29.6,1.5,.62],[108.9,34.3,1.2,.52],[120.2,30.3,1.2,.52],
    [113.9,28.2,1.2,.52],[127,37.6,2.0,.78],[139.7,35.7,3.5,.97],
    [135.5,34.7,2.5,.88],[130.4,33.6,1.5,.62],[141.4,43.1,1.0,.48],
    // Oceania
    [151.2,-33.9,2.0,.78],[144.9,-37.8,2.0,.78],[153,-27.5,1.2,.52],
    [115.9,-32,1.0,.48],[174.8,-37,1.0,.42],
  ].forEach(([lon, lat, r, b]) => city(lon, lat, r, b));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeEarthMaterial(dayTex, nightTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      dayTexture:   { value: dayTex },
      nightTexture: { value: nightTex },
    },
    vertexShader: /* glsl */`
      varying vec2  vUv;
      varying vec3  vWNormal;
      varying vec3  vWPos;
      void main() {
        vUv      = uv;
        vec4 wp  = modelMatrix * vec4(position, 1.0);
        vWPos    = wp.xyz;
        vWNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      varying vec2 vUv;
      varying vec3 vWNormal;
      varying vec3 vWPos;
      void main() {
        vec3  sunDir    = normalize(-vWPos);
        float cosA      = dot(vWNormal, sunDir);
        float lighting  = 0.04 + max(cosA, 0.0) * 0.96;
        vec4  dayCol    = texture2D(dayTexture,   vUv) * lighting;
        float nightFade = 1.0 - smoothstep(-0.25, 0.05, cosA);
        vec4  nightCol  = texture2D(nightTexture, vUv) * nightFade * 2.0;
        gl_FragColor    = vec4((dayCol + nightCol).rgb, 1.0);
      }
    `,
  });
}

// -- Planets
export const planets = planetBodies.map((data, i) => {
  const startAngle = (i / planetBodies.length) * Math.PI * 2;
  const vr = Math.max(data.radius * 1.5, 0.65);
  const tiltRad = THREE.MathUtils.degToRad(data.axialTilt || 0);

  const orbitMesh = new THREE.Mesh(
    new THREE.RingGeometry(data.orbitRadius - 0.1, data.orbitRadius + 0.1, 128),
    new THREE.MeshBasicMaterial({ color: 0x1e3050, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  orbitMesh.rotation.x = Math.PI / 2;
  scene.add(orbitMesh);

  const group = new THREE.Group();
  group.position.set(Math.cos(startAngle) * data.orbitRadius, 0, Math.sin(startAngle) * data.orbitRadius);
  scene.add(group);

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
    if (data.id === 'earth') {
      const nightTex = makeNightMapTexture();
      textureLoader.load(planetTexPath, (dayTex) => {
        dayTex.colorSpace = THREE.SRGBColorSpace;
        mesh.material.dispose();
        mesh.material = makeEarthMaterial(dayTex, nightTex);
        _onTex();
      }, undefined, _onTex);
    } else {
      textureLoader.load(planetTexPath, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        mesh.material.map = tex;
        mesh.material.color.set(0xffffff);
        const nrmParams = ROCKY_NORMAL_PARAMS[data.id];
        if (nrmParams) {
          const nrmMap = genNormalMap(tex, nrmParams[0]);
          if (nrmMap) {
            mesh.material.normalMap = nrmMap;
            mesh.material.normalScale.set(nrmParams[1], nrmParams[1]);
          }
        }
        mesh.material.needsUpdate = true;
        _onTex();
      }, undefined, _onTex);
    }
  }

  let ringMesh = null;
  if (data.hasRings) {
    const innerR = vr * 1.6;
    const outerR = vr * 2.8;
    const ringGeo = new THREE.RingGeometry(innerR, outerR, 192, 4);
    const pos = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j);
      const y = pos.getY(j);
      const r = Math.sqrt(x * x + y * y);
      uv.setXY(j, (r - innerR) / (outerR - innerR), 0.5);
    }
    uv.needsUpdate = true;

    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 512; ringCanvas.height = 4;
    const rCtx = ringCanvas.getContext('2d');
    const rGrad = rCtx.createLinearGradient(0, 0, 512, 0);
    rGrad.addColorStop(0.00, 'rgba(155,125,80,0.10)');
    rGrad.addColorStop(0.12, 'rgba(162,132,87,0.22)');
    rGrad.addColorStop(0.18, 'rgba(218,192,138,0.88)');
    rGrad.addColorStop(0.30, 'rgba(238,208,150,0.97)');
    rGrad.addColorStop(0.45, 'rgba(228,200,144,0.93)');
    rGrad.addColorStop(0.500, 'rgba(55,44,29,0.08)');
    rGrad.addColorStop(0.535, 'rgba(22,18,12,0.01)');
    rGrad.addColorStop(0.570, 'rgba(55,44,29,0.08)');
    rGrad.addColorStop(0.620, 'rgba(200,174,124,0.80)');
    rGrad.addColorStop(0.730, 'rgba(210,184,132,0.84)');
    rGrad.addColorStop(0.820, 'rgba(190,165,118,0.70)');
    rGrad.addColorStop(0.900, 'rgba(148,128,90,0.30)');
    rGrad.addColorStop(1.000, 'rgba(92,80,56,0.03)');
    rCtx.fillStyle = rGrad;
    rCtx.fillRect(0, 0, 512, 4);
    const ringColorTex = new THREE.CanvasTexture(ringCanvas);

    ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshLambertMaterial({
        map: ringColorTex,
        emissive: new THREE.Color(0.15, 0.12, 0.06),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    tiltGroup.add(ringMesh);

    textureLoader.load('/textures/2k_saturn_ring_alpha.png', (tex) => {
      ringMesh.material.alphaMap = tex;
      ringMesh.material.needsUpdate = true;
      _onTex();
    }, undefined, _onTex);
  }

  return { mesh, ringMesh, group, orbitMesh, data, angle: startAngle, speed: data.orbitSpeed * 0.007, vr };
});

export const meshList = planets.map(p => p.mesh);
export const clickTargets = planets.flatMap(p => p.ringMesh ? [p.mesh, p.ringMesh] : [p.mesh]);

planets.forEach(p => {
  p.realOrbitRadius    = p.data.distanceFromSunMkm * SCENE_UNITS_PER_MKM;
  p.currentOrbitRadius = p.data.orbitRadius;
  p.targetOrbitRadius  = p.data.orbitRadius;
});

// -- Moons
export const allMoons = [];
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
    const moonTexPath = MOON_TEXTURES[md.id];
    if (moonTexPath) {
      textureLoader.load(moonTexPath, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        moonMesh.material.map = tex;
        moonMesh.material.color.set(0xffffff);
        const nrmParams = ROCKY_NORMAL_PARAMS[md.id];
        if (nrmParams) {
          const nrmMap = genNormalMap(tex, nrmParams[0]);
          if (nrmMap) {
            moonMesh.material.normalMap = nrmMap;
            moonMesh.material.normalScale.set(nrmParams[1], nrmParams[1]);
          }
        }
        moonMesh.material.needsUpdate = true;
      });
    }
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

// -- Hover ring
export const hoverRing = new THREE.Mesh(
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
