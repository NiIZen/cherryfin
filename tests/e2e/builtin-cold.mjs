// Does the built-in player start on a cold audio device? The video has real audio on the real device.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { startMockServer, TEST_PASSWORD, TEST_USER } from './mock-server.mjs';

const project = process.argv[2];
const mock = await startMockServer({ videoFile: path.join(project, 'public/demo/demo.mp4'), hlsDir: process.argv[3], mkvFile: process.argv[4] });
const userData = mkdtempSync(path.join(os.tmpdir(), 'jellytv-bc-'));
const app = await electron.launch({
  executablePath: path.join(project, 'node_modules/electron/dist/electron.exe'),
  args: [project, '--lang=en-US', `--user-data-dir=${userData}`],
  cwd: project,
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
await page.evaluate(() => {
  localStorage.setItem('jellytv.settings', JSON.stringify({ playerBackend: 'builtin', playback: { volume: 50 } }));
  location.reload();
});
await page.waitForTimeout(800);
await page.waitForSelector('.tabbar');
await page.waitForTimeout(700);
await page.click('.tabbar [aria-label=\"Movies\"]');
await page.waitForSelector('[data-tab-page=\"lib1\"] .card[aria-label=\"Direct Movie\"]');
await page.waitForTimeout(300);
await page.click('[data-tab-page=\"lib1\"] .card[aria-label=\"Direct Movie\"]');
await page.waitForSelector('.route:not([hidden]) .btn-play');
await page.waitForTimeout(9000);
await page.click('.route:not([hidden]) .btn-play');
await page.waitForSelector('.player-video');
const samples = [];
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1500);
  samples.push(await page.evaluate(() => {
    const v = document.querySelector('.player-video');
    return { t: Number(v.currentTime.toFixed(1)), d: Number((v.duration || 0).toFixed(1)), paused: v.paused };
  }));
}
console.log(JSON.stringify(samples));
await app.close();
mock.close();
rmSync(userData, { recursive: true, force: true });
