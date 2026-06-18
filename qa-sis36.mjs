import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = './qa-screenshots-sis36';
mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = 'http://localhost:5182';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Find a planet label by name and return its center screen coords
async function getPlanetScreenPos(page, name) {
  return page.evaluate((targetName) => {
    const allDivs = Array.from(document.querySelectorAll('div'));
    const el = allDivs.find(d =>
      d.textContent.trim() === targetName &&
      d.style.position === 'absolute' &&
      d.style.color &&
      d.style.pointerEvents === 'none'
    );
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Planet sphere is ~20-40px above label text
    return { x: rect.left + rect.width / 2, y: rect.top - 25 };
  }, name);
}

async function clickPlanet(page, name) {
  const pos = await getPlanetScreenPos(page, name);
  if (!pos) { console.log(`Could not find label for ${name}`); return false; }
  console.log(`Clicking ${name} at`, pos);
  await page.mouse.click(pos.x, pos.y);
  return true;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  const consoleMessages = [];

  // --- DESKTOP TEST ---
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(text);
    if (msg.type() === 'error') consoleErrors.push(text);
  });
  page.on('pageerror', err => consoleErrors.push(`[pageerror] ${err.message}`));

  console.log('Navigating…');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(7000); // allow Three.js/WebGL to fully render

  // Screenshot 1: top/superior view — all 8 planets
  await page.screenshot({ path: join(OUT_DIR, '01-top-view-desktop.png') });
  console.log('✓ Screenshot 1: top view');

  // Read label positions to understand what planets are visible
  const labelInfo = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div'))
      .filter(d => d.style.position === 'absolute' && d.style.pointerEvents === 'none' && d.style.color && d.textContent.trim().length > 0 && d.textContent.trim().length < 20)
      .map(d => {
        const r = d.getBoundingClientRect();
        return { name: d.textContent.trim(), x: r.left, y: r.top, w: r.width, h: r.height };
      });
  });
  console.log('Visible labels:', JSON.stringify(labelInfo.map(l => l.name)));

  // Screenshot 2: front view of Earth (Terra)
  const terraClicked = await clickPlanet(page, 'Terra');
  if (terraClicked) {
    await wait(4000); // wait for camera transition
    await page.screenshot({ path: join(OUT_DIR, '02-earth-front-view.png') });
    console.log('✓ Screenshot 2: Terra front view');
  }

  // Go back to top view via Voltar button
  const voltarBtn = await page.$('button');
  const allBtns = await page.$$eval('button', els => els.map(el => ({ text: el.textContent.trim(), visible: el.offsetParent !== null })));
  console.log('Buttons:', JSON.stringify(allBtns));

  // Click "← Voltar" button to go back
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const back = btns.find(b => b.textContent.includes('Voltar'));
    if (back) back.click();
  });
  await wait(3000);
  await page.screenshot({ path: join(OUT_DIR, '03-after-back-to-top.png') });
  console.log('✓ Screenshot 3: after back to top');

  // Screenshot 4: front view of Neptune (Netuno)
  const neptuneClicked = await clickPlanet(page, 'Netuno');
  if (neptuneClicked) {
    await wait(4000);
    await page.screenshot({ path: join(OUT_DIR, '04-neptune-front-view.png') });
    console.log('✓ Screenshot 4: Netuno front view');
  }

  // Back to top again and check Saturn (rings + tilt)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const back = btns.find(b => b.textContent.includes('Voltar'));
    if (back) back.click();
  });
  await wait(3000);

  const saturnClicked = await clickPlanet(page, 'Saturno');
  if (saturnClicked) {
    await wait(4000);
    await page.screenshot({ path: join(OUT_DIR, '05-saturn-front-view.png') });
    console.log('✓ Screenshot 5: Saturno front view');
  }

  await ctx.close();

  // --- MOBILE TEST ---
  const ctxM = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
  });
  const pageM = await ctxM.newPage();
  const mobileErrors = [];
  pageM.on('console', msg => {
    if (msg.type() === 'error') mobileErrors.push(`[error] ${msg.text()}`);
  });
  await pageM.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(7000);
  await pageM.screenshot({ path: join(OUT_DIR, '06-mobile-top-view.png') });
  console.log('✓ Screenshot 6: mobile top view');
  await ctxM.close();

  await browser.close();

  const report = {
    timestamp: new Date().toISOString(),
    visiblePlanetLabels: labelInfo.map(l => l.name),
    consoleErrors,
    consoleMessages,
    mobileErrors,
  };
  writeFileSync(join(OUT_DIR, 'console-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nDone. Console errors: ${consoleErrors.length}, Mobile errors: ${mobileErrors.length}`);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
