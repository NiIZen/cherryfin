// Prüft die aus Fladder übernommenen Einstellungen in der echten App, auf einem Testserver und ohne Audiogerät.
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
  args: [project, `--user-data-dir=${userData}`],
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
  throw new Error('Kein Player-Fenster');
};

const openFilm = async (name) => {
  await page.click('.tabbar [aria-label="Filme"]');
  await page.waitForSelector(`[data-tab-page="lib1"] .card[aria-label="${name}"]`);
  await page.waitForTimeout(300);
  await page.click(`[data-tab-page="lib1"] .card[aria-label="${name}"]`);
  await page.waitForSelector('.route:not([hidden]) .btn-play');
  await page.waitForTimeout(1200);
};
const playMkv = async () => {
  await openFilm('MKV Film');
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

/* ---------- Einstellungsseite ---------- */
await page.click('.tabbar [aria-label="Einstellungen"]');
await page.waitForSelector('.list-row.category');
const categories = await page.locator('.list-row.category').allTextContents();
check('Neue Kategorien da', categories.some((c) => c.includes('Untertitel')) && categories.some((c) => c.includes('Tastenkürzel')), categories.join(', '));

const openCategory = async (label) => {
  await page.click(`.list-row.category:has-text("${label}")`);
  await page.waitForTimeout(150);
};
const row = (label) => page.locator(`[data-setting="${label}"]`);
await openCategory('Wiedergabe');
for (const label of ['Qualität im Heimnetz', 'Qualität über das Internet', 'Sprung zurück', 'Sprung vorwärts', 'Tonsprache merken', 'Inkognito', 'Bildanpassung', 'Hardware-Dekodierung', 'Puffer für den Stream', 'Intro', 'Abspann', 'Tempo beim Halten der Maustaste', 'Doppelklick auf das Bild', 'Lautstärke beim Start']) {
  check(`Zeile "${label}"`, await row(label).count() === 1);
}
await row('Sprung vorwärts').click();
check('Klick ändert den Wert', (await stored()).playback?.seekForward === 15, (await stored()).playback?.seekForward);
await row('Intro').click();
check('Segment-Aktion wechselt', (await stored()).playback?.segments?.Intro === 'skip', (await stored()).playback?.segments?.Intro);

await openCategory('Untertitel');
await row('Farbe').click();
check('Untertitelfarbe gespeichert', (await stored()).subtitles?.color === '#ffe066');
const cue = await page.evaluate(() => document.getElementById('cherryfin-cue')?.textContent ?? '');
check('Untertitelstil im eingebauten Player', cue.includes('#ffe066'), cue.slice(0, 50).replace(/\s+/g, ' '));

await openCategory('Darstellung');
await row('Sparmodus').click();
check('Sparmodus schaltet Glas ab', await page.evaluate(() => document.documentElement.dataset.glass) === 'off');
await row('Sparmodus').click();
await row('Spoiler-Schutz').click();
check('Spoiler-Schutz aktiv', await page.evaluate(() => document.documentElement.dataset.spoiler) === 'on');
await row('Hintergrund der Detailseite').click();
check('Hintergrund der Detailseite aktiv', await page.evaluate(() => document.documentElement.dataset.detailBg) === 'sharp');

await openCategory('Tastenkürzel');
await page.click('[data-hotkey="mute"]');
check('Wartet auf eine Taste', (await page.locator('[data-hotkey="mute"]').textContent()).includes('Taste drücken'));
await page.keyboard.press(' ');
check('Belegte Taste wird abgelehnt', (await page.locator('[data-hotkey="mute"]').textContent()).includes('Taste drücken'));
await page.keyboard.press('q');
check('Neue Taste gespeichert', (await stored()).playback?.hotkeys?.mute === 'q');
await page.click('[data-hotkey="next"]');
await page.keyboard.press('q');
const swapped = (await stored()).playback?.hotkeys;
check('Doppelt vergeben tauscht', swapped.next === 'q' && swapped.mute === 'n', JSON.stringify(swapped).slice(0, 60));
await page.click('[data-hotkey="skip"]');
await page.keyboard.press('Escape');
check('Escape bricht ab', (await stored()).playback?.hotkeys?.skip === 's');

/* ---------- Startseite ---------- */
const episode = { Id: 'e1', Name: 'Folge Eins', Type: 'Episode', SeriesId: 'serie', SeriesName: 'Testserie', IndexNumber: 1, ParentIndexNumber: 1, ImageTags: {}, BackdropImageTags: [], UserData: { Played: false } };
mock.state.nextUp = [episode];
const rowsOn = () => page.evaluate(() => [...document.querySelectorAll('[data-tab-page="home"] .row-title, [data-tab-page="home"] [data-section] h2')].map((e) => e.textContent));
await apply({ home: { continueMode: 'separate' } });
await page.waitForTimeout(600);
let titles = await rowsOn();
check('Weiter ansehen getrennt', titles.includes('Weiter ansehen') && titles.includes('Nächste Folgen'), titles.join(' | '));
await apply({ home: { continueMode: 'nextup' } });
await page.waitForTimeout(600);
titles = await rowsOn();
check('Nur nächste Folgen', titles.includes('Nächste Folgen') && !titles.includes('Weiter ansehen'), titles.join(' | '));
mock.state.queries.length = 0;
await apply({ home: { nextUpDays: 30 } });
await page.waitForTimeout(600);
const cutoff = mock.state.queries.find((q) => q.startsWith('/Shows/NextUp') && q.includes('nextUpDateCutoff'));
const days = cutoff ? (Date.now() - new Date(new URL(`http://x${cutoff}`).searchParams.get('nextUpDateCutoff'))) / 86_400_000 : 0;
check('Stichtag für nächste Folgen', Math.abs(days - 30) < 0.1, days.toFixed(2));
mock.state.nextUp = [];
await apply({ home: { heroDetails: false, heroSource: 'continue' } });
await page.waitForTimeout(600);
const heroHidden = await page.evaluate(() => {
  const overview = document.querySelector('[data-tab-page="home"] .hero .hero-overview');
  return !overview || getComputedStyle(overview).display === 'none';
});
check('Beschreibung im Titelbereich aus', heroHidden);
check('Titelbereich zeigt Angefangenes', (await page.locator('[data-tab-page="home"] .hero').textContent()).includes('HLS Film'));

/* ---------- mpv: Startoptionen und Bedienung ---------- */
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
  check(`mpv startet mit ${name}=${value}`, text.includes(`Setting option '${name}' = '${value}'`));
}
check('Qualität im Heimnetz gilt', mock.state.playback.at(-1)?.MaxStreamingBitrate === 8_000_000 || JSON.stringify(mock.state.playback.at(-1)).includes('8000000'));

const t0 = await position(p);
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(700);
const t1 = await position(p);
check('Sprung vorwärts nimmt die Einstellung', t1 - t0 >= 28 && t1 - t0 <= 33, `${t0} -> ${t1}`);
await p.keyboard.press('ArrowLeft');
await p.waitForTimeout(700);
const t2 = await position(p);
check('Sprung zurück nimmt die Einstellung', t1 - t2 >= 2 && t1 - t2 <= 6, `${t1} -> ${t2}`);

await p.keyboard.press('q');
await p.waitForTimeout(250);
check('Eigene Taste: Ton aus', (await notice(p)) === 'Ton aus', await notice(p));
await p.keyboard.press('q');
await p.keyboard.press('+');
await p.waitForTimeout(250);
check('Taste Lauter', (await notice(p)) === 'Lautstärke 85 %', await notice(p));
await p.keyboard.press(']');
await p.waitForTimeout(250);
check('Taste Schneller', (await notice(p)).startsWith('Tempo 1,25'), await notice(p));
await p.keyboard.press('[');
await p.waitForTimeout(250);
text = log();
check('mpv bekommt Lautstärke', /Set property: volume=85/.test(text));
check('mpv bekommt Stumm', /Set property: mute=true/.test(text));

// Maustaste halten: schneller, danach normal und nicht pausiert.
const surface = await p.locator('.player-surface').boundingBox();
await p.mouse.move(surface.x + surface.width / 2, surface.y + surface.height / 2);
await p.mouse.down();
await p.waitForTimeout(600);
check('Halten beschleunigt', (await notice(p)).startsWith('Tempo 3'), await notice(p));
await p.mouse.up();
await p.waitForTimeout(400);
text = log();
check('mpv läuft beim Halten mit 3x', /Set property: speed=3/.test(text));
const notPaused = await p.evaluate(() => !document.querySelector('.player')?.classList.contains('paused'));
const a = await position(p);
await p.waitForTimeout(2200);
const b = await position(p);
check('Nach dem Loslassen läuft der Film weiter', b > a && notPaused, `${a} -> ${b}`);
await closePlayer(p);
check('Normal: Server erfährt die Wiedergabe', mock.state.sessions.length > 0, mock.state.sessions.length);

/* ---------- Inkognito, gemerkte Spur, Segmente ---------- */
mock.state.sessions.length = 0;
await apply({ playback: { incognito: true } });
p = await playMkv();
await p.waitForTimeout(1000);
await closePlayer(p);
check('Inkognito: Server erfährt nichts', mock.state.sessions.length === 0, mock.state.sessions.length);

await page.evaluate(() => localStorage.setItem('jellytv.tracks', JSON.stringify({ audio: 'eng', subtitle: 'deu' })));
await apply({});
const before = log().length;
p = await playMkv();
await p.waitForTimeout(800);
text = log().slice(0);
check('Gemerkte Tonsprache beim Start', /Set property: aid=2 -> 1/.test(text), '');
await closePlayer(p);
await page.evaluate(() => localStorage.removeItem('jellytv.tracks'));
void before;

mock.state.segments = [{ Type: 'Intro', StartTicks: 0, EndTicks: 20 * TICKS }];
await apply({ playback: { segments: { Intro: 'skip' } } });
p = await playMkv();
await p.waitForTimeout(600);
let now = await position(p);
check('Intro automatisch übersprungen', now >= 20, now);
await closePlayer(p);

await apply({ playback: { segments: { Intro: 'off' } } });
p = await playMkv();
check('Abschnitt auf "Nichts tun": kein Knopf', await p.locator('[data-skip-button]').count() === 0);
now = await position(p);
check('Abschnitt auf "Nichts tun": kein Sprung', now < 15, now);
await closePlayer(p);

await apply({ playback: { segments: { Intro: 'ask' } } });
p = await playMkv();
check('Abschnitt auf "Knopf zeigen": Knopf da', await p.locator('[data-skip-button]').count() === 1);
await closePlayer(p);
mock.state.segments = [];

/* ---------- Eingebauter Player ---------- */
await apply({ playerBackend: 'builtin', playback: { fit: 'cover', volume: 60, seekForward: 30 } });
await openFilm('Direkter Film');
await page.click('.route:not([hidden]) .btn-play');
await page.waitForSelector('.player-video');
await page.waitForTimeout(1800);
const style = await page.evaluate(() => {
  const v = document.querySelector('.player-video');
  return { fit: getComputedStyle(v).objectFit, volume: v.volume, paused: v.paused, time: v.currentTime };
});
check('Eingebaut: Bildanpassung', style.fit === 'cover', style.fit);
check('Eingebaut: Lautstärke', Math.abs(style.volume - 0.6) < 0.01, style.volume);
check('Eingebaut: Läuft', !style.paused && style.time > 0, style.time);
await page.keyboard.press('+');
await page.waitForTimeout(200);
check('Eingebaut: Taste Lauter', Math.abs(await page.evaluate(() => document.querySelector('.player-video').volume) - 0.65) < 0.01);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
const preview = await page.evaluate(() => Number(document.querySelector('[role=slider]')?.getAttribute('aria-valuenow') ?? -1));
check('Eingebaut: Sprunglänge', preview >= 28 && preview <= 33, preview);

/* ---------- Bildschirmschoner ---------- */
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(500);
await apply({ playerBackend: 'builtin', playback: { screensaver: 'clock' } });
await openFilm('Direkter Film');
await page.click('.route:not([hidden]) .btn-play');
await page.waitForSelector('.player-video');
await page.waitForTimeout(1500);
await page.keyboard.press(' ');
await page.waitForTimeout(61_000);
const saver = await page.locator('.player-saver span').textContent().catch(() => '');
check('Schoner erscheint nach einer Minute Pause', /^\d\d:\d\d$/.test(saver), saver);
await page.mouse.move(300, 300);
await page.mouse.move(320, 320);
await page.waitForTimeout(200);
check('Bewegung beendet den Schoner', await page.locator('.player-saver').count() === 0);

check('Keine Fehler in der Seite', problems.length === 0, problems.join(' | ').slice(0, 200));
await app.close();
mock.close();
rmSync(userData, { recursive: true, force: true });
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} von ${results.length} bestanden`);
process.exit(failed ? 1 : 0);
