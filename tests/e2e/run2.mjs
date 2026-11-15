// Checks the A–Z overview and the settings in the real window, with a library of more than 5000 titles.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';

const project = process.argv[2];
const shots = path.join(import.meta.dirname, 'shots');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== '' ? ` -> ${detail}` : ''}`);
};

const userData = mkdtempSync(path.join(os.tmpdir(), 'jellytv-e2e-'));
const app = await electron.launch({
  executablePath: path.join(project, 'node_modules/electron/dist/electron.exe'),
  args: [project, '--lang=en-US', `--user-data-dir=${userData}`],
  cwd: project,
});
const page = await app.firstWindow();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const press = async (key, times = 1, gap = 90) => { for (let i = 0; i < times; i++) { await page.keyboard.press(key); await wait(gap); } };
const clickTab = async (label) => { await page.mouse.move(800, 20); await wait(450); await page.click(`.tabbar [aria-label="${label}"]`); await wait(500); };
const active = () => page.evaluate(() => { const el = document.activeElement; return el?.getAttribute('aria-label') || el?.dataset?.letter || el?.textContent?.trim().slice(0, 40) || el?.tagName; });
const inPage = (label) => `[data-tab-page="${label}"]`;
const tabIds = { movies: 'lib-movies', shows: 'lib-shows', documentaries: 'lib-docs' };
const settingsValue = () => page.evaluate(() => JSON.parse(localStorage.getItem('jellytv.settings')));
const row = (label) => page.locator(`.route:not([hidden]) .tab-page:not([hidden]) [data-setting="${label}"]`);

try {
  await page.waitForSelector('.connect-panel', { timeout: 15000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900));
  await page.evaluate(() => {
    localStorage.setItem('jellytv.demoExtra', '5000');
    localStorage.setItem('jellytv.settings', JSON.stringify({ fullscreenPlayback: false }));
  });
  await page.click('text=Try the demo');
  await page.waitForSelector('.hero', { timeout: 60000 });
  await wait(800);

  const labels = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((t) => t.getAttribute('aria-label')));
  check('Own sections in the bar', ['Movies', 'Shows', 'Documentaries'].every((l) => labels.includes(l)), labels.join(', '));

  /* ---------- Overview ---------- */
  const started = Date.now();
  await clickTab('Movies');
  const P = inPage(tabIds.movies);
  await page.waitForSelector(`${P} .vrow`, { timeout: 15000 });
  await page.waitForFunction((sel) => /5,\d{3} titles/.test(document.querySelector(`${sel} .overview-title span`)?.textContent ?? ''), P, { timeout: 30000 });
  await page.waitForFunction((sel) => document.querySelector(`${sel} [data-letter="Z"]`) && !document.querySelector(`${sel} [data-letter="Z"]`).disabled, P, { timeout: 30000 });
  check('Movies open as an overview with the total', true, `${await page.textContent(`${P} .overview-title span`)}, geladen in ${Date.now() - started} ms`);
  await wait(500);
  await shot('40-overview');

  const dom = await page.evaluate((sel) => ({ cards: document.querySelectorAll(`${sel} .vrow .card`).length, height: document.querySelector(`${sel} .vgrid`).offsetHeight }), P);
  check('Only visible cards are in the DOM', dom.cards > 0 && dom.cards < 200, `${dom.cards} cards at ${dom.height}px list height`);

  const firstHeader = await page.textContent(`${P} .vgrid-header`);
  check('Starts with the # section', firstHeader === '#', firstHeader);

  // Check the alphabetical order, after a jump across several sections
  await page.mouse.move(1570, 400);
  await wait(200);
  await page.click(`${P} [data-letter="M"]`);
  await wait(900);
  await shot('41-letter-m');
  const afterJump = await page.evaluate((sel) => {
    const page = document.querySelector(`${sel} [data-vscroll]`);
    const cards = [...document.querySelectorAll(`${sel} .vrow .card`)].filter((c) => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 200; });
    return { scroll: page.scrollTop, names: cards.map((c) => c.getAttribute('aria-label')), focus: document.activeElement?.getAttribute('aria-label') };
  }, P);
  check('Letter M jumps to M titles', afterJump.names.length > 0 && afterJump.names.every((n) => n.startsWith('M')), afterJump.names.slice(0, 3).join(', '));
  check('The first M title gets the focus', afterJump.focus?.startsWith('M'), afterJump.focus);
  const sorted = afterJump.names.every((n, i, all) => i === 0 || all[i - 1].localeCompare(n, 'de') <= 0);
  check('Titles are sorted alphabetically', sorted);

  /* ---------- Fast keyboard across many rows ---------- */
  const before = await page.evaluate(() => Number(document.activeElement.dataset.index));
  await press('ArrowDown', 40, 15);
  await wait(800);
  const moved = await page.evaluate((sel) => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    return { index: Number(el.dataset.index), isCard: el.classList.contains('card'), visible: r.top >= 0 && r.bottom <= innerHeight, cards: document.querySelectorAll(`${sel} .vrow .card`).length };
  }, P);
  check('Focus survives fast scrolling', moved.isCard && moved.index > before + 200, `Index ${before} -> ${moved.index}`);
  check('Focused card is visible at the end', moved.visible);
  check('DOM stays small while scrolling', moved.cards < 200, `${moved.cards} Karten`);

  /* ---------- A–Z bar with the keyboard ---------- */
  await press('ArrowRight', 12, 40);
  await wait(200);
  const onRail = await page.evaluate(() => document.activeElement?.classList.contains('alpha-key') && document.activeElement.dataset.letter);
  check('Arrow right reaches the A–Z bar', Boolean(onRail), onRail);
  const railStart = await page.evaluate((sel) => document.querySelector(`${sel} [data-vscroll]`).scrollTop, P);
  await press('ArrowDown', 3, 120);
  await wait(800);
  const railMoved = await page.evaluate((sel) => ({ top: document.querySelector(`${sel} [data-vscroll]`).scrollTop, letter: document.activeElement?.dataset?.letter }), P);
  check('Bar scrolls along while moving', railMoved.top > railStart, `${onRail} -> ${railMoved.letter}`);
  await shot('42-rail-focus');
  await press('Enter');
  await wait(500);
  const entered = await active();
  check('Enter on the bar leads into the titles', entered.startsWith(railMoved.letter), entered);

  /* ---------- Detail and back ---------- */
  const focusBefore = await page.evaluate(() => ({ index: document.activeElement.dataset.index }));
  const topBefore = await page.evaluate((sel) => document.querySelector(`${sel} [data-vscroll]`).scrollTop, P);
  await press('Enter');
  await page.waitForSelector('.detail-hero', { timeout: 5000 });
  await wait(600);
  await press('Escape');
  await wait(500);
  const back = await page.evaluate((sel) => ({ index: document.activeElement?.dataset?.index, top: document.querySelector(`${sel} [data-vscroll]`).scrollTop, height: document.querySelector(`${sel} .vgrid`).offsetHeight }), P);
  check('Back lands on the same card', back.index === focusBefore.index, `Index ${back.index}`);
  check('Scroll position is kept', Math.abs(back.top - topBefore) < 60, `${Math.round(topBefore)} -> ${Math.round(back.top)}`);

  /* ---------- Sorting ---------- */
  await page.mouse.move(800, 300);
  await page.evaluate((sel) => { document.querySelector(`${sel} [data-vscroll]`).scrollTop = 0; }, P);
  await wait(300);
  await page.click(`${P} .pill:has-text("Rating")`);
  await wait(4000);
  const rated = await page.evaluate((sel) => ({ headers: document.querySelectorAll(`${sel} .vgrid-header`).length, rail: document.querySelector(`${sel} .alpha-rail`) !== null, arrow: document.querySelector(`${sel} .pill.selected .sort-arrow`)?.textContent }), P);
  check('Rating: without letter sections and without the bar', rated.headers === 0 && !rated.rail, `Pfeil ${rated.arrow}`);
  await page.click(`${P} .pill:has-text("Release year")`);
  await wait(4000);
  check('Release year groups by year', /^\d{4}$/.test(await page.textContent(`${P} .vgrid-header`)), await page.textContent(`${P} .vgrid-header`));
  await page.click(`${P} .pill:has-text("A–Z")`);
  await wait(4000);
  await page.click(`${P} .pill:has-text("A–Z")`);
  await wait(4000);
  const reversed = await page.evaluate((sel) => document.querySelector(`${sel} .vgrid-header`)?.textContent, P);
  check('Second press reverses the direction', reversed === 'Z', reversed);
  await page.click(`${P} .pill:has-text("A–Z")`);
  await wait(4000);

  /* ---------- View menu per section ---------- */
  await page.click(`${P} [data-view-button]`);
  await wait(400);
  check('View menu takes the focus', await page.evaluate(() => Boolean(document.activeElement?.closest('.view-panel'))), await active());
  await shot('43-view-panel');
  await page.click('.view-panel [data-setting="Layout"]');
  await wait(600);
  await shot('44-list-layout');
  check('List is shown', await page.locator(`${P} .list-entry`).count() > 0);
  const list = await page.evaluate((sel) => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const entries = [...document.querySelectorAll(`${sel} .list-entry`)].slice(0, 4).map((e) => e.getBoundingClientRect());
    const thumb = document.querySelector(`${sel} .list-entry-thumb`).getBoundingClientRect();
    return { thumbRem: thumb.width / rem, heightRem: entries[0].height / rem, overlap: entries.some((r, i) => i > 0 && r.top < entries[i - 1].bottom) };
  }, P);
  check('List rows have a fixed height and do not overlap', !list.overlap && list.heightRem < 9 && list.thumbRem < 7, JSON.stringify(list));
  await page.click('.view-panel [data-setting="Layout"]');
  await page.click('.view-panel [data-setting=\"Image format\"]');
  await wait(400);
  await page.click('.view-panel [data-setting=\"Size\"]');
  await page.click('.view-panel [data-setting=\"Show titles\"]');
  await wait(600);
  await shot('45-landscape-large');
  const stored = await settingsValue();
  check('Adjustment only applies to this section', stored.libraryOverrides[tabIds.movies]?.image === 'landscape' && !stored.libraryOverrides[tabIds.shows] && stored.library.image === 'poster', JSON.stringify(stored.libraryOverrides[tabIds.movies]));
  await page.keyboard.press('Escape');
  await wait(400);
  check('Esc closes the menu, focus back on the button', await page.evaluate(() => !document.querySelector('.view-panel') && document.activeElement?.hasAttribute('data-view-button')));

  await clickTab('Documentaries');
  const D = inPage(tabIds.documentaries);
  await page.waitForSelector(`${D} .vrow`);
  await wait(400);
  await shot('46-docs');
  const docs = await page.evaluate((sel) => ({ count: document.querySelector(`${sel} .overview-title span`).textContent, first: document.querySelector(`${sel} .vrow .card`).getAttribute('aria-label'), image: document.querySelector(`${sel} .vrow .card`).className }), D);
  check('Documentaries are a section of their own', docs.count === '5 titles' && docs.first === 'Atlas of the Seas', `${docs.count}, starts with ${docs.first}`);
  check('The Movies adjustment does not apply here', docs.image.includes('card-poster'));

  await clickTab('Shows');
  await page.waitForSelector(`${inPage(tabIds.shows)} .vrow`);
  check('Shows show all titles', (await page.textContent(`${inPage(tabIds.shows)} .overview-title span`)) === '5 titles');

  /* ---------- Settings ---------- */
  await clickTab('Settings');
  await shot('47-settings-appearance');

  await page.click('[data-accent="blue"]');
  await wait(300);
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--focus-bg').trim());
  check('Accent color takes effect at once', accent === '#0a84ff', accent);
  await page.hover('[data-category="home"]');
  await wait(300);
  await shot('48-accent-blue');

  const remBefore = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await row('Interface size').click();
  await wait(400);
  const remAfter = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check('Interface size changes the scaling', remAfter > remBefore, `${remBefore.toFixed(1)} -> ${remAfter.toFixed(1)} px`);

  for (const [label, attr, expected] of [['Tilt and shine', 'tilt', 'off'], ['Glass effect', 'glass', 'off'], ['Animations', 'motion', 'off'], ['Progress bars', 'progress', 'off']]) {
    await row(label).click();
    await wait(150);
    check(`${label} schaltet um`, await page.evaluate((a) => document.documentElement.dataset[a], attr) === expected);
  }
  await wait(300);
  await shot('49-appearance-changed');

  // Keyboard in the settings
  await page.focus('[data-category="appearance"]');
  await press('ArrowDown');
  await wait(300);
  check('Category switches on focus', await page.locator('[data-setting=\"Display\"]').count() === 1, await active());
  await press('ArrowRight');
  await wait(200);
  const inPanel = await page.evaluate(() => Boolean(document.activeElement?.closest('.settings-list')));
  check('Arrow right leads into the options', inPanel, await active());
  await press('ArrowLeft');
  await wait(200);
  check('Arrow left leads back to the category', await page.evaluate(() => document.activeElement?.dataset?.category === 'home'));

  // Customize the home screen
  await row('New movies').click();
  await page.click('[aria-label="Move My list up"]');
  await page.click('[aria-label="Move My list up"]');
  await page.click('[aria-label="Move My list up"]');
  await wait(200);
  await row('Display').click(); // fixed
  await row('Display').click(); // off
  await wait(200);
  await shot('50-settings-home');
  await clickTab('Home');
  await wait(600);
  const titles = await page.evaluate(() => [...document.querySelectorAll('[data-tab-page="home"] .row-title')].map((t) => t.textContent));
  check('Row "New movies" is hidden', !titles.includes('New movies'), titles.join(' | '));
  check('My list is now higher up', titles.indexOf('My list') < titles.indexOf('New shows'));
  check('Header is off', await page.locator('[data-tab-page="home"] .hero').count() === 0);
  await shot('51-home-custom');

  // Sections
  await clickTab('Settings');
  await page.click('[data-category="tabs"]');
  await wait(300);
  await shot('52-settings-tabs');
  await row('Shows').click();
  await page.click('[aria-label="Move Documentaries up"]');
  await page.click('[aria-label="Move Documentaries up"]');
  await wait(400);
  const order = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((t) => t.getAttribute('aria-label')));
  check('Shows hidden, order changed', !order.includes('Shows') && order.indexOf('Documentaries') < order.indexOf('Movies'), order.join(', '));
  const stay = await page.evaluate(() => document.querySelector('.tabbar [aria-current="page"]')?.getAttribute('aria-label'));
  check('Settings stay open meanwhile', stay === 'Settings', stay);
  
  // Movies from overview to rows, as before
  await row('View: Movies').click();
  await clickTab('Movies');
  await wait(800);
  check('Section can be switched to rows', await page.locator(`${P} .row`).count() > 0 && await page.locator(`${P} .vgrid`).count() === 0);
  await clickTab('Settings');

  // Persistent, then reset
  const kept = await settingsValue();
  await page.reload();
  await page.waitForSelector('.connect-panel');
  await wait(400);
  check('Appearance survives a restart', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--focus-bg').trim()) === '#0a84ff' && kept.appearance.tilt === false);
  await shot('53-connect-accent');
  await page.click('text=Try the demo');
  await page.waitForSelector('.tabbar', { timeout: 60000 });
  await wait(800);
  await clickTab('Settings');
  await page.click('[data-category="account"]');
  await wait(300);
  await row('reset').click();
  await wait(100);
  check('Reset asks first', (await row('reset').textContent()).includes('Really'));
  await row('reset').click();
  await wait(500);
  const after = await settingsValue();
  check('Everything back to default', after.appearance.accent === 'white' && Object.keys(after.libraryOverrides).length === 0 && after.tabs.hidden.length === 0 && await page.evaluate(() => document.documentElement.dataset.glass) === 'on');

  // Small window
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 600));
  await wait(500);
  await clickTab('Movies');
  await page.waitForSelector(`${P} .vrow`);
  await wait(600);
  await shot('54-small-window');
  const small = await page.evaluate((sel) => {
    const rail = document.querySelector(`${sel} .alpha-rail`).getBoundingClientRect();
    const last = document.querySelector(`${sel} [data-letter="Z"]`).getBoundingClientRect();
    const card = document.querySelector(`${sel} .vrow`).getBoundingClientRect();
    return { railBottom: Math.round(last.bottom), height: innerHeight, overlap: card.right > rail.left, sc: document.documentElement.scrollWidth <= innerWidth };
  }, P);
  check('A–Z bar fits in the small window', small.railBottom <= small.height && !small.overlap && small.sc, JSON.stringify(small));
} catch (error) {
  check('Run', false, error.message.split('\n').slice(0, 4).join(' | '));
  await shot('99-error2').catch(() => undefined);
} finally {
  console.log(problems.length ? `\nFehler:\n${[...new Set(problems)].join('\n')}` : '\nKeine Konsolenfehler.');
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  await app.close().catch(() => undefined);
  rmSync(userData, { recursive: true, force: true });
}
