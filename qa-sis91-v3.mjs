import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE = 'http://localhost:5177';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const errors = [];
const resources404 = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('response', resp => {
  if (resp.status() === 404) resources404.push(resp.url());
});

await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Screenshot 1: Top view overview (default state)
await page.screenshot({ path: 'qa-sis91-v3-01-top-view.png' });
console.log('1: top view captured');

// Reposition camera directly above asteroid belt region.
// Asteroid belt (compressed) is at radius 22.5–27.5 in the XZ plane.
// Camera up is (0,0,-1), so the scene Y is up, and the belt is in XZ.
// Position camera at ~(25, 8, 0) looking at (25, 0, 0) to see particles close.
await page.evaluate(() => {
  if (!window.__threeCamera) return;
  const cam = window.__threeCamera;
  cam.position.set(25, 8, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(25, 0, 0);
  cam.updateProjectionMatrix();
});

// Most apps expose camera differently - try common patterns
await page.evaluate(() => {
  // Try to find the THREE.js camera from the renderer
  const canvas = document.querySelector('canvas');
  if (!canvas) return;

  // Access via renderer's __three internals
  const renderer = canvas._renderer || canvas.__renderer;
  if (renderer) {
    const camera = renderer.camera || renderer._camera;
    if (camera) {
      camera.position.set(25, 8, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(25, 0, 0);
      camera.updateProjectionMatrix();
    }
  }
});

await new Promise(r => setTimeout(r, 500));

// Since direct camera manipulation may not work from outside the module,
// let's try the scroll/pan approach but from the asteroid belt position.
// First, reset and reload
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// From the top view screenshot, the asteroid belt ring appears roughly:
// Center of system at (640, 400) in viewport
// Belt radius is ~230px in screen space (seeing the ring of dots)
// The belt ring is to the right-top area around (760-800, 280-320)

// Pan toward asteroid belt by clicking and dragging (simulate right-drag or middle-drag)
// In Three.js OrbitControls: right-click drag = pan, left-click drag = orbit

// Actually since OrbitControls is the camera, let's just zoom into asteroid belt
// by positioning mouse over a belt particle and scrolling in

// Belt appears at approximately (770, 290) and (510, 540) in the 1280x800 viewport
// Let's try the upper-right part of the belt

await page.mouse.move(770, 290);
await new Promise(r => setTimeout(r, 300));
// Zoom in gently toward that point
for (let i = 0; i < 15; i++) {
  await page.mouse.wheel({ deltaY: -100 });
  await new Promise(r => setTimeout(r, 50));
}
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: 'qa-sis91-v3-02-belt-topright.png' });
console.log('2: top-right belt zoom captured');

// Zoom in more
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel({ deltaY: -100 });
  await new Promise(r => setTimeout(r, 50));
}
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: 'qa-sis91-v3-03-belt-close.png' });
console.log('3: close belt zoom captured');

// Zoom in even more to see individual particle shapes
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel({ deltaY: -100 });
  await new Promise(r => setTimeout(r, 50));
}
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: 'qa-sis91-v3-04-particles-detail.png' });
console.log('4: particle detail captured');

// Now check bottom-left belt area from fresh load
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Bottom-left of belt approximately around (380, 530)
await page.mouse.move(380, 530);
await new Promise(r => setTimeout(r, 300));
for (let i = 0; i < 20; i++) {
  await page.mouse.wheel({ deltaY: -100 });
  await new Promise(r => setTimeout(r, 50));
}
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: 'qa-sis91-v3-05-belt-bottomleft.png' });
console.log('5: bottom-left belt captured');

for (let i = 0; i < 10; i++) {
  await page.mouse.wheel({ deltaY: -100 });
  await new Promise(r => setTimeout(r, 50));
}
await new Promise(r => setTimeout(r, 2000));
await page.screenshot({ path: 'qa-sis91-v3-06-particles-bottomleft.png' });
console.log('6: bottom-left particles captured');

const results = {
  consoleErrors: errors,
  resources404,
  errorCount: errors.length,
};

fs.writeFileSync('qa-sis91-v3-results.json', JSON.stringify(results, null, 2));
console.log('Results:', JSON.stringify(results, null, 2));

await browser.close();
