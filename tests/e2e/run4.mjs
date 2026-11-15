// Prüft die Wiedergabe mit mpv im echten Fensteraufbau: Video unten, Oberfläche transparent darüber.
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { startMockServer, TEST_PASSWORD, TEST_USER } from './mock-server.mjs';

const project = process.argv[2];
const hlsDir = process.argv[3];
const mkvFile = process.argv[4];
const shots = path.join(import.meta.dirname, 'shots');
const results = [];
const check = (name, ok, detail = '') => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== '' ? ` -> ${detail}` : ''}`);
};

const mock = await startMockServer({ videoFile: path.join(project, 'public/demo/demo.mp4'), hlsDir, mkvFile });
const userData = mkdtempSync(path.join(os.tmpdir(), 'jellytv-e2e-'));
const logFile = path.join(userData, 'mpv.log');
let app;
let page;
const problems = [];

const launch = async (env = {}) => {
  app = await electron.launch({
    executablePath: process.env.TEST_EXE || path.join(project, 'node_modules/electron/dist/electron.exe'),
    args: process.env.TEST_EXE ? [`--user-data-dir=${userData}`] : [project, `--user-data-dir=${userData}`],
    cwd: project,
    env: { ...process.env, CHERRYFIN_MPV_LOG: logFile, ...env },
  });
  page = await app.firstWindow();
  page.on('pageerror', (e) => problems.push(e.message));
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds({ x: 40, y: 40, width: 1200, height: 700 }); });
};
const wait = (ms) => page.waitForTimeout(ms);
const sameBox = (a, b) => a && b && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 2);
const mpvRunning = () => execFileSync('tasklist', ['/FI', 'IMAGENAME eq mpv.exe', '/NH']).toString().includes('mpv.exe');

/**
 * Erfasst ausschließlich die Fenster von JellyTV über ihre Fenster-ID, niemals den Bildschirm.
 * Liegt das Fenster nicht vorne, kommt trotzdem nur sein eigener Inhalt zurück.
 */
const capture = async (name) => {
  const data = await app.evaluate(async ({ BrowserWindow, desktopCapturer }) => {
    const overlay = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
    const host = overlay.getParentWindow();
    const id = host.getMediaSourceId();
    const size = overlay.getBounds();
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: size.width, height: size.height } });
    const video = sources.find((source) => source.id === id);
    const ui = await overlay.webContents.capturePage();
    const uiSize = ui.getSize();
    const bitmap = ui.toBitmap();
    const alphaAt = (x, y) => bitmap[(Math.floor(y * uiSize.height) * uiSize.width + Math.floor(x * uiSize.width)) * 4 + 3];
    return {
      video: video ? video.thumbnail.toDataURL() : null,
      ui: ui.toDataURL(),
      alphaCenter: alphaAt(0.5, 0.35),
    };
  });
  // Video und Oberfläche werden in einer Zeichenfläche übereinandergelegt, wie das Auge sie sieht.
  const merged = await page.evaluate(async ({ video, ui }) => {
    const load = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
    const top = await load(ui);
    const canvas = document.createElement('canvas');
    canvas.width = top.width;
    canvas.height = top.height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, canvas.width, canvas.height);
    let videoBright = null;
    if (video) {
      const bottom = await load(video);
      g.drawImage(bottom, 0, 0, canvas.width, canvas.height);
      const sample = g.getImageData(0, 0, canvas.width, Math.floor(canvas.height * 0.6)).data;
      let sum = 0;
      for (let i = 0; i < sample.length; i += 400) sum += sample[i] + sample[i + 1] + sample[i + 2];
      videoBright = sum / (sample.length / 400) / 3;
    }
    g.drawImage(top, 0, 0);
    return { png: canvas.toDataURL('image/png'), videoBright };
  }, data);
  writeFileSync(path.join(shots, `${name}.png`), Buffer.from(merged.png.split(',')[1], 'base64'));
  return { foundVideo: Boolean(data.video), alphaCenter: data.alphaCenter, videoBright: merged.videoBright };
};

const verifiedScreenshot = async (p, name) => {
  await p.evaluate(() => {
    for (const [x, y] of [['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']]) {
      const mark = document.createElement('div');
      mark.className = 'test-mark';
      mark.style.cssText = `position:fixed;${x}:0;${y}:0;width:24px;height:24px;background:rgb(255,0,255);z-index:99999`;
      document.body.appendChild(mark);
    }
  });
  // Das Bild des ganzen Bildschirms bleibt im Hauptprozess. Heraus kommt nur der Ausschnitt des Players.
  let png;
  try {
    png = await app.evaluate(async ({ BrowserWindow, desktopCapturer, screen }) => {
      const overlay = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
      const host = overlay.getParentWindow();
      host.setAlwaysOnTop(true, 'screen-saver');
      overlay.setAlwaysOnTop(true, 'screen-saver');
      overlay.moveTop();
      await new Promise((r) => setTimeout(r, 600));
      const bounds = overlay.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const f = display.scaleFactor;
      const size = { width: Math.round(display.size.width * f), height: Math.round(display.size.height * f) };
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
      const crop = source.thumbnail.crop({
        x: Math.round((bounds.x - display.bounds.x) * f) + 6,
        y: Math.round((bounds.y - display.bounds.y) * f) + 6,
        width: Math.round(bounds.width * f) - 12,
        height: Math.round(bounds.height * f) - 12,
      });
      return crop.toPNG().toString('base64');
    });
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      const overlay = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
      overlay.setAlwaysOnTop(false);
      overlay.getParentWindow().setAlwaysOnTop(false);
    });
    await p.evaluate(() => document.querySelectorAll('.test-mark').forEach((m) => m.remove()));
  }
  const result = await page.evaluate(async (src) => {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const magenta = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return d[0] > 240 && d[1] < 15 && d[2] > 240; };
    const w = img.width - 1;
    const h = img.height - 1;
    const marks = [magenta(2, 2), magenta(w - 2, 2), magenta(2, h - 2), magenta(w - 2, h - 2)];
    if (!marks.every(Boolean)) return { verified: false, marks };
    const sample = g.getImageData(0, 0, img.width, Math.floor(img.height * 0.6)).data;
    let sum = 0;
    for (let i = 0; i < sample.length; i += 400) sum += sample[i] + sample[i + 1] + sample[i + 2];
    return { verified: true, bright: sum / (sample.length / 400) / 3 };
  }, `data:image/png;base64,${png}`);
  // Nur mit allen Markierungen ist sicher, dass ausschließlich der Player im Bild ist.
  if (result.verified) writeFileSync(path.join(shots, `${name}.png`), Buffer.from(png, 'base64'));
  return result;
};

const overlayPage = async () => {
  for (let i = 0; i < 100; i++) {
    const found = app.windows().find((w) => w.url().includes('#player'));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Kein Player-Fenster');
};
const playerTime = (p) => p.evaluate(() => Number(document.querySelector('[role=slider]')?.getAttribute('aria-valuenow') ?? -1));
const waitTime = async (p, min, timeout = 15000) => {
  await p.waitForFunction((m) => Number(document.querySelector('[role=slider]')?.getAttribute('aria-valuenow') ?? -1) >= m, min, { timeout });
};
const startItem = async (label, tab = 'lib1') => {
  await page.click(`[data-tab-page="${tab}"] .card[aria-label="${label}"]`);
  await page.waitForSelector('.route:not([hidden]) .detail-hero');
  await wait(1200);
  await page.click('.route:not([hidden]) .btn-play');
  return overlayPage();
};
const audioNote = async (p) => {
  await p.click('[data-menu-button="audio"]');
  await p.waitForSelector('[data-audio-output]', { timeout: 8000 });
  const text = await p.textContent('[data-audio-output]');
  return text;
};

try {
  /* ---------- Anmeldung, Einstellungen wie bei dir: Passthrough an ---------- */
  await launch({ CHERRYFIN_MPV_AO: 'null' });
  await page.waitForSelector('.connect-panel');
  await page.evaluate(() => localStorage.setItem('jellytv.settings', JSON.stringify({
    fullscreenPlayback: false,
    audio: { mode: 'passthrough', formats: ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd'], exclusive: false, device: 'auto' },
  })));
  await page.locator('.connect-panel .text-field').first().fill(`127.0.0.1:${mock.port}`);
  await page.keyboard.press('Enter');
  await page.waitForSelector('input[type=password]');
  await page.locator('.text-field').first().fill(TEST_USER);
  await page.locator('input[type=password]').fill(TEST_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-tab-page="home"] .hero');
  await wait(500);
  await page.click('.tabbar [aria-label="Filme"]');
  await page.waitForSelector('[data-tab-page="lib1"] .vrow');
  await wait(300);

  /* ---------- MKV direkt, Fensteraufbau ---------- */
  const p = await startItem('MKV Film');
  p.on('pageerror', (e) => problems.push(`Player: ${e.message}`));
  await p.waitForSelector('.player.external', { timeout: 10000 });
  await waitTime(p, 1, 20000);
  check('MKV läuft in mpv', true, `${await playerTime(p)} s`);
  check('Server hat MKV direkt erlaubt', mock.state.playback.at(-1).DeviceProfile.DirectPlayProfiles[0].Container === undefined);
  check('Es wird nichts transkodiert', mock.state.sessions.some((s) => s.route === '/Sessions/Playing' && s.PlayMethod === 'DirectPlay'));
  const win = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().map((w) => ({ visible: w.isVisible(), child: Boolean(w.getParentWindow()), b: w.getBounds() })));
  const host = win.find((w) => w.visible && !w.child);
  const over = win.find((w) => w.child);
  check('Hauptfenster ist ausgeblendet, Video und Oberfläche sichtbar', win.filter((w) => w.visible).length === 2);
  check('Oberfläche liegt genau über dem Video', sameBox(host?.b, over?.b), JSON.stringify(over?.b));
  await p.mouse.move(400, 200);
  await p.mouse.move(500, 250);
  await p.waitForSelector('.player.show-overlay');
  await verifiedScreenshot(p, '70-mpv-overlay');

  await p.waitForSelector('.player.hide-overlay', { timeout: 8000 });
  await wait(500);
  const clean = await capture('71-mpv-clean');
  check('Oberfläche ist über dem Video durchsichtig', clean.alphaCenter === 0, `Alpha ${clean.alphaCenter}`);
  const shot = await verifiedScreenshot(p, '71-mpv-clean');
  check('Aufnahme zeigt nur den Player', shot.verified, JSON.stringify(shot.marks ?? ''));
  check('mpv zeigt wirklich Bild unter der Oberfläche', shot.verified && shot.bright > 5, `Helligkeit ${shot.bright?.toFixed(1)}`);

  /* ---------- Passthrough je Format, ohne Neuladen ---------- */
  const requests = mock.state.playback.length;
  await p.mouse.move(505, 255);
  let note = await audioNote(p);
  check('AC3 geht als Passthrough raus', note === 'Passthrough: Dolby Digital', note);
  await p.mouse.move(500, 250);
  await wait(200);
  await verifiedScreenshot(p, '72-mpv-audio-menu');

  for (const [title, expected] of [['Dolby Digital+', 'Passthrough: Dolby Digital Plus'], ['TrueHD', 'Passthrough: Dolby TrueHD'], ['DTS', 'Passthrough: DTS']]) {
    await p.click(`.menu-item:has-text("${title}")`);
    await wait(1800);
    await p.mouse.move(490 + Math.random() * 10, 250);
    note = await audioNote(p);
    check(`${title}: Spur gewechselt, Passthrough aktiv`, note === expected, note);
  }
  check('Spurwechsel braucht keinen neuen Stream vom Server', mock.state.playback.length === requests);
  await p.keyboard.press('Escape');
  await wait(300);

  /* ---------- Untertitel, Bedienung ---------- */
  await p.mouse.move(500, 260);
  await p.click('[data-menu-button="subtitles"]');
  await p.click('.menu-item:has-text("Deutsch")');
  await wait(500);
  check('Untertitel aus der Datei brauchen keinen neuen Stream', mock.state.playback.length === requests);

  const before = await playerTime(p);
  await p.locator('[role=slider]').focus();
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction((b) => Number(document.querySelector('[role=slider]').getAttribute('aria-valuenow')) >= b + 25, before, { timeout: 6000 });
  check('Pfeiltasten springen vor', true, `${before} -> ${await playerTime(p)} s`);
  await wait(1200);

  await p.keyboard.press(' ');
  await wait(500);
  const t1 = await playerTime(p);
  check('Leertaste pausiert', await p.locator('.player-state .icon').count() === 1);
  await wait(1500);
  check('Zeit steht in der Pause still', await playerTime(p) === t1, `${t1} s`);
  await p.keyboard.press(' ');
  await p.waitForFunction((b) => Number(document.querySelector('[role=slider]').getAttribute('aria-valuenow')) > b, t1, { timeout: 5000 });
  check('Leertaste setzt fort', true);

  /* ---------- Vollbild ---------- */
  await p.keyboard.press('f');
  await wait(1200);
  const full = await app.evaluate(({ BrowserWindow, screen }) => {
    const all = BrowserWindow.getAllWindows();
    const top = all.find((w) => w.getParentWindow());
    const video = top.getParentWindow();
    return { fullscreen: video.isFullScreen(), over: top.getBounds(), video: video.getBounds(), display: screen.getDisplayMatching(video.getBounds()).bounds };
  });
  check('F schaltet Vollbild, Oberfläche deckt das Video', full.fullscreen && sameBox(full.over, full.video) && sameBox(full.video, full.display), JSON.stringify(full));
  const inFull = await verifiedScreenshot(p, '75-mpv-fullscreen');
  check('Im Vollbild bleibt das Bild sichtbar', inFull.verified && inFull.bright > 5, `Helligkeit ${inFull.bright?.toFixed(1)}`);
  await p.keyboard.press('f');
  await wait(1000);
  const afterFull = await verifiedScreenshot(p, '76-mpv-after-fullscreen');
  check('Nach dem Vollbild bleibt das Bild sichtbar', afterFull.verified && afterFull.bright > 5, `Helligkeit ${afterFull.bright?.toFixed(1)}`);
  const leftFull = await app.evaluate(({ BrowserWindow }) => {
    const top = BrowserWindow.getAllWindows().find((w) => w.getParentWindow());
    const a = top.getBounds(); const b = top.getParentWindow().getBounds(); return { full: top.getParentWindow().isFullScreen(), same: ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 2), a, b };
  });
  check('Zurück aus dem Vollbild', !leftFull.full && leftFull.same, JSON.stringify(leftFull));

  /* ---------- Absturz von mpv ---------- */
  execFileSync('taskkill', ['/F', '/IM', 'mpv.exe']);
  await p.waitForSelector('.player-error', { timeout: 8000 });
  check('Absturz zeigt eine Meldung mit Neu laden', (await p.textContent('.player-error')).includes('Neu laden'));
  const crashedAt = await playerTime(p);
  await p.click('.player-error .btn-primary');
  await p.waitForSelector('.player-error', { state: 'detached', timeout: 8000 });
  await waitTime(p, crashedAt + 1, 15000);
  check('Neu laden startet mpv wieder an derselben Stelle', true, `${crashedAt} -> ${await playerTime(p)} s`);

  /* ---------- Beenden ---------- */
  await p.mouse.move(505, 250);
  await wait(300);
  await p.click('.back-btn');
  await page.waitForFunction(() => document.visibilityState === 'visible', null, { timeout: 5000 }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 2200));
  const after = await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().map((w) => ({ visible: w.isVisible(), child: Boolean(w.getParentWindow()) })));
  check('Zurück: Hauptfenster wieder da, Player-Fenster weg', after.length === 1 && after[0].visible);
  check('mpv ist beendet', !mpvRunning());
  check('Stand wird dem Server gemeldet', mock.state.sessions.some((s) => s.route === '/Sessions/Playing/Stopped' && s.PositionTicks > 0));
  check('Fokus liegt wieder auf der Detailseite', await page.evaluate(() => Boolean(document.activeElement?.closest('.detail'))));
  await page.keyboard.press('Escape');
  await wait(500);

  /* ---------- HLS, wenn der Server umwandeln muss ---------- */
  const h = await startItem('HLS Film');
  await waitTime(h, 30, 20000);
  const hlsT = await playerTime(h);
  check('mpv spielt HLS am Fortsetzungspunkt', hlsT >= 30 && hlsT < 50, `${hlsT} s`);
  await h.mouse.move(505, 250);
  await wait(300);
  await h.click('.back-btn');
  await new Promise((r) => setTimeout(r, 2000));
  await page.keyboard.press('Escape');
  await wait(400);

  /* ---------- Einstellungen ---------- */
  await page.mouse.move(600, 20);
  await wait(450);
  await page.click('.tabbar [aria-label="Einstellungen"]');
  await wait(300);
  await page.click('[data-category="playback"]');
  await wait(800);
  await page.evaluate(() => document.querySelector('.settings-list').scrollIntoView());
  await page.screenshot({ path: path.join(shots, '74-audio-settings.png') });
  const devices = await page.textContent('[data-setting="Ausgabegerät"]');
  check('Ausgabegerät steht zur Auswahl', devices.includes('Automatisch'), devices);
  check('Passthrough ist an, Formate stehen zur Auswahl', await page.locator('[data-setting="Dolby TrueHD"]').count() === 1);
  await page.click('[data-setting="Passthrough an den Receiver"]');
  await wait(200);
  check('Aus: Formate verschwinden', await page.locator('[data-setting="Dolby TrueHD"]').count() === 0);
  await page.click('[data-setting="Wiedergabe mit"]');
  await wait(200);
  check('Eingebauter Player wählbar: Hinweis auf Grenze', (await page.textContent('.settings-note.below')).includes('kein Passthrough'));
  await page.click('[data-setting="Wiedergabe mit"]');
  await wait(200);
  await app.close();

  /* ---------- Echtes Audiogerät: stille Datei, PCM ---------- */
  await launch();
  await page.waitForSelector('.tabbar', { timeout: 15000 });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('jellytv.settings'));
    localStorage.setItem('jellytv.settings', JSON.stringify({ ...s, fullscreenPlayback: false, playerBackend: 'mpv', audio: { ...s.audio, mode: 'pcm', exclusive: false } }));
    location.reload();
  });
  await page.waitForSelector('.tabbar', { timeout: 15000 });
  await wait(600);
  await page.click('.tabbar [aria-label="Filme"]');
  await page.waitForSelector('[data-tab-page="lib1"] .vrow');
  await wait(300);
  const r = await startItem('MKV Film');
  await waitTime(r, 1, 20000);
  await r.mouse.move(505, 255);
  const real = await audioNote(r);
  check('Echtes Gerät: mpv dekodiert und gibt PCM aus', real.startsWith('PCM'), real);
  await r.keyboard.press('Escape');
  await wait(200);
  await r.mouse.move(500, 250);
  await wait(300);
  await r.click('.back-btn');
  await new Promise((res) => setTimeout(res, 1500));
} catch (error) {
  check('Durchlauf', false, error.message.split('\n').slice(0, 3).join(' | '));
} finally {
  console.log(problems.length ? `\nFehler:\n${[...new Set(problems)].join('\n')}` : '\nKeine Seitenfehler.');
  console.log(`\n${results.filter(Boolean).length}/${results.length} bestanden`);
  await app?.close().catch(() => undefined);
  mock.close();
  try {
    const log = (await import('node:fs')).readFileSync(logFile, 'utf8');
    const lines = log.split('\n').filter((l) => /\[e\]|\[w\]|spdif|Error parsing/i.test(l)).slice(0, 12);
    if (lines.length) console.log('\nAus dem mpv-Protokoll:\n' + lines.join('\n'));
  } catch { /* Kein Protokoll vorhanden. */ }
  if (mpvRunning()) execFileSync('taskkill', ['/F', '/IM', 'mpv.exe']);
  rmSync(userData, { recursive: true, force: true });
}
