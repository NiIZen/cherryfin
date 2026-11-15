const { app, BaseWindow, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const dgram = require('node:dgram');
const crypto = require('node:crypto');
const { MpvProcess, wakeAudioDevice, listAudioDevices } = require('./mpv.cjs');
const win32 = require('./win32.cjs');

// Tests only: a separate folder instead of %APPDATA%, to check the data migration.
if (process.env.CHERRYFIN_APPDATA) {
  app.setPath('appData', process.env.CHERRYFIN_APPDATA);
  app.setPath('userData', path.join(process.env.CHERRYFIN_APPDATA, 'Cherryfin'));
}

// Up to version 0.5 the app used a different name. Sign-in and settings move over on the first start.
function adoptLegacyData() {
  if (app.commandLine.hasSwitch('user-data-dir')) return;
  const legacy = path.join(app.getPath('appData'), 'JellyTV');
  const current = app.getPath('userData');
  if (!fs.existsSync(legacy) || fs.existsSync(current)) return;
  try {
    fs.renameSync(legacy, current);
  } catch {
    // For example while the old version is still running: the old folder stays in use then.
    app.setPath('userData', legacy);
  }
}
adoptLegacyData();

// Player and hero start without a prior click (e.g. when using only a gamepad).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
const storeFile = () => path.join(app.getPath('userData'), 'session.bin');

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    show: false,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // The app stays on its own page. External links open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen', false));

  loadApp(win);
}

function loadApp(target, hash) {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) target.loadURL(hash ? `${devUrl}#${hash}` : devUrl);
  else target.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), hash ? { hash } : undefined);
}

/* ---------- Playback with mpv ----------
 * An mpv window cannot be overlaid by web content in the same window.
 * So mpv renders into its own black window, with a transparent window holding the
 * player interface on top. The main window is hidden meanwhile.
 */

let player = null;

function mpvExecutable() {
  const file = app.isPackaged
    ? path.join(process.resourcesPath, 'mpv', 'mpv.exe')
    : path.join(__dirname, '..', 'vendor', 'mpv', 'mpv.exe');
  return fs.existsSync(file) ? file : null;
}

function syncOverlay() {
  if (!player || player.dragging || player.overlay.isDestroyed() || player.host.isDestroyed()) return;
  player.overlay.setBounds(player.host.getBounds());
}

function closePlayer() {
  if (!player) return;
  const current = player;
  player = null;
  clearInterval(current.raiseTimer);
  current.mpv.stop();
  if (win && !win.isDestroyed()) {
    if (!win.isFullScreen() && !current.host.isDestroyed() && !current.host.isFullScreen()) win.setBounds(current.host.getBounds());
    win.show();
    win.focus();
    win.webContents.send('player:closed');
  }
  if (!current.overlay.isDestroyed()) current.overlay.destroy();
  if (!current.host.isDestroyed()) current.host.destroy();
}

function openPlayer(params) {
  const executable = mpvExecutable();
  if (!executable || !win32.available() || player) return false;

  const fullscreen = Boolean(params.fullscreen) || win.isFullScreen();
  // A window without web content: Chromium’s render surface would cover mpv otherwise.
  const host = new BaseWindow({
    ...win.getBounds(),
    frame: false,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Cherryfin',
    icon: path.join(__dirname, 'icon.png'),
  });
  const overlay = new BrowserWindow({
    ...win.getBounds(),
    parent: host,
    frame: false,
    show: false,
    transparent: true,
    hasShadow: false,
    thickFrame: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlay.webContents.on('will-navigate', (event) => event.preventDefault());
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const startMpv = () => {
    const mpv = new MpvProcess(executable, {
      // Window handles on Windows are 32 bits wide, even in 64-bit processes.
      wid: host.getNativeWindowHandle().readUInt32LE(0),
      pipe: `\\\\.\\pipe\\cherryfin-mpv-${crypto.randomUUID()}`,
      audio: params.audio,
      video: params.video,
      subtitles: params.subtitles,
      // The tests run without an audio device.
      ao: process.env.CHERRYFIN_MPV_AO || 'wasapi',
      logFile: process.env.CHERRYFIN_MPV_LOG || undefined,
    });
    mpv.on('event', (event) => {
      if (player?.mpv === mpv && !overlay.isDestroyed()) overlay.webContents.send('mpv:event', event);
    });
    mpv.ready.catch(() => {
      if (player?.mpv === mpv && !mpv.exited && !overlay.isDestroyed()) overlay.webContents.send('mpv:event', { type: 'crash', code: 'start' });
    });
    return mpv;
  };

  player = { host, overlay, startMpv, mpv: null, dragging: false, loadRequest: 0, audioDevice: params.audio?.device, params: { itemId: params.itemId, startTicks: params.startTicks } };
  player.mpv = startMpv();

  // Chromium pushes its own child window above mpv, e.g. when showing or resizing.
  const hostHandle = host.getNativeWindowHandle().readUInt32LE(0);
  const raiseVideo = () => win32.raiseChild(hostHandle, 'mpv');
  player.raiseTimer = setInterval(raiseVideo, 1000);
  for (const name of ['show', 'resize', 'restore', 'enter-full-screen', 'leave-full-screen']) host.on(name, raiseVideo);

  for (const name of ['resize', 'move', 'enter-full-screen', 'leave-full-screen']) host.on(name, syncOverlay);
  // In windowed mode you drag the interface; the video follows it.
  overlay.on('will-move', (_event, bounds) => {
    if (!player || host.isFullScreen()) return;
    player.dragging = true;
    host.setBounds(bounds);
  });
  overlay.on('moved', () => {
    if (!player) return;
    player.dragging = false;
    syncOverlay();
  });
  host.on('focus', () => {
    if (!overlay.isDestroyed()) overlay.focus();
  });
  host.on('closed', () => closePlayer());
  overlay.on('closed', () => closePlayer());

  overlay.once('ready-to-show', () => {
    if (player?.overlay !== overlay) return;
    host.show();
    if (fullscreen) host.setFullScreen(true);
    syncOverlay();
    overlay.show();
    overlay.focus();
    win.hide();
  });
  loadApp(overlay, 'player');
  return true;
}

const fromPlayer = (event) => player && event.sender === player.overlay.webContents;

ipcMain.handle('player:available', () => Boolean(mpvExecutable()) && win32.available());

ipcMain.handle('player:audio-devices', () => {
  const executable = mpvExecutable();
  return executable ? listAudioDevices(executable) : [];
});

ipcMain.handle('player:open', (event, params) => {
  if (event.sender !== win?.webContents) return false;
  if (typeof params?.itemId !== 'string' || !/^[\w-]{1,64}$/.test(params.itemId)) return false;
  return openPlayer({ ...params, startTicks: Number(params.startTicks) || 0 });
});

ipcMain.handle('player:close', (event) => {
  if (fromPlayer(event)) closePlayer();
});

ipcMain.handle('player:params', (event) => (fromPlayer(event) ? player.params : null));

const httpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

ipcMain.handle('mpv:load', async (event, url, start) => {
  if (!fromPlayer(event) || !httpUrl(url)) return false;
  // After a crash, "Reload" restarts the process.
  if (player.mpv.exited) player.mpv = player.startMpv();
  const current = player;
  const request = ++current.loadRequest;
  const ao = process.env.CHERRYFIN_MPV_AO || 'wasapi';
  if (ao === 'wasapi' && !process.env.CHERRYFIN_MPV_NO_WAKE) await wakeAudioDevice(mpvExecutable(), current.audioDevice);
  // Closed meanwhile, or a newer title was chosen: this request is outdated.
  if (player !== current || request !== current.loadRequest) return false;
  return player.mpv.command({ name: 'loadfile', url, flags: 'replace', options: { start: String(Math.max(0, Number(start) || 0)) } }).catch((error) => error.message);
});

// The built-in player stalls on a cold audio device too.
ipcMain.handle('audio:wake', async (_event, device) => {
  const executable = mpvExecutable();
  if (executable && (process.env.CHERRYFIN_MPV_AO || 'wasapi') === 'wasapi' && !process.env.CHERRYFIN_MPV_NO_WAKE) await wakeAudioDevice(executable, device);
  return true;
});

// Only these commands reach mpv. Arbitrary commands could otherwise open files or start programs.
ipcMain.handle('mpv:command', async (event, name, ...args) => {
  if (!fromPlayer(event)) return null;
  const { mpv } = player;
  const safe = (promise) => promise.catch(() => null);
  const track = (value) => (Number.isInteger(value) ? value : 'no');
  switch (name) {
    case 'pause': return safe(mpv.command(['set_property', 'pause', Boolean(args[0])]));
    case 'seek': return safe(mpv.command(['seek', Math.max(0, Number(args[0]) || 0), 'absolute']));
    // Rescue when the audio clock stands still despite the wake-up.
    case 'reload-audio': return safe(mpv.command(['ao-reload']));
    case 'exclusive-audio': return safe(mpv.command(['set_property', 'audio-exclusive', true]).then(() => mpv.command(['ao-reload'])));
    // The device does not accept the format: without this, mpv would stall after the failure.
    case 'pcm-audio': return safe(mpv.command(['set_property', 'audio-spdif', '']));
    case 'volume': return safe(mpv.command(['set_property', 'volume', Math.max(0, Math.min(130, Number(args[0]) || 0))]));
    case 'mute': return safe(mpv.command(['set_property', 'mute', Boolean(args[0])]));
    case 'speed': return safe(mpv.command(['set_property', 'speed', Math.max(0.25, Math.min(4, Number(args[0]) || 1))]));
    case 'aid': return safe(mpv.command(['set_property', 'aid', track(args[0])]));
    case 'sid': return safe(mpv.command(['set_property', 'sid', track(args[0])]));
    case 'sub-add':
      if (!httpUrl(args[0])) return null;
      return safe(mpv.command(['sub-add', args[0], 'select', String(args[1] ?? ''), String(args[2] ?? '')]));
    default: return null;
  }
});

// Credentials are stored encrypted with DPAPI (safeStorage) in the user profile.
ipcMain.handle('secure:get', () => {
  try {
    const raw = fs.readFileSync(storeFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : null;
  } catch {
    return null;
  }
});

ipcMain.handle('secure:set', (_event, value) => {
  if (value == null) {
    fs.rmSync(storeFile(), { force: true });
    return true;
  }
  // Without encryption nothing is stored permanently; you have to sign in again then.
  if (!safeStorage.isEncryptionAvailable()) return false;
  fs.writeFileSync(storeFile(), safeStorage.encryptString(String(value)));
  return true;
});

// In the player, full screen applies to the video window; the interface follows it.
const fullscreenTarget = (event) => (fromPlayer(event) ? player.host : win);
ipcMain.handle('win:setFullscreen', (event, on) => fullscreenTarget(event)?.setFullScreen(Boolean(on)));
ipcMain.handle('win:isFullscreen', (event) => Boolean(fullscreenTarget(event)?.isFullScreen()));

// Jellyfin answers this UDP broadcast with its address (port 7359).
ipcMain.handle('discover', () => new Promise((resolve) => {
  const found = new Map();
  const socket = dgram.createSocket('udp4');
  const finish = () => {
    try { socket.close(); } catch { /* already closed */ }
    resolve([...found.values()]);
  };
  socket.on('error', finish);
  socket.on('message', (message) => {
    try {
      const info = JSON.parse(message.toString());
      if (info.Address && info.Id) found.set(info.Id, { id: info.Id, name: info.Name, address: info.Address });
    } catch { /* not a Jellyfin answer */ }
  });
  socket.bind(() => {
    socket.setBroadcast(true);
    const probe = Buffer.from('Who is JellyfinServer?');
    socket.send(probe, 7359, '255.255.255.255');
    setTimeout(finish, 1500);
  });
}));

app.whenReady().then(createWindow);
app.on('before-quit', () => player?.mpv.stop());
app.on('window-all-closed', () => app.quit());
