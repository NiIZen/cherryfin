// Prüft A–Z-Übersicht und Einstellungen im echten Fenster, mit einer Mediathek von über 5000 Titeln.
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
  args: [project, `--user-data-dir=${userData}`],
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
const tabIds = { Filme: 'lib-movies', Serien: 'lib-shows', Dokumentationen: 'lib-docs' };
const settingsValue = () => page.evaluate(() => JSON.parse(localStorage.getItem('jellytv.settings')));
const row = (label) => page.locator(`.route:not([hidden]) .tab-page:not([hidden]) [data-setting="${label}"]`);

try {
  await page.waitForSelector('.connect-panel', { timeout: 15000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900));
  await page.evaluate(() => {
    localStorage.setItem('jellytv.demoExtra', '5000');
    localStorage.setItem('jellytv.settings', JSON.stringify({ fullscreenPlayback: false }));
  });
  await page.click('text=Demo ansehen');
  await page.waitForSelector('.hero', { timeout: 60000 });
  await wait(800);

  const labels = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((t) => t.getAttribute('aria-label')));
  check('Eigene Bereiche in der Leiste', ['Filme', 'Serien', 'Dokumentationen'].every((l) => labels.includes(l)), labels.join(', '));

  /* ---------- Übersicht ---------- */
  const started = Date.now();
  await clickTab('Filme');
  const P = inPage(tabIds.Filme);
  await page.waitForSelector(`${P} .vrow`, { timeout: 15000 });
  await page.waitForFunction((sel) => /5\.\d{3} Titel/.test(document.querySelector(`${sel} .overview-title span`)?.textContent ?? ''), P, { timeout: 30000 });
  await page.waitForFunction((sel) => document.querySelector(`${sel} [data-letter="Z"]`) && !document.querySelector(`${sel} [data-letter="Z"]`).disabled, P, { timeout: 30000 });
  check('Filme öffnen als Übersicht mit Gesamtzahl', true, `${await page.textContent(`${P} .overview-title span`)}, geladen in ${Date.now() - started} ms`);
  await wait(500);
  await shot('40-overview');

  const dom = await page.evaluate((sel) => ({ cards: document.querySelectorAll(`${sel} .vrow .card`).length, height: document.querySelector(`${sel} .vgrid`).offsetHeight }), P);
  check('Nur sichtbare Karten sind im DOM', dom.cards > 0 && dom.cards < 200, `${dom.cards} Karten bei ${dom.height}px Listenhöhe`);

  const firstHeader = await page.textContent(`${P} .vgrid-header`);
  check('Beginnt mit dem #-Abschnitt', firstHeader === '#', firstHeader);

  // Alphabetische Reihenfolge prüfen, und zwar nach dem Sprung über mehrere Abschnitte
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
  check('Buchstabe M springt zu M-Titeln', afterJump.names.length > 0 && afterJump.names.every((n) => n.startsWith('M')), afterJump.names.slice(0, 3).join(', '));
  check('Der erste M-Titel bekommt den Fokus', afterJump.focus?.startsWith('M'), afterJump.focus);
  const sorted = afterJump.names.every((n, i, all) => i === 0 || all[i - 1].localeCompare(n, 'de') <= 0);
  check('Titel sind alphabetisch sortiert', sorted);

  /* ---------- Schnelle Tastatur über viele Reihen ---------- */
  const before = await page.evaluate(() => Number(document.activeElement.dataset.index));
  await press('ArrowDown', 40, 15);
  await wait(800);
  const moved = await page.evaluate((sel) => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    return { index: Number(el.dataset.index), isCard: el.classList.contains('card'), visible: r.top >= 0 && r.bottom <= innerHeight, cards: document.querySelectorAll(`${sel} .vrow .card`).length };
  }, P);
  check('Fokus überlebt schnelles Scrollen', moved.isCard && moved.index > before + 200, `Index ${before} -> ${moved.index}`);
  check('Fokussierte Karte ist am Ende sichtbar', moved.visible);
  check('DOM bleibt beim Scrollen klein', moved.cards < 200, `${moved.cards} Karten`);

  /* ---------- A–Z-Leiste mit der Tastatur ---------- */
  await press('ArrowRight', 12, 40);
  await wait(200);
  const onRail = await page.evaluate(() => document.activeElement?.classList.contains('alpha-key') && document.activeElement.dataset.letter);
  check('Pfeil rechts erreicht die A–Z-Leiste', Boolean(onRail), onRail);
  const railStart = await page.evaluate((sel) => document.querySelector(`${sel} [data-vscroll]`).scrollTop, P);
  await press('ArrowDown', 3, 120);
  await wait(800);
  const railMoved = await page.evaluate((sel) => ({ top: document.querySelector(`${sel} [data-vscroll]`).scrollTop, letter: document.activeElement?.dataset?.letter }), P);
  check('Leiste scrollt beim Bewegen mit', railMoved.top > railStart, `${onRail} -> ${railMoved.letter}`);
  await shot('42-rail-focus');
  await press('Enter');
  await wait(500);
  const entered = await active();
  check('Enter auf der Leiste führt in die Titel', entered.startsWith(railMoved.letter), entered);

  /* ---------- Detail und zurück ---------- */
  const focusBefore = await page.evaluate(() => ({ index: document.activeElement.dataset.index }));
  const topBefore = await page.evaluate((sel) => document.querySelector(`${sel} [data-vscroll]`).scrollTop, P);
  await press('Enter');
  await page.waitForSelector('.detail-hero', { timeout: 5000 });
  await wait(600);
  await press('Escape');
  await wait(500);
  const back = await page.evaluate((sel) => ({ index: document.activeElement?.dataset?.index, top: document.querySelector(`${sel} [data-vscroll]`).scrollTop, height: document.querySelector(`${sel} .vgrid`).offsetHeight }), P);
  check('Zurück landet auf derselben Karte', back.index === focusBefore.index, `Index ${back.index}`);
  check('Scrollposition bleibt erhalten', Math.abs(back.top - topBefore) < 60, `${Math.round(topBefore)} -> ${Math.round(back.top)}`);

  /* ---------- Sortierung ---------- */
  await page.mouse.move(800, 300);
  await page.evaluate((sel) => { document.querySelector(`${sel} [data-vscroll]`).scrollTop = 0; }, P);
  await wait(300);
  await page.click(`${P} .pill:has-text("Bewertung")`);
  await wait(4000);
  const rated = await page.evaluate((sel) => ({ headers: document.querySelectorAll(`${sel} .vgrid-header`).length, rail: document.querySelector(`${sel} .alpha-rail`) !== null, arrow: document.querySelector(`${sel} .pill.selected .sort-arrow`)?.textContent }), P);
  check('Bewertung: ohne Buchstaben-Abschnitte und ohne Leiste', rated.headers === 0 && !rated.rail, `Pfeil ${rated.arrow}`);
  await page.click(`${P} .pill:has-text("Erscheinungsjahr")`);
  await wait(4000);
  check('Erscheinungsjahr gruppiert nach Jahr', /^\d{4}$/.test(await page.textContent(`${P} .vgrid-header`)), await page.textContent(`${P} .vgrid-header`));
  await page.click(`${P} .pill:has-text("A–Z")`);
  await wait(4000);
  await page.click(`${P} .pill:has-text("A–Z")`);
  await wait(4000);
  const reversed = await page.evaluate((sel) => document.querySelector(`${sel} .vgrid-header`)?.textContent, P);
  check('Zweiter Druck dreht die Richtung um', reversed === 'Z', reversed);
  await page.click(`${P} .pill:has-text("A–Z")`);
  await wait(4000);

  /* ---------- Ansicht-Menü pro Bereich ---------- */
  await page.click(`${P} [data-view-button]`);
  await wait(400);
  check('Ansicht-Menü übernimmt den Fokus', await page.evaluate(() => Boolean(document.activeElement?.closest('.view-panel'))), await active());
  await shot('43-view-panel');
  await page.click('.view-panel [data-setting="Darstellung"]');
  await wait(600);
  await shot('44-list-layout');
  check('Liste wird angezeigt', await page.locator(`${P} .list-entry`).count() > 0);
  const list = await page.evaluate((sel) => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const entries = [...document.querySelectorAll(`${sel} .list-entry`)].slice(0, 4).map((e) => e.getBoundingClientRect());
    const thumb = document.querySelector(`${sel} .list-entry-thumb`).getBoundingClientRect();
    return { thumbRem: thumb.width / rem, heightRem: entries[0].height / rem, overlap: entries.some((r, i) => i > 0 && r.top < entries[i - 1].bottom) };
  }, P);
  check('Listenzeilen haben feste Höhe und überlagern sich nicht', !list.overlap && list.heightRem < 9 && list.thumbRem < 7, JSON.stringify(list));
  await page.click('.view-panel [data-setting="Darstellung"]');
  await page.click('.view-panel [data-setting="Bildformat"]');
  await wait(400);
  await page.click('.view-panel [data-setting="Größe"]');
  await page.click('.view-panel [data-setting="Titel anzeigen"]');
  await wait(600);
  await shot('45-landscape-large');
  const stored = await settingsValue();
  check('Anpassung gilt nur für diesen Bereich', stored.libraryOverrides[tabIds.Filme]?.image === 'landscape' && !stored.libraryOverrides[tabIds.Serien] && stored.library.image === 'poster', JSON.stringify(stored.libraryOverrides[tabIds.Filme]));
  await page.keyboard.press('Escape');
  await wait(400);
  check('Esc schließt das Menü, Fokus zurück auf dem Knopf', await page.evaluate(() => !document.querySelector('.view-panel') && document.activeElement?.hasAttribute('data-view-button')));

  await clickTab('Dokumentationen');
  const D = inPage(tabIds.Dokumentationen);
  await page.waitForSelector(`${D} .vrow`);
  await wait(400);
  await shot('46-docs');
  const docs = await page.evaluate((sel) => ({ count: document.querySelector(`${sel} .overview-title span`).textContent, first: document.querySelector(`${sel} .vrow .card`).getAttribute('aria-label'), image: document.querySelector(`${sel} .vrow .card`).className }), D);
  check('Dokumentationen sind ein eigener Bereich', docs.count === '5 Titel' && docs.first === 'Atlas der Meere', `${docs.count}, beginnt mit ${docs.first}`);
  check('Anpassung von Filme gilt hier nicht', docs.image.includes('card-poster'));

  await clickTab('Serien');
  await page.waitForSelector(`${inPage(tabIds.Serien)} .vrow`);
  check('Serien zeigen alle Titel', (await page.textContent(`${inPage(tabIds.Serien)} .overview-title span`)) === '5 Titel');

  /* ---------- Einstellungen ---------- */
  await clickTab('Einstellungen');
  await shot('47-settings-appearance');

  await page.click('[data-accent="blue"]');
  await wait(300);
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--focus-bg').trim());
  check('Akzentfarbe wirkt sofort', accent === '#0a84ff', accent);
  await page.hover('[data-category="home"]');
  await wait(300);
  await shot('48-accent-blue');

  const remBefore = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await row('Größe der Oberfläche').click();
  await wait(400);
  const remAfter = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check('Oberflächengröße ändert die Skalierung', remAfter > remBefore, `${remBefore.toFixed(1)} -> ${remAfter.toFixed(1)} px`);

  for (const [label, attr, expected] of [['Neigen und Glanz', 'tilt', 'off'], ['Glaseffekt', 'glass', 'off'], ['Animationen', 'motion', 'off'], ['Fortschrittsbalken', 'progress', 'off']]) {
    await row(label).click();
    await wait(150);
    check(`${label} schaltet um`, await page.evaluate((a) => document.documentElement.dataset[a], attr) === expected);
  }
  await wait(300);
  await shot('49-appearance-changed');

  // Tastatur in den Einstellungen
  await page.focus('[data-category="appearance"]');
  await press('ArrowDown');
  await wait(300);
  check('Kategorie wechselt beim Fokussieren', await page.locator('[data-setting="Anzeige"]').count() === 1, await active());
  await press('ArrowRight');
  await wait(200);
  const inPanel = await page.evaluate(() => Boolean(document.activeElement?.closest('.settings-list')));
  check('Pfeil rechts führt in die Optionen', inPanel, await active());
  await press('ArrowLeft');
  await wait(200);
  check('Pfeil links führt zurück zur Kategorie', await page.evaluate(() => document.activeElement?.dataset?.category === 'home'));

  // Startseite anpassen
  await row('Neue Filme').click();
  await page.click('[aria-label="Meine Merkliste nach oben"]');
  await page.click('[aria-label="Meine Merkliste nach oben"]');
  await page.click('[aria-label="Meine Merkliste nach oben"]');
  await wait(200);
  await row('Anzeige').click(); // feststehend
  await row('Anzeige').click(); // aus
  await wait(200);
  await shot('50-settings-home');
  await clickTab('Startseite');
  await wait(600);
  const titles = await page.evaluate(() => [...document.querySelectorAll('[data-tab-page="home"] .row-title')].map((t) => t.textContent));
  check('Reihe „Neue Filme“ ist ausgeblendet', !titles.includes('Neue Filme'), titles.join(' | '));
  check('Merkliste steht jetzt weiter oben', titles.indexOf('Meine Merkliste') < titles.indexOf('Neue Serien'));
  check('Titelbereich ist aus', await page.locator('[data-tab-page="home"] .hero').count() === 0);
  await shot('51-home-custom');

  // Bereiche
  await clickTab('Einstellungen');
  await page.click('[data-category="tabs"]');
  await wait(300);
  await shot('52-settings-tabs');
  await row('Serien').click();
  await page.click('[aria-label="Dokumentationen nach oben"]');
  await page.click('[aria-label="Dokumentationen nach oben"]');
  await wait(400);
  const order = await page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((t) => t.getAttribute('aria-label')));
  check('Serien ausgeblendet, Reihenfolge geändert', !order.includes('Serien') && order.indexOf('Dokumentationen') < order.indexOf('Filme'), order.join(', '));
  const stay = await page.evaluate(() => document.querySelector('.tabbar [aria-current="page"]')?.getAttribute('aria-label'));
  check('Einstellungen bleiben dabei geöffnet', stay === 'Einstellungen', stay);
  
  // Filme von Übersicht auf Reihen, wie früher
  await row('Ansicht: Filme').click();
  await clickTab('Filme');
  await wait(800);
  check('Bereich lässt sich auf Reihen umstellen', await page.locator(`${P} .row`).count() > 0 && await page.locator(`${P} .vgrid`).count() === 0);
  await clickTab('Einstellungen');

  // Dauerhaft und zurücksetzen
  const kept = await settingsValue();
  await page.reload();
  await page.waitForSelector('.connect-panel');
  await wait(400);
  check('Darstellung übersteht einen Neustart', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--focus-bg').trim()) === '#0a84ff' && kept.appearance.tilt === false);
  await shot('53-connect-accent');
  await page.click('text=Demo ansehen');
  await page.waitForSelector('.tabbar', { timeout: 60000 });
  await wait(800);
  await clickTab('Einstellungen');
  await page.click('[data-category="account"]');
  await wait(300);
  await row('reset').click();
  await wait(100);
  check('Zurücksetzen fragt erst nach', (await row('reset').textContent()).includes('Wirklich'));
  await row('reset').click();
  await wait(500);
  const after = await settingsValue();
  check('Alles wieder auf Standard', after.appearance.accent === 'white' && Object.keys(after.libraryOverrides).length === 0 && after.tabs.hidden.length === 0 && await page.evaluate(() => document.documentElement.dataset.glass) === 'on');

  // Kleines Fenster
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 600));
  await wait(500);
  await clickTab('Filme');
  await page.waitForSelector(`${P} .vrow`);
  await wait(600);
  await shot('54-small-window');
  const small = await page.evaluate((sel) => {
    const rail = document.querySelector(`${sel} .alpha-rail`).getBoundingClientRect();
    const last = document.querySelector(`${sel} [data-letter="Z"]`).getBoundingClientRect();
    const card = document.querySelector(`${sel} .vrow`).getBoundingClientRect();
    return { railBottom: Math.round(last.bottom), height: innerHeight, overlap: card.right > rail.left, sc: document.documentElement.scrollWidth <= innerWidth };
  }, P);
  check('A–Z-Leiste passt ins kleine Fenster', small.railBottom <= small.height && !small.overlap && small.sc, JSON.stringify(small));
} catch (error) {
  check('Durchlauf', false, error.message.split('\n').slice(0, 4).join(' | '));
  await shot('99-error2').catch(() => undefined);
} finally {
  console.log(problems.length ? `\nFehler:\n${[...new Set(problems)].join('\n')}` : '\nKeine Konsolenfehler.');
  console.log(`\n${results.filter(Boolean).length}/${results.length} bestanden`);
  await app.close().catch(() => undefined);
  rmSync(userData, { recursive: true, force: true });
}
