// Checks the real Jellyfin client against a test server that fails, hangs and comes back.
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
  app = await electron.launch({ executablePath: path.join(project, 'node_modules/electron/dist/electron.exe'), args: [project, '--lang=en-US', `--user-data-dir=${userData}`], cwd: project });
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

  /* ---------- Sign-in with the real client ---------- */
  await wait(400);
  await page.locator('.connect-panel .text-field').first().fill(`127.0.0.1:${mock.port}`);
  await page.keyboard.press('Enter');
  await waitFor('input[type=password]');
  await page.locator('.text-field').first().fill(TEST_USER);
  await page.locator('input[type=password]').fill('falsch');
  await page.keyboard.press('Enter');
  await waitFor('.form-error');
  check('Wrong password shows a message', (await page.textContent('.form-error')).includes('Wrong'));
  await page.locator('input[type=password]').fill(TEST_PASSWORD);
  await page.keyboard.press('Enter');
  await waitFor('.tabbar');
  await waitFor('[data-tab-page="home"] .hero');
  check('Sign-in and home screen', true);
  await wait(500);
  check('Libraries as sections, music left out', (await tabs()).join() === 'Search,Home,Movies,Documentaries,Shows,Settings', (await tabs()).join(', '));

  /* ---------- Outage: server gone ---------- */
  const heroBefore = await page.locator('[data-tab-page="home"] .hero').count();
  mock.setMode('down');
  await clickTab('Movies');
  await waitFor('.offline', 15000);
  check('An outage shows the message instead of an empty page', heroBefore === 1);
  await wait(500);
  await shot('60-offline');
  check('Reload has the focus', await page.evaluate(() => document.activeElement?.textContent === 'Reload'));

  await page.keyboard.press('Escape');
  await wait(200);
  check('Esc does not close the message', await overlay() === 1);

  await page.click('.offline .btn-primary');
  await waitFor('.offline-hint:has-text("Still no response")', 8000);
  check('Reload without a server says so honestly', true, await page.textContent('.offline-hint'));
  await shot('61-offline-retry');

  /* ---------- Back automatically ---------- */
  mock.setMode('up');
  const backAt = Date.now();
  await waitGone('.offline', 12000);
  check('When the server returns, the message disappears by itself', true, `after ${Date.now() - backAt} ms`);
  await waitFor('[data-tab-page="lib1"] .vrow');
  check('Data is reloaded afterwards', true, await page.textContent('[data-tab-page="lib1"] .overview-title span'));

  /* ---------- Reload button ---------- */
  mock.setMode('down');
  await page.keyboard.press('F5');
  await waitFor('.offline', 10000);
  check('F5 without a server leads to the message', true);
  mock.setMode('up');
  await page.click('.offline .btn-primary');
  await waitGone('.offline', 6000);
  check('Reload brings the app back at once', true);

  /* ---------- Hanging server: connected, but no answer ---------- */
  await clickTab('Documentaries');
  await waitFor('[data-tab-page="lib2"] .vrow');
  mock.setMode('hang');
  const hangAt = Date.now();
  await clickTab('Shows');
  await waitFor('.offline', 14000);
  check('A hanging server is detected within seconds', Date.now() - hangAt < 14000, `after ${Date.now() - hangAt} ms`);
  mock.setMode('up');
  await waitGone('.offline', 12000);
  const reloadAt = Date.now();
  await waitFor('[data-tab-page="lib3"] .vrow', 8000);
  check('After the hang everything runs again at once', Date.now() - reloadAt < 3000, `after ${Date.now() - reloadAt} ms`);
  await wait(300);
  const hangFocus = await page.evaluate(() => ({ active: document.activeElement?.getAttribute('aria-label'), current: document.querySelector('.tabbar [aria-current="page"]')?.getAttribute('aria-label') }));
  check('Focus is on the active section afterwards', hangFocus.active === hangFocus.current, JSON.stringify(hangFocus));
  await app.close();

  /* ---------- App starts while the network is down ---------- */
  mock.setMode('down');
  await launch();
  await waitFor('.offline', 15000);
  check('Start without network: message, no black page', await page.locator('.connect-panel').count() === 0);
  await wait(400);
  await shot('62-offline-start');
  mock.setMode('up');
  await waitGone('.offline', 12000);
  await waitFor('[data-tab-page="home"] .hero', 10000);
  await wait(600);
  check('Then the home screen appears with libraries', (await tabs()).includes('Movies'), (await tabs()).join(', '));
  check('Sign-in is kept during the outage', await page.locator('.connect-panel').count() === 0);
  check('Focus is back in the content afterwards', await page.evaluate(() => Boolean(document.activeElement?.closest('[data-tab-page="home"]'))), await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30)));
  await shot('63-after-recovery');

  /* ---------- Settings and playback with the real client ---------- */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('jellytv.settings') ?? '{}');
    localStorage.setItem('jellytv.settings', JSON.stringify({ ...s, fullscreenPlayback: false, playerBackend: 'builtin' }));
  });
  await app.close();
  await launch();
  await waitFor('[data-tab-page="home"] .hero', 15000);
  await wait(500);

  await clickTab('Movies');
  await waitFor('[data-tab-page="lib1"] .vrow');
  await page.click('[data-tab-page=\"lib1\"] .card[aria-label=\"Direct Movie\"]');
  await waitFor('.detail-hero');
  await wait(1200);
  await page.click('.route:not([hidden]) .btn-play');
  await waitFor('.player-video');
  await wait(2500);
  const direct = await video();
  check('Direct play runs', direct && !direct.paused && direct.t > 0 && direct.rs >= 2, JSON.stringify(direct));
  check('Server gets 5.1 by default', mock.state.playback.at(-1).MaxAudioChannels === 6 && mock.state.playback.at(-1).DeviceProfile.TranscodingProfiles[0].MaxAudioChannels === '6');
  check('Playback is reported to the server', mock.state.sessions.some((s) => s.route === '/Sessions/Playing' && s.PlayMethod === 'DirectPlay'));

  // Outage during playback: what is loaded keeps playing instead of being covered by a message.
  mock.setMode('down');
  await wait(6000);
  check('A network outage does not cover the running title', await overlay() === 0);
  mock.setMode('up');
  await page.mouse.move(800, 400);
  await wait(300);
  await page.click('.route:not([hidden]) .back-btn');
  await wait(500);
  await waitGone('.offline', 12000);
  const detailTop = await page.evaluate(() => document.querySelector('.route:not([hidden]) [data-vscroll]').scrollTop);
  check('Detail page is on top again after the player', Math.abs(detailTop) < 2, `scrollTop ${detailTop}`);
  check('Position is reported on exit', mock.state.sessions.some((s) => s.route === '/Sessions/Playing/Stopped' && s.PositionTicks > 0));
  await page.keyboard.press('Escape');
  await wait(500);

  /* ---------- HLS with resume point ---------- */
  await page.mouse.move(800, 500);
  await page.click('[data-tab-page=\"lib1\"] .card[aria-label=\"HLS Movie\"]');
  await waitFor('.detail-hero');
  await wait(1200);
  await page.click('.route:not([hidden]) .btn-play');
  await waitFor('.player-video');
  await wait(3500);
  const hlsState = await video();
  check('HLS plays and starts at the resume point', hlsState && !hlsState.paused && hlsState.t >= 30 && hlsState.t < 60, JSON.stringify(hlsState));
  check('HLS reports itself as transcode', mock.state.sessions.some((s) => s.route === '/Sessions/Playing' && s.PlayMethod === 'Transcode'));

  // Short dropout when seeking into a part that is not loaded
  mock.setMode('down');
  await page.evaluate(() => { document.querySelector('.player-video').currentTime = 100; });
  await wait(1500);
  mock.setMode('up');
  await page.waitForFunction(() => { const v = document.querySelector('.player-video'); return v && v.currentTime > 100.3 && v.readyState >= 2; }, null, { timeout: 25000 });
  check('HLS bridges a short dropout itself', await page.locator('.player-error').count() === 0, `${(await video()).t.toFixed(1)} s`);

  // A longer outage from the start leads to the message in the player; Reload continues
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
  check('Player shows Reload', await page.evaluate(() => document.activeElement?.textContent === 'Reload'));
  mock.setMode('up');
  await page.click('.player-error .btn-primary');
  await waitGone('.player-error', 8000);
  await wait(3000);
  const resumed = await video();
  check('Reload in the player starts playback', resumed && !resumed.paused && resumed.t > 0 && resumed.rs >= 2, JSON.stringify(resumed));
  check('Focus is on the timeline afterwards', await page.evaluate(() => document.activeElement?.classList.contains('scrubber')));
  check('A successful request ends the outage at once', await page.evaluate(() => !document.querySelector('.offline')));

  /* ---------- Audio channels ---------- */
  for (let i = 0; i < 5 && (await page.locator('.route').count()) > 1; i++) {
    await page.keyboard.press('Escape');
    await wait(350);
  }
  check('Esc leads from the player back to the sections', await page.locator('.route').count() === 1);
  await clickTab('Settings');
  await page.click('[data-category="playback"]');
  await wait(300);
  await shot('65-audio-settings');
  await page.click('[data-setting=\"Audio channels\"]');
  await wait(200);
  check('Audio channels can be changed', (await page.textContent('[data-setting=\"Audio channels\"]')).includes('Stereo'));
  await clickTab('Movies');
  await page.click('[data-tab-page=\"lib1\"] .card[aria-label=\"Direct Movie\"]');
  await waitFor('.detail-hero');
  await wait(1200);
  await page.click('.route:not([hidden]) .btn-play');
  await waitFor('.player-video');
  await wait(1200);
  check('Server gets stereo', mock.state.playback.at(-1).MaxAudioChannels === 2 && mock.state.playback.at(-1).DeviceProfile.TranscodingProfiles[0].MaxAudioChannels === '2');
  await page.keyboard.press('Escape');
  await wait(200);
  if (await page.locator('.player').count()) { await page.keyboard.press('Escape'); await wait(400); }

  /* ---------- An expired sign-in is different from an outage ---------- */
  mock.setMode('401');
  await page.keyboard.press('F5');
  await waitFor('.connect-panel', 10000);
  check('An expired sign-in leads to the login, not to the outage message', await overlay() === 0);
} catch (error) {
  check('Run', false, error.message.split('\n').slice(0, 3).join(' | '));
  await shot('99-error3').catch(() => undefined);
} finally {
  console.log(problems.length ? `\nFehler:\n${[...new Set(problems)].join('\n')}` : '\nKeine Seitenfehler.');
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  await app?.close().catch(() => undefined);
  mock.close();
  rmSync(userData, { recursive: true, force: true });
}
