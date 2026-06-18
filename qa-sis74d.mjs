/**
 * QA SIS-74: Targeted re-test of C3 (planet positions) and C7 (404 URL)
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const OUT_DIR = 'D:\\code\\sistema-solar-3d';
const PREFIX = 'qa-sis74-';

function ss(name) { return `${OUT_DIR}\\${PREFIX}${name}.png`; }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getPlanetLabelPositionsV2(page) {
  // Wait several frames to ensure the render loop has updated label positions
  await page.evaluate(() => new Promise(r => {
    let count = 0;
    function frame() {
      count++;
      if (count >= 5) r();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));

  return await page.evaluate(() => {
    // Look for the label wrapper div (it uses absolute positioning)
    const allDivs = document.querySelectorAll('div');
    const posLabels = {};
    for (const el of allDivs) {
      const t = el.textContent.trim();
      // Planet names in Portuguese
      const planets = ['Mercúrio', 'Vênus', 'Terra', 'Marte', 'Júpiter', 'Saturno', 'Urano', 'Netuno'];
      if (planets.includes(t) && el.style.left && el.style.top) {
        posLabels[t] = { left: el.style.left, top: el.style.top };
      }
    }
    return posLabels;
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const network404s = [];
  page.on('response', r => {
    if (r.status() === 404) network404s.push(r.url());
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await wait(2500);

  // ======================================================
  // C3 Re-test: Planet positions
  // ======================================================
  console.log('=== C3 RE-TEST: Planet positions ===');

  // Make sure we're at today
  await page.click('#btn-hoje');
  await wait(1000);

  const pos_today = await getPlanetLabelPositionsV2(page);
  const todayPicker = await page.evaluate(() => document.getElementById('date-picker')?.value);
  console.log('Today:', todayPicker, '— Planets found:', Object.keys(pos_today).length);
  console.log('Positions today:', JSON.stringify(pos_today));

  await page.screenshot({ path: ss('C3-01-today'), fullPage: false });

  // Change to 2020-01-15
  await page.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2020-01-15';
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(1500);

  const pos_2020 = await getPlanetLabelPositionsV2(page);
  const picker2020 = await page.evaluate(() => document.getElementById('date-picker')?.value);
  console.log('2020-01-15 picker:', picker2020, '— Planets found:', Object.keys(pos_2020).length);
  console.log('Positions 2020:', JSON.stringify(pos_2020));

  await page.screenshot({ path: ss('C3-02-2020'), fullPage: false });

  let changedCount = 0;
  const changes = [];
  for (const name of Object.keys(pos_today)) {
    if (pos_2020[name]) {
      if (pos_2020[name].left !== pos_today[name].left || pos_2020[name].top !== pos_today[name].top) {
        changedCount++;
        changes.push(`${name}: (${pos_today[name].left},${pos_today[name].top}) → (${pos_2020[name].left},${pos_2020[name].top})`);
      }
    }
  }
  console.log(`Changed: ${changedCount}/${Object.keys(pos_today).length}`);
  changes.forEach(c => console.log(' ', c));

  const c3pass = changedCount >= 5;
  console.log(`C3: ${c3pass ? 'PASS' : 'FAIL'}\n`);

  // ======================================================
  // C7 Re-test: Identify the 404 URL
  // ======================================================
  console.log('=== C7 RE-TEST: 404 identification ===');
  console.log('404 URLs encountered:', network404s);

  const isFavicon404 = network404s.every(u => u.includes('favicon'));
  console.log('All 404s are favicon (cosmetic):', isFavicon404);
  console.log(`C7: ${isFavicon404 ? 'PASS (favicon 404 is cosmetic)' : 'FAIL (non-favicon 404 found)'}`);

  await browser.close();

  // ======================================================
  // List screenshots created
  // ======================================================
  console.log('\n=== Screenshots created ===');
  const files = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith(PREFIX) && f.endsWith('.png'))
    .sort();
  files.forEach(f => console.log(' ', f));
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
