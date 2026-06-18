import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const OUT_DIR = 'D:\\code\\sistema-solar-3d';
const PREFIX = 'qa-sis74-';

function ss(name) {
  return `${OUT_DIR}\\${PREFIX}${name}.png`;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const consoleErrors = [];
  const allConsole = [];
  page.on('console', msg => {
    allConsole.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));
  page.on('response', r => {
    if (!r.ok() && r.status() !== 304) {
      allConsole.push(`[network ${r.status()}] ${r.url()}`);
    }
  });

  console.log('Loading app...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  // Check 404 resource
  console.log('\n--- Network errors (non-2xx/304) ---');
  allConsole.filter(l => l.includes('[network')).forEach(l => console.log(l));

  // =====================================================
  // CRITERION 3: Planet positions actually change
  // =====================================================
  console.log('\n--- CRITERION 3: Planet group 3D positions ---');

  async function getPlanetPositions(page) {
    return await page.evaluate(() => {
      // Access Three.js scene via the global (if exposed) or use label DOM positions
      // Try reading label div inline styles
      const wrap = document.querySelector('[style*="pointer-events"]');
      if (!wrap) return { method: 'no-label-wrap' };

      const children = Array.from(wrap.children);
      const pos = {};
      children.forEach(el => {
        const text = el.textContent.trim();
        if (text && el.style.left) {
          pos[text] = { left: el.style.left, top: el.style.top, opacity: el.style.opacity };
        }
      });
      return { method: 'dom-labels', positions: pos };
    });
  }

  // Wait for animation frame to settle
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise(r => setTimeout(r, 500));

  const todayPos = await getPlanetPositions(page);
  console.log('Today positions:', JSON.stringify(todayPos, null, 2));
  const todayPickerVal = await page.evaluate(() => document.getElementById('date-picker')?.value);
  console.log('Today picker:', todayPickerVal);

  // Change date to 2020-01-15
  await page.evaluate((val) => {
    const dp = document.getElementById('date-picker');
    dp.value = val;
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  }, '2020-01-15');
  await new Promise(r => setTimeout(r, 1500));
  // Wait for render
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  const pos2020 = await getPlanetPositions(page);
  console.log('\n2020-01-15 positions:', JSON.stringify(pos2020, null, 2));

  // Compare: count changed positions
  let changed = 0;
  let total = 0;
  if (todayPos.positions && pos2020.positions) {
    for (const key of Object.keys(todayPos.positions)) {
      if (pos2020.positions[key]) {
        total++;
        if (pos2020.positions[key].left !== todayPos.positions[key].left ||
            pos2020.positions[key].top !== todayPos.positions[key].top) {
          changed++;
          console.log(`  ${key}: TODAY(${todayPos.positions[key].left},${todayPos.positions[key].top}) vs 2020(${pos2020.positions[key].left},${pos2020.positions[key].top})`);
        }
      }
    }
  }
  console.log(`\nChanged: ${changed}/${total} planet labels`);
  const c3pass = changed > 0;
  console.log(`CRITERION 3: ${c3pass ? 'PASS' : 'FAIL'}`);

  await page.screenshot({ path: ss('03b-date-2020'), fullPage: false });

  // =====================================================
  // CRITERION 4: Retrograde badge - more investigation
  // =====================================================
  console.log('\n--- CRITERION 4: Retrograde badge deep check ---');

  // First check if Astronomy library is available
  const astroCheck = await page.evaluate(() => {
    try {
      return {
        hasAstronomy: typeof Astronomy !== 'undefined',
        type: typeof Astronomy
      };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('Astronomy lib check:', astroCheck);

  // Test retrograde at 2022-10-01
  await page.evaluate((val) => {
    const dp = document.getElementById('date-picker');
    dp.value = val;
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  }, '2022-10-01');
  await new Promise(r => setTimeout(r, 1000));

  const badgeState2022 = await page.evaluate(() => {
    const badge = document.getElementById('retrograde-badge');
    return {
      exists: !!badge,
      hidden: badge?.classList.contains('hidden'),
      text: badge?.textContent,
      display: badge ? window.getComputedStyle(badge).display : 'N/A',
      visibility: badge ? window.getComputedStyle(badge).visibility : 'N/A'
    };
  });
  console.log('Badge state at 2022-10-01:', badgeState2022);

  await page.screenshot({ path: ss('04b-retrograde-2022'), fullPage: false });

  // Try mid-October when retrograde is deep (Oct 15, 2022)
  await page.evaluate((val) => {
    const dp = document.getElementById('date-picker');
    dp.value = val;
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  }, '2022-10-15');
  await new Promise(r => setTimeout(r, 800));

  const badgeStateOct15 = await page.evaluate(() => {
    const badge = document.getElementById('retrograde-badge');
    return {
      hidden: badge?.classList.contains('hidden'),
      display: badge ? window.getComputedStyle(badge).display : 'N/A'
    };
  });
  console.log('Badge state at 2022-10-15:', badgeStateOct15);

  // Try to manually run the retrograde check from the page
  const retroManual = await page.evaluate(() => {
    try {
      // Try to compute retrograde check inline
      const d = new Date('2022-10-01T12:00:00Z');
      const dt1 = new Date(d.getTime() + 86400000);
      function geoLon(date) {
        const gv = Astronomy.GeoVector('Mars', date, false);
        const ec = Astronomy.Ecliptic(gv);
        return ec.elon;
      }
      const lon0 = geoLon(d);
      const lon1 = geoLon(dt1);
      let delta = lon1 - lon0;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      return { lon0, lon1, delta, isRetrograde: delta < 0 };
    } catch(e) {
      return { error: e.message, stack: e.stack?.slice(0, 200) };
    }
  });
  console.log('Manual retrograde calc at 2022-10-01:', retroManual);

  await page.screenshot({ path: ss('05b-retrograde-oct15'), fullPage: false });

  const c4pass = badgeState2022.exists && (!badgeState2022.hidden || !badgeStateOct15.hidden);

  // =====================================================
  // CRITERION 6: Front view - click on canvas with raycasting
  // =====================================================
  console.log('\n--- CRITERION 6: Front view via canvas click ---');

  // Reset to today first
  await page.click('#btn-hoje');
  await new Promise(r => setTimeout(r, 800));

  // Get canvas and its dimensions
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
  });
  console.log('Canvas info:', canvasInfo);

  // Try clicking in the middle of the canvas where planets might be
  if (canvasInfo) {
    const centerX = canvasInfo.left + canvasInfo.width / 2;
    const centerY = canvasInfo.top + canvasInfo.height / 2;

    // Try a few positions to hit a planet
    // Planets orbit at different radii — try clicking around
    const clickAttempts = [
      // Center (sun area)
      { x: centerX, y: centerY, label: 'center' },
      // Near orbit areas — try clicking where inner planets are
      { x: centerX + 100, y: centerY - 50, label: 'inner-orbit-NE' },
      { x: centerX - 120, y: centerY + 80, label: 'inner-orbit-SW' },
      { x: centerX + 200, y: centerY - 100, label: 'outer-orbit-NE' },
    ];

    let frontViewAchieved = false;
    for (const attempt of clickAttempts) {
      await page.mouse.click(attempt.x, attempt.y);
      await new Promise(r => setTimeout(r, 1500));

      const viewMode = await page.evaluate(() => {
        // The viewMode variable is module-scoped - check by looking at dateControls
        const dc = document.getElementById('date-controls');
        const card = document.getElementById('planet-card');
        return {
          dateControlsHidden: dc?.classList.contains('hidden'),
          cardVisible: card ? !card.classList.contains('hidden') && window.getComputedStyle(card).display !== 'none' : false
        };
      });

      console.log(`Click at ${attempt.label} (${Math.round(attempt.x)}, ${Math.round(attempt.y)}):`, viewMode);

      if (viewMode.cardVisible || viewMode.dateControlsHidden) {
        frontViewAchieved = true;
        console.log('Front view achieved!');
        await page.screenshot({ path: ss('08b-front-view'), fullPage: false });
        break;
      }
    }

    if (!frontViewAchieved) {
      // Try clicking directly on label elements (they might have pointer events)
      console.log('Trying label-based click...');
      const labelClicked = await page.evaluate(() => {
        // Find any positioned div with planet-like text
        const allDivs = document.querySelectorAll('#app > div > div');
        const labels = Array.from(allDivs).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && el.style.left;
        });
        console.log('Found positioned divs:', labels.length, labels.map(el => el.textContent.trim()).join(', '));
        return labels.length;
      });
      console.log('Positioned divs:', labelClicked);

      // Try using keyboard shortcut (pressing '1' for Mercury)
      await page.keyboard.press('1');
      await new Promise(r => setTimeout(r, 1500));
      const vmAfterKey = await page.evaluate(() => {
        const dc = document.getElementById('date-controls');
        const card = document.getElementById('planet-card');
        return {
          dateControlsHidden: dc?.classList.contains('hidden'),
          cardVisible: card ? !card.classList.contains('hidden') && window.getComputedStyle(card).display !== 'none' : false
        };
      });
      console.log('After pressing 1:', vmAfterKey);
      if (vmAfterKey.cardVisible || vmAfterKey.dateControlsHidden) {
        frontViewAchieved = true;
        await page.screenshot({ path: ss('08c-front-view-key'), fullPage: false });
      }
    }

    const dc6Front = await page.evaluate(() => {
      const dc = document.getElementById('date-controls');
      return {
        hidden: dc?.classList.contains('hidden'),
        display: dc ? window.getComputedStyle(dc).display : 'N/A'
      };
    });

    await page.screenshot({ path: ss('08d-front-state'), fullPage: false });
    console.log('Date controls in front view:', dc6Front);
    const panelHidden = dc6Front.hidden || dc6Front.display === 'none';

    // Go back
    const voltarBtn = await page.$('#card-close');
    let panelBackVisible = false;
    if (voltarBtn) {
      const isVoltarVisible = await page.evaluate(() => {
        const btn = document.getElementById('card-close');
        const rect = btn?.getBoundingClientRect();
        return rect && rect.width > 0;
      });
      if (isVoltarVisible) {
        await voltarBtn.click();
        await new Promise(r => setTimeout(r, 1000));
      }
    } else {
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 1000));
    }

    const dc6Back = await page.evaluate(() => {
      const dc = document.getElementById('date-controls');
      return {
        hidden: dc?.classList.contains('hidden'),
        display: dc ? window.getComputedStyle(dc).display : 'N/A'
      };
    });
    panelBackVisible = !dc6Back.hidden && dc6Back.display !== 'none';
    console.log('Date controls after back:', dc6Back);
    await page.screenshot({ path: ss('09b-back-top'), fullPage: false });

    console.log(`Front view achieved: ${frontViewAchieved}, panel hidden: ${panelHidden}, back visible: ${panelBackVisible}`);
    const c6pass = frontViewAchieved && panelHidden && panelBackVisible;
    console.log(`CRITERION 6: ${c6pass ? 'PASS' : 'FAIL'}`);
  }

  // =====================================================
  // Console errors summary
  // =====================================================
  console.log('\n--- CRITERION 7: Console errors ---');
  console.log('Error count:', consoleErrors.length);
  consoleErrors.forEach(e => console.log(' ERROR:', e));

  // Filter out favicon 404 which is cosmetic
  const realErrors = consoleErrors.filter(e =>
    !e.includes('favicon') && !e.includes('.ico') && !e.includes('favicon.png')
  );
  console.log('Real errors (non-favicon):', realErrors.length);
  realErrors.forEach(e => console.log(' REAL ERROR:', e));
  console.log(`CRITERION 7: ${realErrors.length === 0 ? 'PASS' : 'FAIL'}`);

  await browser.close();
})().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
