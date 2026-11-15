// Checks the settings inspired by Fladder in the real app, against a test server and without an audio device.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { startMockServer, TEST_PASSWORD, TEST_USER } from './mock-server.mjs';

const project = process.argv[2];
const TICKS = 10_000_000;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== '' ? ` -> ${detail}` : ''}`);
};

const mock = await startMockServer({ videoFile: path.join(project, 'public/demo/demo.mp4'), hlsDir: process.argv[3], mkvFile: process.argv[4] });
const userData = mkdtempSync(path.join(os.tmpdir(), 'jellytv-e5-'));
const logFile = path.join(userData, 'mpv.log');
const app = await electron.launch({
  executablePath: path.join(project, 'node_modules/electron/dist/electron.exe'),
  args: [project, '--lang=en-US', `--user-data-dir=${userData}`],
  cwd: project,
  env: { ...process.env, CHERRYFIN_MPV_AO: 'null', CHERRYFIN_MPV_LOG: logFile },
});
const page = await app.firstWindow();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
await page.waitForSelector('.connect-panel');
await page.locator('.connect-panel .text-field').first().fill(`127.0.0.1:${mock.port}`);
await page.keyboard.press('Enter');
await page.waitForSelector('input[type=password]');
await page.locator('.text-field').first().fill(TEST_USER);
await page.locator('input[type=password]').fill(TEST_PASSWORD);
await page.keyboard.press('Enter');
await page.waitForSelector('[data-tab-page="home"] .hero');

const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('jellytv.settings') ?? '{}'));
const apply = async (settings) => {
  await page.evaluate((s) => {
    localStorage.setItem('jellytv.settings', JSON.stringify(s));
    location.reload();
  }, settings);
  await page.waitForTimeout(800);
  await page.waitForSelector('.tabbar');
  await page.waitForTimeout(500);
};
const log = () => readFileSync(logFile, 'utf8');

const overlayPage = async () => {
  for (let i = 0; i < 100; i++) {
    const found = app.windows().find((w) => w.url().includes('#player'));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('No player window');
};

const openFilm = async (name) => {
  await page.click('.tabbar [aria-label=\"Movies\"]');
  await page.waitForSelector(`[data-tab-page="lib1"] .card[aria-label="${name}"]`);
  await page.waitForTimeout(300);
  await page.click(`[data-tab-page="lib1"] .card[aria-label="${name}"]`);
  await page.waitForSelector('.route:not([hidden]) .btn-play');
  await page.waitForTimeout(1200);
};
const playMkv = async () => {
  await openFilm('MKV Movie');
  await page.click('.route:not([hidden]) .btn-play');
  const p = await overlayPage();
  await p.waitForSelector('.player.external');
  await p.waitForTimeout(2000);
  return p;
};
const closePlayer = async (p) => {
  await p.mouse.move(600, 300);
  await p.mouse.move(610, 310);
  await p.waitForTimeout(300);
  await p.click('.back-btn').catch(() => undefined);
  await page.waitForTimeout(1500);
};
const position = (p) => p.evaluate(() => Number(document.querySelector('[role=slider]')?.getAttribute('aria-valuenow') ?? -1));
const notice = (p) => p.evaluate(() => document.querySelector('.player-notice')?.textContent ?? '');

/* ---------- Settings page ---------- */
await page.click('.tabbar [aria-label=\"Settings\"]');
await page.waitForSelector('.list-row.category');
const categories = await page.locator('.list-row.category').allTextContents();
check('New categories present', categories.some((c) => c.includes('Subtitles')) && categories.some((c) => c.includes('Keyboard shortcuts')), categories.join(', '));

const openCategory = async (label) => {
  await page.click(`.list-row.category:has-text("${label}")`);
  await page.waitForTimeout(150);
};
const row = (label) => page.locator(`[data-setting="${label}"]`);
await openCategory('Playback');
for (const label of ['Quality on the home network', 'Quality over the internet', 'Skip back', 'Skip forward', 'Remember audio language', 'Incognito', 'Picture fit', 'Hardware decoding', 'Stream buffer', 'Intro', 'Credits', 'Speed while holding the mouse button', 'Double-click on the picture', 'Volume at start']) {
  check(`Zeile "${label}"`, await row(label).count() === 1);
}
await row('Skip forward').click();
check('Click changes the value', (await stored()).playback?.seekForward === 15, (await stored()).playback?.seekForward);
await row('Intro').click();
check('Segment action changes', (await stored()).playback?.segments?.Intro === 'skip', (await stored()).playback?.segments?.Intro);

await openCategory('Subtitles');
await row('Color').click();
check('Subtitle color saved', (await stored()).subtitles?.color === '#ffe066');
const cue = await page.evaluate(() => document.getElementById('cherryfin-cue')?.textContent ?? '');
check('Subtitle style in the built-in player', cue.includes('#ffe066'), cue.slice(0, 50).replace(/\s+/g, ' '));

await openCategory('Appearance');
await row('Power saving').click();
check('Power saving turns glass off', await page.evaluate(() => document.documentElement.dataset.glass) === 'off');
await row('Power saving').click();
await row('Spoiler protection').click();
check('Spoiler protection active', await page.evaluate(() => document.documentElement.dataset.spoiler) === 'on');
await row('Detail page background').click();
check('Detail page background active', await page.evaluate(() => document.documentElement.dataset.detailBg) === 'sharp');

await openCategory('Keyboard shortcuts');
await page.click('[data-hotkey="mute"]');
check('Waits for a key', (await page.locator('[data-hotkey="mute"]').textContent()).includes('Press a key'));
await page.keyboard.press(' ');
check('A reserved key is rejected', (await page.locator('[data-hotkey="mute"]').textContent()).includes('Press a key'));
await page.keyboard.press('q');
check('New key saved', (await stored()).playback?.hotkeys?.mute === 'q');
await page.click('[data-hotkey="next"]');
await page.keyboard.press('q');
const swapped = (await stored()).playback?.hotkeys;
check('Assigning twice swaps', swapped.next === 'q' && swapped.mute === 'n', JSON.stringify(swapped).slice(0, 60));
await page.click('[data-hotkey="skip"]');
await page.keyboard.press('Escape');
check('Escape cancels', (await stored()).playback?.hotkeys?.skip === 's');

/* ---------- Home screen ---------- */
const episode = { Id: 'e1', Name: 'Episode One', Type: 'Episode', SeriesId: 'serie', SeriesName: 'Test Show', IndexNumber: 1, ParentIndexNumber: 1, ImageTags: {}, BackdropImageTags: [], UserData: { Played: false } };
mock.state.nextUp = [episode];
const rowsOn = () => page.evaluate(() => [...document.querySelectorAll('[data-tab-page="home"] .row-title, [data-tab-page="home"] [data-section] h2')].map((e) => e.textContent));
await apply({ home: { continueMode: 'separate' } });
await page.waitForTimeout(600);
let titles = await rowsOn();
check('Continue watching separate', titles.includes('Continue watching') && titles.includes('Next up'), titles.join(' | '));
await apply({ home: { continueMode: 'nextup' } });
await page.waitForTimeout(600);
titles = await rowsOn();
check('Next up only', titles.includes('Next up') && !titles.includes('Continue watching'), titles.join(' | '));
mock.state.queries.length = 0;
await apply({ home: { nextUpDays: 30 } });
await page.waitForTimeout(600);
const cutoff = mock.state.queries.find((q) => q.startsWith('/Shows/NextUp') && q.includes('nextUpDateCutoff'));
const days = cutoff ? (Date.now() - new Date(new URL(`http://x${cutoff}`).searchParams.get('nextUpDateCutoff'))) / 86_400_000 : 0;
check('Cutoff date for next up', Math.abs(days - 30) < 0.1, days.toFixed(2));
mock.state.nextUp = [];
await apply({ home: { heroDetails: false, heroSource: 'continue' } });
await page.waitForTimeout(600);
const heroHidden = await page.evaluate(() => {
  const overview = document.querySelector('[data-tab-page="home"] .hero .hero-overview');
  return !overview || getComputedStyle(overview).display === 'none';
});
check('Description in the header off', heroHidden);
check('Header shows started titles', (await page.locator('[data-tab-page="home"] .hero').textContent()).includes('HLS Movie'));

/* ---------- mpv: start options and controls ---------- */
await apply({
  maxBitrate: 8_000_000,
  playback: { hardwareDecoding: false, fit: 'cover', bufferMb: 512, volume: 80, seekForward: 30, seekBack: 5, speedBoost: 3, hotkeys: { mute: 'q' } },
  subtitles: { size: 56, color: '#ffe066', position: 10, bold: true, background: 'box', outline: 4 },
});
mock.state.sessions.length = 0;
mock.state.playback.length = 0;
let p = await playMkv();
let text = log();
for (const [name, value] of [['hwdec', 'no'], ['panscan', '1'], ['demuxer-max-bytes', '512MiB'], ['volume', '80'], ['sub-font-size', '56'], ['sub-color', '#ffe066'], ['sub-pos', '90'], ['sub-bold', 'yes'], ['sub-back-color', '#99000000'], ['sub-border-size', '4']]) {
  check(`mpv starts with ${name}=${value}`, text.includes(`Setting option '${name}' = '${value}'`));
}
check('Home network quality applies', mock.state.playback.at(-1)?.MaxStreamingBitrate === 8_000_000 || JSON.stringify(mock.state.playback.at(-1)).includes('8000000'));

const t0 = await position(p);
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(700);
const t1 = await position(p);
check('Skip forward uses the setting', t1 - t0 >= 28 && t1 - t0 <= 33, `${t0} -> ${t1}`);
await p.keyboard.press('ArrowLeft');
await p.waitForTimeout(700);
const t2 = await position(p);
check('Skip back uses the setting', t1 - t2 >= 2 && t1 - t2 <= 6, `${t1} -> ${t2}`);

await p.keyboard.press('q');
await p.waitForTimeout(250);
check('Custom key: sound off', (await notice(p)) === 'Sound off', await notice(p));
await p.keyboard.press('q');
await p.keyboard.press('+');
await p.waitForTimeout(250);
check('Volume up key', (await notice(p)) === 'Volume 85 %', await notice(p));
await p.keyboard.press(']');
await p.waitForTimeout(250);
check('Faster key', (await notice(p)).startsWith('Speed 1.25'), await notice(p));
await p.keyboard.press('[');
await p.waitForTimeout(250);
text = log();
check('mpv gets the volume', /Set property: volume=85/.test(text));
check('mpv gets mute', /Set property: mute=true/.test(text));

// Hold the mouse button: faster, then normal and not paused.
const surface = await p.locator('.player-surface').boundingBox();
await p.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2);
await p.mouse.down();
await p.waitForTimeout(600);
check('Holding speeds up', (await notice(p)).startsWith('Speed 3'), await notice(p));
await p.mouse.up();
await p.waitForTimeout(400);
text = log();
check('mpv runs at 3x while holding', /Set property: speed=3/.test(text));
const notPaused = await p.evaluate(() => !document.querySelector('.player')?.classList.contains('paused'));
const a = await position(p);
await p.waitForTimeout(2200);
const b = await position(p);
check('After releasing, playback continues', b > a && notPaused, `${a} -> ${b}`);
await closePlayer(p);
check('Normal: the server learns about playback', mock.state.sessions.length > 0, mock.state.sessions.length);

/* ---------- Incognito, remembered track, segments ---------- */
mock.state.sessions.length = 0;
await apply({ playback: { incognito: true } });
p = await playMkv();
await p.waitForTimeout(1000);
await closePlayer(p);
check('Incognito: the server learns nothing', mock.state.sessions.length === 0, mock.state.sessions.length);

await page.evaluate(() => localStorage.setItem('jellytv.tracks', JSON.stringify({ audio: 'eng', subtitle: 'deu' })));
await apply({});
const before = log().length;
p = await playMkv();
await p.waitForTimeout(800);
text = log().slice(0);
check('Remembered audio language at start', /Set property: aid=2 -> 1/.test(text), '');
await closePlayer(p);
await page.evaluate(() => localStorage.removeItem('jellytv.tracks'));
void before;

mock.state.segments = [{ Type: 'Intro', StartTicks: 0, EndTicks: 20 * TICKS }];
await apply({ playback: { segments: { Intro: 'skip' } } });
p = await playMkv();
await p.waitForTimeout(600);
let now = await position(p);
check('Intro skipped automatically', now >= 20, now);
await closePlayer(p);

await apply({ playback: { segments: { Intro: 'off' } } });
p = await playMkv();
check('Segment on "Do nothing": no button', await p.locator('[data-skip-button]').count() === 0);
now = await position(p);
check('Segment on "Do nothing": no skip', now < 15, now);
await closePlayer(p);

await apply({ playback: { segments: { Intro: 'ask' } } });
p = await playMkv();
check('Segment on "Show button": button present', await p.locator('[data-skip-button]').count() === 1);
await closePlayer(p);
mock.state.segments = [];

/* ---------- Built-in player ---------- */
await apply({ playerBackend: 'builtin', playback: { fit: 'cover', volume: 60, seekForward: 30 } });
await openFilm('Direct Movie');
await page.click('.route:not([hidden]) .btn-play');
await page.waitForSelector('.player-video');
await page.waitForTimeout(1800);
const style = await page.evaluate(() => {
  const v = document.querySelector('.player-video');
  return { fit: getComputedStyle(v).objectFit, volume: v.volume, paused: v.paused, time: v.currentTime };
});
check('Built-in: picture fit', style.fit === 'cover', style.fit);
check('Built-in: volume', Math.abs(style.volume - 0.6) < 0.01, style.volume);
check('Built-in: plays', !style.paused && style.time > 0, style.time);
await page.keyboard.press('+');
await page.waitForTimeout(200);
check('Built-in: volume up key', Math.abs(await page.evaluate(() => document.querySelector('.player-video').volume) - 0.65) < 0.01);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
const preview = await page.evaluate(() => Number(document.querySelector('[role=slider]')?.getAttribute('aria-valuenow') ?? -1));
check('Built-in: skip length', preview >= 28 && preview <= 33, preview);

/* ---------- Screensaver ---------- */
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(500);
await apply({ playerBackend: 'builtin', playback: { screensaver: 'clock' } });
await openFilm('Direct Movie');
await page.click('.route:not([hidden]) .btn-play');
await page.waitForSelector('.player-video');
await page.waitForTimeout(1500);
await page.keyboard.press(' ');
await page.waitForTimeout(61_000);
const saver = await page.locator('.player-saver span').textContent().catch(() => '');
check('Screensaver appears after one minute of pause', /^\d{1,2}:\d\d( [AP]M)?$/.test(saver), saver);
await page.mouse.move(300, 300);
await page.mouse.move(320, 320);
await page.waitForTimeout(200);
check('Movement ends the screensaver', await page.locator('.player-saver').count() === 0);

check('No errors in the page', problems.length === 0, problems.join(' | ').slice(0, 200));
await app.close();
mock.close();
rmSync(userData, { recursive: true, force: true });
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
