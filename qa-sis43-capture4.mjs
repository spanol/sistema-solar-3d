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
  await sleep(5000); // let animation stabilize

  // Find planet label positions
  const labelPositions = await page.evaluate(() => {
    const results = {};
    // Labels are spans/divs positioned absolutely over the canvas
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const text = el.textContent?.trim();
      const style = el.getAttribute('style') || '';
      if (text && ['Mercúrio','Vênus','Terra','Marte','Júpiter','Saturno','Urano','Netuno','Sol'].includes(text)
          && (style.includes('position') || el.style.position === 'absolute')) {
        const rect = el.getBoundingClientRect();
        results[text] = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, tag: el.tagName, style: el.style.cssText };
      }
    }
    return results;
  });
  console.log('Label positions:', JSON.stringify(labelPositions, null, 2));

  // Take top view
  await page.screenshot({ path: `${OUT}/qa-sis43-top.png` });
  console.log('TOP saved');

  // If we found Terra, click slightly above its label (where the planet sphere is)
  if (labelPositions['Terra']) {
    const { left, top } = labelPositions['Terra'];
    const clickX = left + 10;
    const clickY = top - 15; // click above the label where the planet sphere is
    console.log(`Clicking Terra at ${clickX}, ${clickY}`);
    await page.mouse.click(clickX, clickY);
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-earth.png` });
    console.log('EARTH saved');

    // Check if front view activated
    const cardVisible = await page.evaluate(() => {
      // Check for info card or changed state
      const card = document.querySelector('[id*="card"], [class*="card"], [class*="info"]');
      return card ? { found: true, text: card.textContent?.substring(0, 100) } : { found: false };
    });
    console.log('Card visible after Terra click:', cardVisible);
  } else {
    console.log('Terra label not found in DOM, trying canvas raycast click...');
    // Fallback: click at typical Terra position in canvas (roughly 3rd orbit)
    await page.mouse.click(780, 480);
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-earth.png` });
    console.log('EARTH saved (canvas click)');
  }

  // Go back
  const backBtnVisible = await page.evaluate(() => {
    const btn = document.getElementById('card-close');
    if (btn) { btn.click(); return true; }
    const backBtns = [...document.querySelectorAll('button')];
    const back = backBtns.find(b => b.textContent.includes('Voltar'));
    if (back) { back.click(); return true; }
    return false;
  });
  console.log('Back button clicked:', backBtnVisible);
  await sleep(3000);

  // Get new label positions after returning
  await sleep(2000);
  const labelPositions2 = await page.evaluate(() => {
    const results = {};
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const text = el.textContent?.trim();
      const style = el.getAttribute('style') || '';
      if (text && ['Saturno'].includes(text)
          && (style.includes('position') || el.style.position === 'absolute')) {
        const rect = el.getBoundingClientRect();
        results[text] = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      }
    }
    return results;
  });
  console.log('Saturn label pos:', JSON.stringify(labelPositions2));

  // Click Saturn
  if (labelPositions2['Saturno']) {
    const { left, top } = labelPositions2['Saturno'];
    const clickX = left + 10;
    const clickY = top - 15;
    console.log(`Clicking Saturno at ${clickX}, ${clickY}`);
    await page.mouse.click(clickX, clickY);
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-saturn.png` });
    console.log('SATURN saved');
  } else {
    // Use previous position from top view
    if (labelPositions['Saturno']) {
      const { left, top } = labelPositions['Saturno'];
      await page.mouse.click(left + 10, top - 15);
      await sleep(4000);
    } else {
      // Fallback to typical Saturn position
      await page.mouse.click(560, 265);
      await sleep(4000);
    }
    await page.screenshot({ path: `${OUT}/qa-sis43-saturn.png` });
    console.log('SATURN saved (fallback)');
  }

  // Mobile
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
