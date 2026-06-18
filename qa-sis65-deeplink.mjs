/**
 * QA SIS-65 — Deep-link state in URL (SIS-55, commit 43c6345)
 * Final version: correct button IDs, 4s wait for S4, canvas-sweep for S2.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const RESULTS = [];
const SCREENSHOTS = [];

const pass = (id, note) => { console.log(`✅ PASS  [${id}] ${note}`); RESULTS.push({ id, status: 'PASS', note }); };
const fail = (id, note) => { console.log(`❌ FAIL  [${id}] ${note}`); RESULTS.push({ id, status: 'FAIL', note }); };
const warn = (id, note) => { console.log(`⚠️  WARN  [${id}] ${note}`); RESULTS.push({ id, status: 'WARN', note }); };

async function shot(page, label) {
  const f = `qa-sis65-${label}.png`;
  await page.screenshot({ path: f });
  SCREENSHOTS.push(f);
  return f;
}

async function waitReady(page, ms = 3000) {
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return c && c.width > 0;
  }, { timeout: 10000 });
  await page.waitForTimeout(ms);
}

const getHash   = p => p.evaluate(() => location.hash);
const getState  = (p, id) => p.evaluate(id => {
  const el = document.getElementById(id);
  return el ? el.getAttribute('aria-pressed') : 'NOT_FOUND';
}, id);
const getCardName = p => p.evaluate(() => {
  const el = document.getElementById('card-name');
  if (!el) return null;
  return el.offsetParent !== null ? el.textContent.trim() : null;
});
// Keyboard event via document (module-scope listener picks it up)
const pressKey  = (p, key) => p.evaluate(key =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
, key);
// JS click (bypasses canvas pointer-event interception)
const clickById = (p, id) => p.evaluate(id => {
  const el = document.getElementById(id);
  if (el) { el.click(); return true; }
  return false;
}, id);
// Fire a canvas MouseEvent at (cx, cy) in client coords
const canvasClick = (p, cx, cy) => p.evaluate(([cx, cy]) => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  canvas.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
  return true;
}, [cx, cy]);

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();

  const allErrors = [];
  page.on('console', m => { if (m.type() === 'error') allErrors.push(m.text()); });
  page.on('pageerror', e => allErrors.push(`PAGE: ${e.message}`));

  // -----------------------------------------------------------------------
  // S1 — Restore from full hash on load
  // -----------------------------------------------------------------------
  console.log('\n=== S1: Restore from hash ===');
  await page.goto(`${BASE}/#planet=mars&orbits=0&labels=1&speed=2`);
  await waitReady(page, 3000);
  await shot(page, 'S1-load');

  const h1    = await getHash(page);
  const name1 = await getCardName(page);
  const orb1  = await getState(page, 'ctrl-orbits');
  const lbl1  = await getState(page, 'ctrl-labels');
  const rot1  = await getState(page, 'ctrl-rotation');

  console.log(`  hash="${h1}"\n  card="${name1}", orbits=${orb1}, labels=${lbl1}, rot=${rot1}`);

  name1 && /marte/i.test(name1)
    ? pass('S1-planet', `Mars card: "${name1}"`)
    : fail('S1-planet', `Expected Marte, got "${name1}"`);
  orb1 === 'false' ? pass('S1-orbits', 'orbits hidden') : fail('S1-orbits', `aria-pressed="${orb1}"`);
  lbl1 === 'true'  ? pass('S1-labels', 'labels active') : fail('S1-labels', `aria-pressed="${lbl1}"`);
  rot1 === 'true'  ? pass('S1-speed',  'rotation on (speed=2 > 0)') : fail('S1-speed', `aria-pressed="${rot1}"`);

  // -----------------------------------------------------------------------
  // S2 — Planet selection updates hash
  // -----------------------------------------------------------------------
  console.log('\n=== S2: Planet selection updates hash ===');
  await page.goto(`${BASE}/`);
  await waitReady(page, 2500); // extra time for animation loop to settle

  const h2before = await getHash(page);
  console.log(`  initial hash: "${h2before}"`);

  // Sweep canvas in a grid from center to find a planet mesh
  // Camera is at (0,130,32) in top view; sun projects near center.
  // Planets are evenly spaced in orbit so try offsets 30–250px from center.
  const hit2 = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angles = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2);
    const radii  = [35, 55, 75, 100, 125, 155, 185, 215, 250];
    for (const r of radii) {
      for (const a of angles) {
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
        if (location.hash.includes('planet=')) return location.hash;
      }
    }
    return null;
  });

  if (hit2) {
    pass('S2', `hash updated after canvas click: "${hit2}"`);
  } else {
    // Last-resort: check if any hash appeared
    const h2 = await getHash(page);
    h2.includes('planet=')
      ? pass('S2', `hash has planet: "${h2}"`)
      : fail('S2', `no planet hit via canvas sweep. hash="${h2}". Planets may not be at expected positions.`);
  }
  await shot(page, 'S2-after-click');

  // -----------------------------------------------------------------------
  // S3 — Toggle buttons update hash
  // -----------------------------------------------------------------------
  console.log('\n=== S3: Toggle buttons update hash ===');
  await page.goto(`${BASE}/`);
  await waitReady(page, 1500);

  await clickById(page, 'ctrl-orbits');
  await page.waitForTimeout(200);
  const h3a = await getHash(page);
  console.log(`  after orbits toggle: "${h3a}"`);
  h3a.includes('orbits=')
    ? pass('S3-orbits', `orbits in hash: "${h3a}"`)
    : fail('S3-orbits', `orbits not in hash: "${h3a}"`);

  await clickById(page, 'ctrl-labels');
  await page.waitForTimeout(200);
  const h3b = await getHash(page);
  console.log(`  after labels toggle: "${h3b}"`);
  h3b.includes('labels=')
    ? pass('S3-labels', `labels in hash: "${h3b}"`)
    : fail('S3-labels', `labels not in hash: "${h3b}"`);

  await clickById(page, 'ctrl-rotation');
  await page.waitForTimeout(200);
  const h3c = await getHash(page);
  console.log(`  after rotation toggle: "${h3c}"`);
  h3c.includes('speed=')
    ? pass('S3-speed', `speed in hash: "${h3c}"`)
    : fail('S3-speed', `speed not in hash: "${h3c}"`);

  await shot(page, 'S3-toggles');

  // -----------------------------------------------------------------------
  // S4 — Escape removes planet= from hash
  // (Debug session confirmed: after 3s wait, Escape correctly removes planet=)
  // -----------------------------------------------------------------------
  console.log('\n=== S4: Escape removes planet from hash ===');
  // Navigate via about:blank to force a full page reload (same-origin hash-only
  // changes don't trigger a reload, so restoreFromHash() wouldn't re-run otherwise)
  await page.goto('about:blank');
  await page.goto(`${BASE}/#planet=venus&orbits=1&labels=1&speed=1`);
  await waitReady(page, 4000);
  await shot(page, 'S4-before-escape');

  const h4pre = await getHash(page);
  const orb4  = await getState(page, 'ctrl-orbits');
  console.log(`  hash before Escape: "${h4pre}", ctrl-orbits="${orb4}"`);

  await pressKey(page, 'Escape');
  await page.waitForTimeout(2000);
  await shot(page, 'S4-after-escape');

  const h4esc = await getHash(page);
  console.log(`  hash after Escape: "${h4esc}"`);
  !h4esc.includes('planet=')
    ? pass('S4-escape', `planet= removed: "${h4esc}"`)
    : fail('S4-escape', `planet= still present: "${h4esc}"`);

  // Also verify close button (← Voltar) removes planet=
  await page.goto('about:blank');
  await page.goto(`${BASE}/#planet=venus&orbits=1&labels=1&speed=1`);
  await waitReady(page, 4000);
  await clickById(page, 'card-close');
  await page.waitForTimeout(2000);
  const h4close = await getHash(page);
  console.log(`  hash after close button: "${h4close}"`);
  !h4close.includes('planet=')
    ? pass('S4-close-btn', `planet= removed via close button: "${h4close}"`)
    : fail('S4-close-btn', `planet= still present after close: "${h4close}"`);

  // -----------------------------------------------------------------------
  // S5 — Reload with hash restores state
  // -----------------------------------------------------------------------
  console.log('\n=== S5: Reload restores state ===');
  await page.goto(`${BASE}/#planet=saturn&orbits=0&labels=0&speed=0`);
  await waitReady(page, 3000);
  await shot(page, 'S5-first-load');

  await page.reload();
  await waitReady(page, 3000);
  await shot(page, 'S5-after-reload');

  const h5    = await getHash(page);
  const name5 = await getCardName(page);
  const orb5  = await getState(page, 'ctrl-orbits');
  const lbl5  = await getState(page, 'ctrl-labels');
  const rot5  = await getState(page, 'ctrl-rotation');

  console.log(`  hash="${h5}"\n  card="${name5}", orbits=${orb5}, labels=${lbl5}, rot=${rot5}`);

  name5 && /saturno|saturn/i.test(name5)
    ? pass('S5-planet', `Saturn after reload: "${name5}"`)
    : fail('S5-planet', `Expected Saturn, got "${name5}"`);
  orb5 === 'false' ? pass('S5-orbits', 'orbits hidden after reload') : fail('S5-orbits', `orbits="${orb5}"`);
  lbl5 === 'false' ? pass('S5-labels', 'labels hidden after reload') : fail('S5-labels', `labels="${lbl5}"`);
  rot5 === 'false' ? pass('S5-speed',  'rotation stopped after reload') : fail('S5-speed', `rot="${rot5}"`);

  // -----------------------------------------------------------------------
  // S6 — Arrow navigation (prev/next) updates hash
  // -----------------------------------------------------------------------
  console.log('\n=== S6: Arrow navigation updates hash ===');
  await page.goto('about:blank');
  await page.goto(`${BASE}/#planet=earth&orbits=1&labels=1&speed=1`);
  await waitReady(page, 3000);

  const h6start = await getHash(page);
  const n6start = await getCardName(page);
  console.log(`  start: hash="${h6start}", card="${n6start}"`);

  await clickById(page, 'card-next');
  await page.waitForTimeout(3000); // allow camera animation to complete
  const h6next = await getHash(page);
  const n6next = await getCardName(page);
  console.log(`  after Next: hash="${h6next}", card="${n6next}"`);

  h6next.includes('planet=') && h6next !== h6start
    ? pass('S6-next', `hash changed after Next: "${h6next}"`)
    : fail('S6-next', `Before="${h6start}", After="${h6next}"`);

  await clickById(page, 'card-prev');
  await page.waitForTimeout(3000);
  const h6prev = await getHash(page);
  const n6prev = await getCardName(page);
  console.log(`  after Prev: hash="${h6prev}", card="${n6prev}"`);

  h6prev.includes('planet=') && h6prev !== h6next
    ? pass('S6-prev', `hash changed after Prev: "${h6prev}"`)
    : fail('S6-prev', `Before="${h6next}", After="${h6prev}"`);

  await shot(page, 'S6-arrows');

  // -----------------------------------------------------------------------
  // S7 — Zero console errors (fresh page, clean load)
  // -----------------------------------------------------------------------
  console.log('\n=== S7: Console errors ===');
  const p7 = await ctx.newPage();
  const freshErrors = [];
  p7.on('console', m => { if (m.type() === 'error') freshErrors.push(m.text()); });
  p7.on('pageerror', e => freshErrors.push(`PAGE: ${e.message}`));
  await p7.goto(`${BASE}/#planet=mars&orbits=0&labels=1&speed=2`);
  await waitReady(p7, 2000);
  await p7.close();

  const relevant = [...allErrors, ...freshErrors].filter(e =>
    !e.includes('favicon') && !e.includes('Console Ninja') && !e.includes('[vite]')
  );
  relevant.length === 0
    ? pass('S7-errors', 'Zero console errors')
    : fail('S7-errors', `${relevant.length} error(s): ${relevant.slice(0, 3).join(' | ')}`);

  // -----------------------------------------------------------------------
  // Bonus: Mobile 390×844
  // -----------------------------------------------------------------------
  console.log('\n=== Bonus: Mobile ===');
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(`${BASE}/#planet=mars&orbits=0&labels=1&speed=2`);
  await waitReady(mob, 3000);
  await shot(mob, 'mobile');
  const hmob   = await getHash(mob);
  const nmob   = await getCardName(mob);
  const orbmob = await getState(mob, 'ctrl-orbits');
  console.log(`  mobile: hash="${hmob}", card="${nmob}", orbits=${orbmob}`);
  hmob.includes('planet=mars') && /marte/i.test(nmob || '')
    ? pass('S7-mobile', `Mobile: hash ok, card="${nmob}"`)
    : warn('S7-mobile', `Mobile: hash="${hmob}", card="${nmob}"`);
  await mob.close();

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  await browser.close();

  const np = RESULTS.filter(r => r.status === 'PASS').length;
  const nf = RESULTS.filter(r => r.status === 'FAIL').length;
  const nw = RESULTS.filter(r => r.status === 'WARN').length;

  console.log(`\n${'='.repeat(65)}`);
  console.log(`SIS-65 QA (SIS-55 deep-link): ${np} PASS | ${nf} FAIL | ${nw} WARN`);
  console.log('='.repeat(65));
  RESULTS.forEach(r => {
    const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ' }[r.status];
    console.log(`${icon} [${r.id}] ${r.note}`);
  });
  if (relevant.length) {
    console.log('\nConsole errors:');
    relevant.forEach(e => console.log('  -', e));
  }

  writeFileSync('qa-sis65-results.json', JSON.stringify({
    summary: { passed: np, failed: nf, warned: nw },
    results: RESULTS,
    consoleErrors: relevant,
    screenshots: SCREENSHOTS,
  }, null, 2));

  console.log('\nResults → qa-sis65-results.json');
  console.log('Screenshots:', SCREENSHOTS.join(', '));
  process.exit(nf > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
