import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';

const project = process.argv[2];
const shots = path.join(import.meta.dirname, 'shots');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` -> ${detail}` : ''}`);
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
const press = async (key, times = 1) => { for (let i = 0; i < times; i++) { await page.keyboard.press(key); await wait(90); } };
const clickTab = async (selector) => { await page.mouse.move(800, 20); await wait(450); await page.click(selector); };
const active = () => page.evaluate(() => {
  const el = document.activeElement;
  return el?.getAttribute('aria-label') || el?.textContent?.trim().slice(0, 40) || el?.tagName;
});

try {
  await page.waitForSelector('.connect-panel', { timeout: 15000 });
  await wait(600);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900));
  await wait(300);
  await shot('01-connect');
  check('Serverfeld hat den ersten Fokus', await page.evaluate(() => document.activeElement?.classList.contains('text-field')));

  // Fehlerfall: nicht erreichbarer Server
  await page.keyboard.type('127.0.0.1:59999');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.form-error', { timeout: 15000 });
  check('Unerreichbarer Server zeigt Meldung', true, await page.textContent('.form-error'));
  await shot('02-connect-error');

  // Fullscreen im Test abschalten, sonst übernimmt das Fenster den Bildschirm.
  await page.evaluate(() => localStorage.setItem('jellytv.settings', JSON.stringify({ fullscreenPlayback: false })));
  await page.click('text=Demo ansehen');
  await page.waitForSelector('.hero', { timeout: 10000 });
  await wait(1500);
  await shot('03-home');
  check('Hero-Knopf hat den Fokus', (await active()).includes('Abspielen') || (await active()).includes('Ansehen'), await active());

  await page.mouse.move(500, 700);
  await wait(200);
  await page.evaluate(() => document.querySelector('.hero .btn-primary').focus());
  await press('ArrowDown');
  await wait(800);
  await press('ArrowRight');
  await wait(700);
  await shot('04-row-focus');
  check('Pfeil runter führt in die erste Reihe', await page.evaluate(() => document.activeElement?.classList.contains('card')), await active());

  await press('ArrowDown');
  await press('ArrowRight', 7);
  await wait(900);
  await shot('05-poster-row');
  const scrolled = await page.evaluate(() => document.activeElement.closest('[data-hscroll]').scrollLeft);
  check('Reihe scrollt mit dem Fokus', scrolled > 0, `scrollLeft=${scrolled}`);
  const visible = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
  check('Fokussierte Karte ist vollständig sichtbar', visible);

  // Reihen-Gedächtnis
  const remembered = await active();
  await press('ArrowDown');
  await wait(500);
  await press('ArrowUp');
  await wait(500);
  check('Rückweg landet auf derselben Karte', (await active()) === remembered, await active());

  // Zurück führt in die Tab-Leiste
  await press('Escape');
  await wait(700);
  check('Esc führt in die Tab-Leiste', await page.evaluate(() => Boolean(document.activeElement?.closest('.tabbar'))), await active());
  await shot('06-tabbar');
  await press('ArrowRight');
  await wait(1200);
  await shot('07-movies');
  check('Tab wechselt beim Fokussieren', await page.evaluate(() => document.querySelector('[aria-current="page"]')?.textContent === 'Filme'));
  await press('ArrowRight');
  await wait(1200);
  await shot('08-series');
  await press('ArrowDown');
  await wait(600);
  check('Runter aus der Tab-Leiste führt in den Inhalt', await page.evaluate(() => !document.activeElement?.closest('.tabbar')), await active());

  // Detailseite über die erste Karte der Übersicht
  await press('ArrowDown');
  await wait(400);
  await press('Enter');
  await page.waitForSelector('.detail-hero', { timeout: 5000 });
  await page.waitForSelector('.route:not([hidden]) .card-episode', { timeout: 5000 });
  await wait(1200);
  await shot('09-detail-series');
  check('Abspielknopf auf der Detailseite hat den Fokus', await page.evaluate(() => document.activeElement?.classList.contains('btn-play')), await active());
  await press('ArrowDown');
  await wait(1000);
  await shot('10-seasons');
  await press('ArrowDown');
  await press('ArrowRight', 2);
  await wait(900);
  await shot('11-episodes');
  check('Episodenkarte im Fokus', await page.evaluate(() => document.activeElement?.classList.contains('card-episode')), await active());
  await press('ArrowDown', 2);
  await wait(900);
  await shot('12-cast');
  await press('Escape');
  await wait(500);
  check('Zurück von der Detailseite', await page.evaluate(() => !document.querySelector('.route:not([hidden]) .detail')));

  // Suche
  await clickTab('.tab-icon');
  await wait(500);
  await page.keyboard.type('orb');
  await wait(800);
  await shot('13-search');
  check('Tippen landet in der Suche', (await page.textContent('.search-query')).includes('orb'));
  check('Suche findet Treffer', await page.evaluate(() => [...document.querySelectorAll('.route:not([hidden]) .tab-page:not([hidden]) .card-title')].some((e) => e.textContent === 'Orbit')));
  await press('Backspace', 3);
  await wait(500);
  check('Rücktaste löscht in der Suche', !(await page.textContent('.search-query')).includes('o') || (await page.textContent('.search-query')).startsWith('Filme'));

  // Einstellungen
  await clickTab('.tab-avatar');
  await wait(600);
  await shot('14-settings');

  // Player: Film mit Fortschritt
  await clickTab('[aria-label="Startseite"]');
  await wait(500);
  const card = page.locator('[data-tab-page="home"] .row').first().locator('.card').first();
  const titleBefore = await card.getAttribute('aria-label');
  await card.click();
  await page.waitForSelector('.player-video', { timeout: 5000 });
  await wait(2500);
  const playing = await page.evaluate(() => { const v = document.querySelector('.player-video'); return { t: v.currentTime, paused: v.paused, dur: v.duration, rs: v.readyState, err: v.error?.message }; });
  check('Video spielt', !playing.paused && playing.rs >= 2 && playing.t > 0, `${titleBefore}: ${JSON.stringify(playing)}`);
  await shot('15-player-overlay');

  await wait(4800);
  check('Steuerung blendet sich aus', await page.evaluate(() => document.querySelector('.player').classList.contains('hide-overlay')));
  await shot('16-player-clean');

  const before = await page.evaluate(() => document.querySelector('.player-video').currentTime);
  await press('ArrowRight', 3);
  await wait(300);
  await shot('17-player-scrub');
  await wait(700);
  const after = await page.evaluate(() => document.querySelector('.player-video').currentTime);
  check('Pfeil rechts springt vor', after - before > 25, `${before.toFixed(1)}s -> ${after.toFixed(1)}s`);

  await press(' ');
  await wait(400);
  check('Leertaste pausiert', await page.evaluate(() => document.querySelector('.player-video').paused));
  await press('ArrowUp');
  await wait(300);
  check('Pfeil hoch erreicht die Knöpfe', await page.evaluate(() => document.activeElement?.classList.contains('round-btn')), await active());
  await press('Enter');
  await wait(500);
  await shot('18-player-menu');
  check('Menü öffnet und übernimmt den Fokus', await page.evaluate(() => document.activeElement?.classList.contains('menu-item')), await active());
  await press('ArrowDown');
  await press('Enter');
  await wait(800);
  const tracks = await page.evaluate(() => [...document.querySelector('.player-video').textTracks].map((t) => `${t.label}:${t.mode}:${t.cues?.length ?? 0}`));
  check('Untertitel wird geladen und angezeigt', tracks.some((t) => t.includes(':showing:') && !t.endsWith(':0')), tracks.join(' | '));
  check('Menü schließt und Fokus kehrt zurück', await page.evaluate(() => !document.querySelector('.player-menu') && document.activeElement?.classList.contains('round-btn')), await active());

  // Intro-Knopf im Demo-Segment 5-18 s
  await page.evaluate(() => { document.querySelector('.player-video').currentTime = 8; });
  await press(' ');
  await wait(1500);
  await shot('19-player-skip');
  check('Intro-Knopf erscheint', await page.locator('[data-skip-button]').count() === 1);
  await page.click('[data-skip-button]');
  await wait(700);
  const skipped = await page.evaluate(() => document.querySelector('.player-video').currentTime);
  check('Intro wird übersprungen', skipped >= 17.5, `${skipped.toFixed(1)}s`);

  // Zurück, Stand wird gespeichert, Reihe aktualisiert sich
  await page.evaluate(() => { document.querySelector('.player-video').currentTime = 60; });
  await wait(800);
  await press('Escape');
  await wait(200);
  const stillOpen = await page.locator('.player').count();
  if (stillOpen) await press('Escape');
  await wait(1000);
  check('Player schließt', await page.locator('.player').count() === 0);
  check('Fokus kehrt zur Karte zurück', await page.evaluate(() => document.activeElement?.classList.contains('card')), await active());
  await shot('20-after-player');

  // Serie: nächste Folge im Player
  await page.evaluate(() => { location.hash = ''; });
  const next = page.locator('[data-tab-page="home"] .row').first().locator('.card', { hasText: 'Orbit' }).first();
  if (await next.count()) {
    await next.click();
    await page.waitForSelector('.player-video');
    await wait(1500);
    await page.evaluate(() => { const v = document.querySelector('.player-video'); v.currentTime = v.duration - 15; });
    await wait(1200);
    await shot('21-up-next');
    check('Als-Nächstes-Karte erscheint', await page.locator('.up-next').count() === 1);
    const firstTitle = await page.textContent('.player-sub');
    await page.click('.up-next-card');
    await wait(2000);
    const nextTitle = await page.textContent('.player-sub');
    check('Nächste Folge startet', firstTitle !== nextTitle, `${firstTitle} -> ${nextTitle}`);
    await press('Escape');
    await wait(200);
    if (await page.locator('.player').count()) await press('Escape');
    await wait(600);
  } else {
    check('Serie in "Weiter ansehen" gefunden', false);
  }

  // Grid
  await page.evaluate(() => [...document.querySelectorAll('[data-tab-page="home"] .card-more')][0]?.click());
  await page.waitForSelector('.route:not([hidden]) .vrow', { timeout: 5000 });
  await wait(800);
  await shot('22-grid');
  await press('ArrowRight', 2);
  await press('ArrowDown');
  await wait(500);
  check('Rasternavigation', await page.evaluate(() => document.activeElement?.classList.contains('card')), await active());
  await page.mouse.move(60, 80);
  await wait(300);
  await shot('22b-grid-mouse');
  await page.click('.back-btn');
  await wait(400);
  check('Zurück-Knopf mit der Maus', await page.locator('.back-btn').count() === 0);

  // Kleines Fenster
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 600));
  await wait(800);
  await shot('23-small-window');
  const overflow = await page.evaluate(() => { const tab = document.querySelector('.tabbar').getBoundingClientRect(); return { tabLeft: tab.left, tabRight: tab.right, width: innerWidth }; });
  check('Tab-Leiste passt ins kleine Fenster', overflow.tabLeft >= 0 && overflow.tabRight <= overflow.width, JSON.stringify(overflow));
} catch (error) {
  check('Durchlauf', false, error.message);
  await shot('99-error').catch(() => undefined);
} finally {
  if (problems.length) console.log('\nKonsolenfehler:\n' + [...new Set(problems)].join('\n'));
  else console.log('\nKeine Konsolenfehler.');
  console.log(`\n${results.filter(Boolean).length}/${results.length} bestanden`);
  await app.close().catch(() => undefined);
  rmSync(userData, { recursive: true, force: true });
}
