import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'D:/code/sistema-solar-3d';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(5000);

  // Top view screenshot
  await page.screenshot({ path: `${OUT}/qa-sis43-top.png` });
  console.log('TOP saved');

  // Use JS to dispatch a click on the Terra planet item in the nav list
  // Find Terra in the planet list and force-click
  const result = await page.evaluate(() => {
    // Find all divs with "Terra" text
    const all = [...document.querySelectorAll('div, li, span, a')];
    const terra = all.find(el => el.textContent.trim() === 'Terra' && el.offsetParent !== null);
    if (terra) {
      terra.click();
      return 'clicked Terra: ' + terra.tagName + ' class=' + terra.className;
    }
    return 'Terra not found';
  });
  console.log('Terra click result:', result);
  await sleep(4000);
  await page.screenshot({ path: `${OUT}/qa-sis43-earth.png` });
  console.log('EARTH saved');

  // Check what's on screen
  const afterTerra = await page.evaluate(() => {
    return [...document.querySelectorAll('h1, h2, h3, .planet-name, [class*="title"]')]
      .map(el => el.textContent.trim()).join(' | ');
  });
  console.log('After Terra click headings:', afterTerra);

  // Go back - click Voltar or press Escape
  const voltarResult = await page.evaluate(() => {
    const all = [...document.querySelectorAll('button')];
    const voltar = all.find(el => el.textContent.includes('Voltar'));
    if (voltar) { voltar.click(); return 'clicked Voltar'; }
    return 'Voltar not found';
  });
  console.log('Voltar result:', voltarResult);
  await sleep(3000);

  // Saturn
  const saturnResult = await page.evaluate(() => {
    const all = [...document.querySelectorAll('div, li, span, a')];
    const saturn = all.find(el => el.textContent.trim() === 'Saturno' && el.offsetParent !== null);
    if (saturn) {
      saturn.click();
      return 'clicked Saturno: ' + saturn.tagName + ' class=' + saturn.className;
    }
    return 'Saturno not found';
  });
  console.log('Saturn click result:', saturnResult);
  await sleep(4000);
  await page.screenshot({ path: `${OUT}/qa-sis43-saturn.png` });
  console.log('SATURN saved');

  // Mobile screenshot
  await browser.close();
  const b2 = await chromium.launch({ headless: true });
  const c2 = await b2.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await c2.newPage();
  await p2.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);
  await p2.screenshot({ path: `${OUT}/qa-sis43-mobile.png` });
  console.log('MOBILE saved');
  await b2.close();

  console.log('\n=== CONSOLE ERRORS ===');
  consoleErrors.forEach(e => console.log('ERROR:', e));
  console.log('\nDone!');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
