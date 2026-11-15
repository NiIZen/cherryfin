// Runs in an old Electron as a stand-in for the TV engine. No visible windows.
if (process.env.TV_NOAUDIO) require('electron').app.commandLine.appendSwitch('disable-audio-output');
const { app, BrowserWindow } = require('electron');

const fs = require('fs');
const path = require('path');

const buildDir = process.env.TV_BUILD;
const shotDir = process.env.TV_SHOTS;
const label = process.env.TV_LABEL;
const port = process.env.TV_PORT;
const results = [];
const errors = [];
const check = (name, ok, detail) => {
  results.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== undefined ? ` -> ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'jellytv-tv-')));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.disableHardwareAcceleration();
let lastImage = null;
let win;

const js = (code) => win.webContents.executeJavaScript(code);
const until = async (code, timeout = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await js(`Boolean(${code})`)) return true;
    await sleep(100);
  }
  throw new Error(`Timeout: ${code}`);
};
/** Sends a key like the remote does: only with a key code, without a key name. */
const press = async (keyCode, gap = 120) => {
  await js(`(() => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { value: ${keyCode} });
    Object.defineProperty(e, 'key', { value: 'Unidentified' });
    (document.activeElement || document.body).dispatchEvent(e);
  })()`);
  await sleep(gap);
};
const KEY = { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, OK: 13, BACK: 461, PLAY: 415, PAUSE: 19, STOP: 413, FF: 417, RW: 412 };
const active = () => js(`(document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim().slice(0, 30)) || ''`);
const shot = async (name) => {
  await sleep(500);
  if (lastImage) fs.writeFileSync(path.join(shotDir, `${label}-${name}.png`), lastImage.toPNG());
};
const clickKey = (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.click(); return Boolean(el); })()`);
const typeText = async (text) => {
  for (const char of text) {
    const lower = char.toLowerCase();
    const needUpper = char !== lower;
    await clickKey(`[data-key="${lower}"]`);
    if (needUpper) throw new Error('Capital letters are not supported in this test');
  }
};
const boot = async () => {
  await win.loadFile(path.join(buildDir, 'index.html'));
  await until(`document.querySelector('#root').children.length > 0`);
};

async function run() {
  win = new BrowserWindow({ show: false, width: 1920, height: 1080, enableLargerThanScreen: true, webPreferences: { offscreen: true, nodeIntegration: false, backgroundThrottling: false } });
  win.setSize(1920, 1080);
  win.webContents.on('paint', (_e, _d, image) => { lastImage = image; });
  win.webContents.setFrameRate(10);
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  win.webContents.on('crashed', () => errors.push('Renderer crashed'));

  await boot();
  // Old Electron versions ignore --lang, so the test sets the interface language directly.
  await js(`localStorage.setItem('jellytv.settings', JSON.stringify({ language: 'en' }))`);
  await boot();
  console.log('Engine:', await js('navigator.userAgent.match(/Chrome\\/[\\d.]+/)[0]'));
  await until(`document.querySelector('.connect-panel')`);
  await sleep(600);

  const env = await js(`({
    tv: document.documentElement.classList.contains('tv'),
    noGap: document.documentElement.classList.contains('no-flex-gap'),
    rem: getComputedStyle(document.documentElement).fontSize,
    w: innerWidth, h: innerHeight,
    fieldFocus: document.activeElement.classList.contains('tv-field'),
    keys: document.querySelectorAll('.tv-keyboard .key').length,
    inputs: document.querySelectorAll('input').length,
  })`);
  check('TV mode, 1 rem = 16 px at 1920', env.tv && env.rem === '16px', JSON.stringify(env));
  check('No real input fields, the TV keyboard stays closed', env.inputs === 0);
  check('Server field has the first focus', env.fieldFocus);
  await shot('01-connect');

  /* ---------- Control with remote keys only ---------- */
  await press(KEY.DOWN);
  check('Arrow down leads into the keyboard', await js(`document.activeElement.classList.contains('key')`), await active());
  await press(KEY.RIGHT);
  const key = await js(`document.activeElement.dataset.key`);
  await press(KEY.OK);
  check('OK types the character', (await js(`document.querySelector('.tv-field').textContent`)).includes(key), key);
  await clickKey('[data-key="backspace"]');

  /* ---------- Sign-in to the test server ---------- */
  await typeText(`127.0.0.1:${port}`);
  await sleep(100);
  check('Address is in the field', (await js(`document.querySelector('.tv-field').textContent`)) === `127.0.0.1:${port}`);
  await js(`document.querySelector('button[type=submit]').click()`);
  await until(`document.querySelector('[aria-label=Password]')`);
  await sleep(300);
  await shot('02-login');
  await typeText(process.env.TV_USER);
  await js(`document.querySelector('[aria-label=Password]').click()`);
  await sleep(150);
  await typeText(process.env.TV_PASS.replace(/-/g, '-'));
  await js(`document.querySelector('button[type=submit]').click()`);
  await until(`document.querySelector('[data-tab-page="home"] .hero')`);
  await sleep(800);
  check('Sign-in and home screen', true, await active());
  const stored = await js(`localStorage.getItem('jellytv.dev-session') !== null`);
  check('Sign-in is kept across restarts', stored);
  await shot('03-home');

  /* ---------- Section and player ---------- */
  await js(`document.querySelector('.tabbar [aria-label=Movies]').click()`);
  await until(`document.querySelector('[data-tab-page="lib1"] .vrow .card')`);
  await sleep(500);
  await js(`document.querySelector('[data-tab-page="lib1"] .card[aria-label="Direct Movie"]').click()`);
  await until(`document.querySelector('.detail-hero .btn-play')`);
  await sleep(700);
  await js(`document.querySelector('.route:not([hidden]) .btn-play').click()`);
  await until(`document.querySelector('.player-video')`);
  await until(`document.querySelector('.player-video').currentTime > 0.3`, 20000);
  check('Video plays', true);
  const url = await js(`document.querySelector('.player-video').currentSrc`);
  check('Stream address carries the file extension', /\/stream\.mp4\?/.test(url), url.replace(/api_key=[^&]+/, 'api_key=…'));

  await press(KEY.PAUSE, 400);
  check('Pause key pauses', await js(`document.querySelector('.player-video').paused`));
  await press(KEY.PLAY, 400);
  check('Play key resumes', !(await js(`document.querySelector('.player-video').paused`)));
  const before = await js(`document.querySelector('.player-video').currentTime`);
  await press(KEY.FF, 1000);
  const afterFf = await js(`document.querySelector('.player-video').currentTime`);
  check('Fast forward skips 30 seconds', afterFf - before > 25, `${before.toFixed(1)} -> ${afterFf.toFixed(1)}`);
  await press(KEY.RW, 1000);
  await press(KEY.STOP, 500);
  await until(`!document.querySelector('.player-video')`);
  check('Stop key ends playback', true);
  await press(KEY.BACK, 500);
  check('Back key leads back from details', await js(`!document.querySelector('.route:not([hidden]) .detail-hero')`));

  /* ---------- HLS when the server has to convert ---------- */
  await js(`document.querySelector('[data-tab-page="lib1"] .card[aria-label="HLS Movie"]').click()`);
  await until(`document.querySelector('.route:not([hidden]) .btn-play')`);
  await sleep(700);
  await js(`document.querySelector('.route:not([hidden]) .btn-play').click()`);
  await until(`document.querySelector('.player-video') && document.querySelector('.player-video').currentTime >= 30`, 25000);
  check('HLS plays at the resume point', true, (await js(`document.querySelector('.player-video').currentTime`)).toFixed(1));
  await press(KEY.STOP, 600);
  await press(KEY.BACK, 500);

  /* ---------- Layout in demo mode ---------- */
  await js(`localStorage.removeItem('jellytv.dev-session')`);
  await boot();
  await until(`document.querySelector('.connect-panel')`);
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'Try the demo').click()`);
  await until(`document.querySelector('[data-tab-page="home"] .hero')`);
  await sleep(1500);
  await shot('04-demo-home');
  await press(KEY.DOWN);
  await press(KEY.RIGHT);
  await sleep(700);
  check('Arrows lead through the cards', await js(`document.activeElement.classList.contains('card')`), await active());
  await shot('05-demo-row');
  const box = await js(`(() => { const r = document.querySelector('.card-landscape .card-media').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  check('Cards keep the 16:9 aspect ratio', Math.abs(box.w / box.h - 16 / 9) < 0.05, JSON.stringify(box));
  const gap = await js(`(() => { const c = document.querySelectorAll('.row-scroller .card'); return Math.round(c[1].getBoundingClientRect().left - c[0].getBoundingClientRect().right); })()`);
  check('Cards are spaced apart', gap > 15, `${gap} px`);

  await js(`document.querySelector('.tabbar [aria-label=Movies]').click()`);
  await until(`document.querySelector('.tab-page:not([hidden]) .vrow .card')`);
  await sleep(1000);
  await shot('06-demo-overview');
  const poster = await js(`(() => { const r = document.querySelector('.tab-page:not([hidden]) .card-poster .card-media').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  check('Posters keep the 2:3 aspect ratio', Math.abs(poster.h / poster.w - 1.5) < 0.05, JSON.stringify(poster));
  const rail = await js(`(() => { const l = [...document.querySelectorAll('.tab-page:not([hidden]) .alpha-key')].map((k) => k.getBoundingClientRect()); return { n: l.length, bottom: Math.round(l[l.length - 1].bottom) }; })()`);
  check('A–Z bar fits on the screen', rail.n === 27 && rail.bottom <= 1080, JSON.stringify(rail));

  await js(`document.querySelector('.tabbar [aria-label=Settings]').click()`);
  await sleep(600);
  await js(`document.querySelector('[data-category=playback]').click()`);
  await sleep(600);
  await shot('07-demo-settings');
  check('No mpv option on the TV', await js(`!document.querySelector('[data-setting="Play with"]')`));
  check('DTS switch present', await js(`Boolean(document.querySelector('[data-setting="Play DTS directly"]'))`));

  await js(`document.querySelector('[data-category=library]').click()`);
  await js(`document.querySelector('.tabbar [aria-label=Home]').click()`);
  await sleep(500);
  await js(`document.querySelector('[data-tab-page="home"] .hero .btn-primary').click()`);
  await until(`document.querySelector('.player-video') && document.querySelector('.player-video').currentTime > 0.5`, 20000);
  await sleep(1200);
  await shot('08-demo-player');
  await press(KEY.STOP, 700);

  /* ---------- Back on the top level closes the app ---------- */
  let closed = false;
  win.on('closed', () => { closed = true; });
  await js(`document.querySelector('.tabbar [aria-label=Home]').focus()`);
  js(`(() => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { value: ${KEY.BACK} });
    Object.defineProperty(e, 'key', { value: 'Unidentified' });
    document.activeElement.dispatchEvent(e);
  })()`).catch(() => undefined);
  await sleep(1500);
  check('Back on the top level closes the app', closed || win.isDestroyed());
}

app.on('window-all-closed', () => undefined);
app.on('ready', () => {
  run().catch(async (error) => {
    check('Run', false, error.message);
    if (win && !win.isDestroyed()) {
      console.log('Video:', JSON.stringify(await js(`(() => { const v = document.querySelector('.player-video'); return v && { src: v.currentSrc.replace(/api_key=[^&]+/, ''), rs: v.readyState, ns: v.networkState, paused: v.paused, t: v.currentTime, err: v.error && v.error.code, msg: v.error && v.error.message, vis: document.visibilityState, focus: document.hasFocus() }; })()`).catch((e) => e.message)));
      console.log('Seitentext:', (await js('document.body.innerText').catch(() => '')).replace(/\s+/g, ' ').slice(0, 400));
      await shot('99-error').catch(() => undefined);
    }
  }).then(() => {
    const unique = errors.filter((e, i) => errors.indexOf(e) === i && !/Failed to load resource/.test(e));
    console.log(unique.length ? `Konsolenfehler:\n${unique.join('\n')}` : 'Keine Konsolenfehler.');
    console.log(`${results.filter(Boolean).length}/${results.length} passed`);
    app.exit(0);
  });
});
