/**
 * QA SIS-86 — Zoomed Saturn ring inspection
 */
import puppeteer from 'puppeteer';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    consoleErrors.push({ t: msg.type(), m: msg.text() });
  }
});

// Load page
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(3000);

// Find Saturn label position
const saturnPos = await page.evaluate(() => {
  const labels = document.querySelectorAll('*');
  for (const el of labels) {
    if (el.textContent.trim() === 'Saturno' && el.children.length === 0) {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
    }
  }
  return null;
});
console.log('Saturn position:', saturnPos);

// Screenshot top view with Saturn visible
await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-Z1-top.png' });

if (saturnPos) {
  // Click Saturn
  await page.mouse.click(saturnPos.x, saturnPos.y);
  await sleep(5000); // wait for camera transition

  // Full page
  await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-Z2-saturn-full.png' });
  console.log('Z2: Saturn full view');

  // Now take a CLIPPED screenshot of just the Saturn area (center of viewport, right side)
  // Saturn appears roughly in the center-right area after selecting it
  await page.screenshot({
    path: 'D:/code/sistema-solar-3d/qa-sis86-Z3-saturn-clip.png',
    clip: { x: 400, y: 50, width: 700, height: 650 },
  });
  console.log('Z3: Saturn clipped');

  // Another clip focusing just on ring
  await page.screenshot({
    path: 'D:/code/sistema-solar-3d/qa-sis86-Z4-ring-only.png',
    clip: { x: 550, y: 100, width: 500, height: 500 },
  });
  console.log('Z4: Ring detail');
}

// Now try with keyboard shortcut: press '6' for Saturn (if supported)
await page.keyboard.press('Escape');
await sleep(2000);
await page.keyboard.press('Digit6');
await sleep(5000);

await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-Z5-key6-saturn.png' });
console.log('Z5: Key 6 Saturn');

await page.screenshot({
  path: 'D:/code/sistema-solar-3d/qa-sis86-Z6-key6-ring-clip.png',
  clip: { x: 400, y: 50, width: 700, height: 650 },
});
console.log('Z6: Key 6 ring clipped');

// Check card position
const cardRect = await page.evaluate(() => {
  const card = document.getElementById('card-stats');
  if (!card) return null;
  const style = window.getComputedStyle(card);
  const rect = card.getBoundingClientRect();
  return {
    display: style.display,
    opacity: style.opacity,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    title: document.getElementById('card-name')?.textContent,
  };
});
console.log('Card rect:', cardRect);

const relevant = consoleErrors.filter(e =>
  !e.m.includes('Console Ninja') &&
  !e.m.includes('favicon') &&
  !e.m.includes('service worker')
);
console.log('Console errors:', relevant.length > 0 ? JSON.stringify(relevant) : 'clean');

await browser.close();
console.log('Done');
