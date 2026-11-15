// Spielt die Testdatei mit verschiedenen Einstellungen auf dem echten Audiogerät und misst, ob die Zeit läuft.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { startMockServer, TEST_PASSWORD, TEST_USER } from './mock-server.mjs';

const project = process.argv[2];
const mock = await startMockServer({ videoFile: path.join(project, 'public/demo/demo.mp4'), hlsDir: process.argv[3], mkvFile: process.argv[4] });
const userData = mkdtempSync(path.join(os.tmpdir(), 'jellytv-mx-'));
const logFile = path.join(userData, 'mpv.log');

const FORMATS = ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd'];
const cases = [
  { name: 'Fenster, PCM', fullscreen: false, audio: { mode: 'pcm', formats: FORMATS, exclusive: false, device: 'auto' } },
  { name: 'Vollbild, PCM (Standard)', fullscreen: true, audio: { mode: 'pcm', formats: FORMATS, exclusive: false, device: 'auto' } },
  { name: 'Fenster, PCM, exklusiv', fullscreen: false, audio: { mode: 'pcm', formats: FORMATS, exclusive: true, device: 'auto' } },
  { name: 'Fenster, Passthrough, exklusiv', fullscreen: false, audio: { mode: 'passthrough', formats: FORMATS, exclusive: true, device: 'auto' } },
  { name: 'Fenster, Passthrough, nicht exklusiv', fullscreen: false, audio: { mode: 'passthrough', formats: FORMATS, exclusive: false, device: 'auto' } },
];

const app = await electron.launch({
  executablePath: process.env.TEST_EXE || path.join(project, 'node_modules/electron/dist/electron.exe'),
  args: process.env.TEST_EXE ? [`--user-data-dir=${userData}`] : [project, `--user-data-dir=${userData}`],
  cwd: project,
  env: { ...process.env, CHERRYFIN_MPV_LOG: logFile },
});
const page = await app.firstWindow();
await page.waitForSelector('.connect-panel');
await page.locator('.connect-panel .text-field').first().fill(`127.0.0.1:${mock.port}`);
await page.keyboard.press('Enter');
await page.waitForSelector('input[type=password]');
await page.locator('.text-field').first().fill(TEST_USER);
await page.locator('input[type=password]').fill(TEST_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForSelector('[data-tab-page="home"] .hero');

const overlayPage = async () => {
  for (let i = 0; i < 100; i++) {
    const found = app.windows().find((w) => w.url().includes('#player'));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Kein Player-Fenster');
};

for (const test of (process.env.REPEAT ? Array(Number(process.env.REPEAT)).fill(cases[0]) : process.env.ONLY ? cases.slice(0, Number(process.env.ONLY)) : cases)) {
  await page.evaluate(({ fullscreen, audio }) => {
    localStorage.setItem('jellytv.settings', JSON.stringify({ fullscreenPlayback: fullscreen, audio }));
    location.reload();
  }, test);
  await page.waitForTimeout(800);
  await page.waitForSelector('.tabbar');
  await page.waitForTimeout(700);
  await page.click('.tabbar [aria-label="Filme"]');
  await page.waitForSelector('[data-tab-page="lib1"] .card[aria-label="MKV Film"]');
  await page.waitForTimeout(300);
  await page.click('[data-tab-page="lib1"] .card[aria-label="MKV Film"]');
  await page.waitForSelector('.route:not([hidden]) .btn-play');
  await page.waitForTimeout(1200);
  // Das Audiogerät soll kalt sein, so wie beim ersten Film des Tages.
  await page.waitForTimeout(9000);
  await page.click('.route:not([hidden]) .btn-play');
  const p = await overlayPage();
  await p.waitForSelector('.player.external');
  const samples = [];
  for (let i = 0; i < (Number(process.env.SAMPLES) || 4); i++) {
    await p.waitForTimeout(2500);
    samples.push(await p.evaluate(() => ({ t: Number(document.querySelector('[role=slider]')?.getAttribute('aria-valuenow') ?? -1), spin: Boolean(document.querySelector('.player-spinner')) })));
  }
  const moved = samples.at(-1).t - samples[0].t;
  // Echtes Tempo: mindestens 80 % der verstrichenen Zeit, nicht nur irgendein Fortschritt.
  const stuck = moved < (samples.length - 1) * 2.5 * 0.8;
  console.log(`${stuck ? 'HÄNGT ' : 'läuft '} ${test.name}: Zeit ${samples.map((s) => s.t).join(' → ')}, Ladekreis ${samples.at(-1).spin ? 'ja' : 'nein'}`);
  if (stuck) {
    const log = readFileSync(logFile, 'utf8').split('\n');
    const useful = log.filter((l) => !/libplacebo|\[vo\/gpu-next\/|\[osd|ffmpeg\/|\[stream|\[demux\]|\[cache|\[ytdl|\[vd\]\[d\]|statusline|\[ao\/wasapi\]\[d\]/.test(l));
    console.log(useful.slice(-45).map((l) => `    ${l.slice(0, 165)}`).join('\n'));
    // Wie bei dir: Spulen auf der Zeitleiste
    await p.mouse.move(600, 300);
    await p.waitForTimeout(300);
    await p.locator('[role=slider]').click({ position: { x: 300, y: 10 } }).catch(() => undefined);
    await p.waitForTimeout(3000);
    console.log(`    nach dem Klick auf die Zeitleiste: ${await p.evaluate(() => document.querySelector('[role=slider]')?.getAttribute('aria-valuenow'))} s`);
  }
  await p.mouse.move(610, 310);
  await p.waitForTimeout(300);
  await p.click('.back-btn').catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2000));
}

await app.close();
mock.close();
rmSync(userData, { recursive: true, force: true });
