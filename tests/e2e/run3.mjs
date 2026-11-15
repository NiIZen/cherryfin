// Prüft den echten Jellyfin-Client gegen einen Testserver, der ausfällt, hängt und wiederkommt.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { startMockServer, TEST_PASSWORD, TEST_USER } from './mock-server.mjs';

const project = process.argv[2];
const hlsDir = process.argv[3];
const shots = path.join(import.meta.dirname, 'shots');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== '' ? ` -> ${detail}` : ''}`);
};

const mock = await startMockServer({ videoFile: path.join(project, 'public/demo/demo.mp4'), hlsDir, mkvFile: process.argv[4] });
const userData = mkdtempSync(path.join(os.tmpdir(), 'jellytv-e2e-'));
const problems = [];

let app;
let page;
const launch = async () => {
  app = await electron.launch({ executablePath: path.join(project, 'node_modules/electron/dist/electron.exe'), args: [project, `--user-data-dir=${userData}`], cwd: project });
  page = await app.firstWindow();
  page.on('pageerror', (e) => problems.push(e.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900));
};
const wait = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const overlay = () => page.locator('.offline').count();
const waitFor = async (selector, timeout = 15000) => { await page.waitForSelector(selector, { timeout }); return true; };
const waitGone = async (selector, timeout = 15000) => { await page.waitForSelector(selector, { state: 'detached', timeout }); return true; };
const clickTab = async (label) => { await page.mouse.move(800, 20); await wait(450); await page.click(`.tabbar [aria-label="${label}"]`); await wait(300); };
const tabs = () => page.evaluate(() => [...document.querySelectorAll('.tabbar .tab')].map((t) => t.getAttribute('aria-label')));
const video = () => page.evaluate(() => { const v = document.querySelector('.player-video'); return v && { t: v.currentTime, paused: v.paused, rs: v.readyState, dur: v.duration, err: v.error?.code ?? null }; });

try {
  await launch();
  await waitFor('.connect-panel');

  /* ---------- Anmeldung am echten Client ---------- */
  await wait(400);
  await page.locator('.connect-panel .text-field').first().fill(`127.0.0.1:${mock.port}`);
  await page.keyboard.press('Enter');
  await waitFor('input[type=password]');
  await page.locator('.text-field').first().fill(TEST_USER);
  await page.locator('input[type=password]').fill('falsch');
  await page.keyboard.press('Enter');
  await waitFor('.form-error');
  check('Falsches Passwort zeigt eine Meldung', (await page.textContent('.form-error')).includes('falsch'));
  await page.locator('input[type=password]').fill(TEST_PASSWORD);
  await page.keyboard.press('Enter');
  await waitFor('.tabbar');
  await waitFor('[data-tab-page="home"] .hero');
  check('Anmeldung und Startseite', true);
  await wait(500);
  check('Bibliotheken als Bereiche, Musik ausgelassen', (await tabs()).join() === 'Suche,Startseite,Filme,Dokumentationen,Serien,Einstellungen', (await tabs()).join(', '));

  /* ---------- Ausfall: Server weg ---------- */
  const heroBefore = await page.locator('[data-tab-page="home"] .hero').count();
  mock.setMode('down');
  await clickTab('Filme');
  await waitFor('.offline', 15000);
  check('Ausfall zeigt die Meldung statt einer leeren Seite', heroBefore === 1);
  await wait(500);
  await shot('60-offline');
  check('Neu laden hat den Fokus', await page.evaluate(() => document.activeElement?.textContent === 'Neu laden'));

  await page.keyboard.press('Escape');
  await wait(200);
  check('Esc schließt die Meldung nicht', await overlay() === 1);

  await page.click('.offline .btn-primary');
  await waitFor('.offline-hint:has-text("Immer noch")', 8000);
  check('Neu laden ohne Server meldet das ehrlich', true, await page.textContent('.offline-hint'));
  await shot('61-offline-retry');

  /* ---------- Automatisch zurück ---------- */
  mock.setMode('up');
  const backAt = Date.now();
  await waitGone('.offline', 12000);
  check('Kommt der Server zurück, verschwindet die Meldung von selbst', true, `nach ${Date.now() - backAt} ms`);
  await waitFor('[data-tab-page="lib1"] .vrow');
  check('Daten werden danach neu geladen', true, await page.textContent('[data-tab-page="lib1"] .overview-title span'));

  /* ---------- Neu-laden-Knopf ---------- */
  mock.setMode('down');
  await page.keyboard.press('F5');
  await waitFor('.offline', 10000);
  check('F5 ohne Server führt zur Meldung', true);
  mock.setMode('up');
  await page.click('.offline .btn-primary');
  await waitGone('.offline', 6000);
  check('Neu laden bringt die App sofort zurück', true);

  /* ---------- Hängender Server: Verbindung steht, aber keine Antwort ---------- */
  await clickTab('Dokumentationen');
  await waitFor('[data-tab-page="lib2"] .vrow');
  mock.setMode('hang');
  const hangAt = Date.now();
  await clickTab('Serien');
  await waitFor('.offline', 14000);
  check('Hängender Server wird in Sekunden erkannt', Date.now() - hangAt < 14000, `nach ${Date.now() - hangAt} ms`);
  mock.setMode('up');
  await waitGone('.offline', 12000);
  const reloadAt = Date.now();
  await waitFor('[data-tab-page="lib3"] .vrow', 8000);
  check('Nach dem Hänger läuft alles sofort wieder', Date.now() - reloadAt < 3000, `nach ${Date.now() - reloadAt} ms`);
  await wait(300);
  const hangFocus = await page.evaluate(() => ({ active: document.activeElement?.getAttribute('aria-label'), current: document.querySelector('.tabbar [aria-current="page"]')?.getAttribute('aria-label') }));
  check('Fokus steht danach auf dem aktiven Bereich', hangFocus.active === hangFocus.current, JSON.stringify(hangFocus));
  await app.close();

  /* ---------- Genau dein Fall: App startet, während das Netz weg ist ---------- */
  mock.setMode('down');
  await launch();
  await waitFor('.offline', 15000);
  check('Start ohne Netz: Meldung, keine schwarze Seite', await page.locator('.connect-panel').count() === 0);
  await wait(400);
  await shot('62-offline-start');
  mock.setMode('up');
  await waitGone('.offline', 12000);
  await waitFor('[data-tab-page="home"] .hero', 10000);
  await wait(600);
  check('Danach erscheint die Startseite mit Bibliotheken', (await tabs()).includes('Filme'), (await tabs()).join(', '));
  check('Anmeldung bleibt beim Ausfall erhalten', await page.locator('.connect-panel').count() === 0);
  check('Fokus liegt danach wieder im Inhalt', await page.evaluate(() => Boolean(document.activeElement?.closest('[data-tab-page="home"]'))), await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30)));
  await shot('63-after-recovery');

  /* ---------- Einstellungen und Wiedergabe gegen den echten Client ---------- */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('jellytv.settings') ?? '{}');
    localStorage.setItem('jellytv.settings', JSON.stringify({ ...s, fullscreenPlayback: false, playerBackend: 'builtin' }));
  });
  await app.close();
  await launch();
  await waitFor('[data-tab-page="home"] .hero', 15000);
  await wait(500);

  await clickTab('Filme');
  await waitFor('[data-tab-page="lib1"] .vrow');
  await page.click('[data-tab-page="lib1"] .card[aria-label="Direkter Film"]');
  await waitFor('.detail-hero');
  await wait(1200);
  await page.click('.route:not([hidden]) .btn-play');
  await waitFor('.player-video');
  await wait(2500);
  const direct = await video();
  check('Direct Play läuft', direct && !direct.paused && direct.t > 0 && direct.rs >= 2, JSON.stringify(direct));
  check('Server bekommt 5.1 als Standard', mock.state.playback.at(-1).MaxAudioChannels === 6 && mock.state.playback.at(-1).DeviceProfile.TranscodingProfiles[0].MaxAudioChannels === '6');
  check('Wiedergabe wird dem Server gemeldet', mock.state.sessions.some((s) => s.route === '/Sessions/Playing' && s.PlayMethod === 'DirectPlay'));

  // Ausfall beim laufenden Film: Das Geladene spielt weiter, statt von einer Meldung verdeckt zu werden.
  mock.setMode('down');
  await wait(6000);
  check('Netzausfall verdeckt den laufenden Film nicht', await overlay() === 0);
  mock.setMode('up');
  await page.mouse.move(800, 400);
  await wait(300);
  await page.click('.route:not([hidden]) .back-btn');
  await wait(500);
  await waitGone('.offline', 12000);
  const detailTop = await page.evaluate(() => document.querySelector('.route:not([hidden]) [data-vscroll]').scrollTop);
  check('Detailseite steht nach dem Player wieder oben', Math.abs(detailTop) < 2, `scrollTop ${detailTop}`);
  check('Stand wird beim Beenden gemeldet', mock.state.sessions.some((s) => s.route === '/Sessions/Playing/Stopped' && s.PositionTicks > 0));
  await page.keyboard.press('Escape');
  await wait(500);

  /* ---------- HLS mit Fortsetzungspunkt ---------- */
  await page.mouse.move(800, 500);
  await page.click('[data-tab-page="lib1"] .card[aria-label="HLS Film"]');
  await waitFor('.detail-hero');
  await wait(1200);
  await page.click('.route:not([hidden]) .btn-play');
  await waitFor('.player-video');
  await wait(3500);
  const hlsState = await video();
  check('HLS läuft und startet am Fortsetzungspunkt', hlsState && !hlsState.paused && hlsState.t >= 30 && hlsState.t < 60, JSON.stringify(hlsState));
  check('HLS meldet sich als Transcode', mock.state.sessions.some((s) => s.route === '/Sessions/Playing' && s.PlayMethod === 'Transcode'));

  // Kurzer Aussetzer beim Spulen in einen nicht geladenen Bereich
  mock.setMode('down');
  await page.evaluate(() => { document.querySelector('.player-video').currentTime = 100; });
  await wait(1500);
  mock.setMode('up');
  await page.waitForFunction(() => { const v = document.querySelector('.player-video'); return v && v.currentTime > 100.3 && v.readyState >= 2; }, null, { timeout: 25000 });
  check('HLS überbrückt einen kurzen Aussetzer selbst', await page.locator('.player-error').count() === 0, `${(await video()).t.toFixed(1)} s`);

  // Längerer Ausfall ab dem Start führt zur Meldung im Player, Neu laden setzt fort
  await page.click('.route:not([hidden]) .back-btn', { force: true }).catch(() => undefined);
  await wait(500);
  if (await page.locator('.player').count()) { await page.keyboard.press('Escape'); await wait(300); }
  if (await page.locator('.player').count()) { await page.keyboard.press('Escape'); await wait(300); }
  mock.setMode('down');
  await page.mouse.move(800, 500);
  await page.click('.route:not([hidden]) .btn-play');
  await waitFor('.player-error', 15000);
  await wait(300);
  await shot('64-player-error');
  check('Player zeigt Neu laden', await page.evaluate(() => document.activeElement?.textContent === 'Neu laden'));
  mock.setMode('up');
  await page.click('.player-error .btn-primary');
  await waitGone('.player-error', 8000);
  await wait(3000);
  const resumed = await video();
  check('Neu laden im Player startet die Wiedergabe', resumed && !resumed.paused && resumed.t > 0 && resumed.rs >= 2, JSON.stringify(resumed));
  check('Fokus liegt danach auf der Zeitleiste', await page.evaluate(() => document.activeElement?.classList.contains('scrubber')));
  check('Erfolgreiche Anfrage hebt den Ausfall sofort auf', await page.evaluate(() => !document.querySelector('.offline')));

  /* ---------- Tonkanäle ---------- */
  for (let i = 0; i < 5 && (await page.locator('.route').count()) > 1; i++) {
    await page.keyboard.press('Escape');
    await wait(350);
  }
  check('Esc führt aus dem Player zurück zu den Bereichen', await page.locator('.route').count() === 1);
  await clickTab('Einstellungen');
  await page.click('[data-category="playback"]');
  await wait(300);
  await shot('65-audio-settings');
  await page.click('[data-setting="Tonkanäle"]');
  await wait(200);
  check('Tonkanäle lassen sich umstellen', (await page.textContent('[data-setting="Tonkanäle"]')).includes('Stereo'));
  await clickTab('Filme');
  await page.click('[data-tab-page="lib1"] .card[aria-label="Direkter Film"]');
  await waitFor('.detail-hero');
  await wait(1200);
  await page.click('.route:not([hidden]) .btn-play');
  await waitFor('.player-video');
  await wait(1200);
  check('Server bekommt Stereo', mock.state.playback.at(-1).MaxAudioChannels === 2 && mock.state.playback.at(-1).DeviceProfile.TranscodingProfiles[0].MaxAudioChannels === '2');
  await page.keyboard.press('Escape');
  await wait(200);
  if (await page.locator('.player').count()) { await page.keyboard.press('Escape'); await wait(400); }

  /* ---------- Abgelaufene Anmeldung ist etwas anderes als ein Ausfall ---------- */
  mock.setMode('401');
  await page.keyboard.press('F5');
  await waitFor('.connect-panel', 10000);
  check('Abgelaufene Anmeldung führt zum Login, nicht zur Ausfall-Meldung', await overlay() === 0);
} catch (error) {
  check('Durchlauf', false, error.message.split('\n').slice(0, 3).join(' | '));
  await shot('99-error3').catch(() => undefined);
} finally {
  console.log(problems.length ? `\nFehler:\n${[...new Set(problems)].join('\n')}` : '\nKeine Seitenfehler.');
  console.log(`\n${results.filter(Boolean).length}/${results.length} bestanden`);
  await app?.close().catch(() => undefined);
  mock.close();
  rmSync(userData, { recursive: true, force: true });
}
