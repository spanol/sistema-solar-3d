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

  // Get planet label positions
  const positions = await page.evaluate(() => {
    const results = {};
    for (const el of document.querySelectorAll('*')) {
      const text = el.textContent?.trim();
      if (['Saturno'].includes(text) && el.style.position === 'absolute') {
        const r = el.getBoundingClientRect();
        results[text] = { x: r.left + r.width/2, y: r.top - 20 };
      }
    }
    return results;
  });
  console.log('Planet positions:', positions);

  // Click Saturn sphere (above label)
  if (positions.Saturno) {
    console.log(`Clicking Saturn at ${positions.Saturno.x}, ${positions.Saturno.y}`);
    await page.mouse.click(positions.Saturno.x, positions.Saturno.y);
  } else {
    // Fallback to approximate Saturn position
    await page.mouse.click(580, 260);
  }
  await sleep(5000); // wait for front view to fully render

  // Check if we're in planet view
  const cardText = await page.evaluate(() => {
    const title = document.querySelector('h2, h1, [class*="title"], [id*="card-title"]');
    return title?.textContent?.trim() || 'no title found';
  });
  console.log('Card title after Saturn click:', cardText);

  await page.screenshot({ path: `${OUT}/qa-sis43-saturn.png` });
  console.log('SATURN saved');

  // Navigate back 3 times to reach Terra (Saturn=5, Jupiter=4, Marte=3, Terra=2 → 3 steps back)
  for (let i = 0; i < 3; i++) {
    const anteriorResult = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const anterior = btns.find(b => b.textContent.includes('Anterior'));
      if (anterior) { anterior.click(); return 'clicked Anterior'; }
      return 'Anterior not found';
    });
    console.log(`Step ${i+1}:`, anteriorResult);
    await sleep(4000);

    const title = await page.evaluate(() => {
      // Try to find the planet name in the card
      const allText = document.body.innerText;
      const planetNames = ['Mercúrio','Vênus','Terra','Marte','Júpiter','Saturno','Urano','Netuno','Sol'];
      for (const name of planetNames) {
        const idx = allText.indexOf(name);
        if (idx >= 0 && idx < 200) return name;
      }
      return 'unknown';
    });
    console.log(`After step ${i+1}, current planet:`, title);

    if (title === 'Terra' || title === 'Marte' || title.includes('Terra')) {
      await page.screenshot({ path: `${OUT}/qa-sis43-earth-step${i+1}.png` });
      console.log(`Screenshot saved at step ${i+1}`);
    }
  }

  // Take final screenshot after navigation
  await page.screenshot({ path: `${OUT}/qa-sis43-earth.png` });
  console.log('EARTH saved (after navigation)');

  console.log('\n=== CONSOLE ERRORS ===');
  consoleErrors.forEach(e => console.log('ERROR:', e));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
