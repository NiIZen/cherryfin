const { spawn, execFile } = require('node:child_process');
const { EventEmitter } = require('node:events');
const net = require('node:net');

const PASSTHROUGH_FORMATS = ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd'];
const OBSERVED = ['time-pos', 'duration', 'pause', 'paused-for-cache', 'seeking', 'demuxer-cache-time', 'track-list', 'audio-codec-name', 'audio-params', 'audio-out-params'];
const TIME_EVENT_MS = 250;

/** Builds the start options. The renderer only supplies settings, never ready-made options. */
const WAKE_MS = 600;

const validDevice = (device) => typeof device === 'string' && /^(auto|wasapi\/\{[0-9a-fA-F-]+\})$/.test(device);

/** A number from the settings, limited to a sensible range. Anything else is dropped. */
function bounded(value, min, max) {
  const number = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function mpvArgs({ wid, pipe, audio = {}, video = {}, subtitles = {}, ao = 'wasapi', logFile }) {
  const args = [
    '--no-config',
    '--no-terminal',
    '--idle=yes',
    '--force-window=yes',
    `--wid=${wid}`,
    `--input-ipc-server=${pipe}`,
    '--load-scripts=no',
    '--osc=no',
    '--osd-level=0',
    '--input-default-bindings=no',
    '--input-vo-keyboard=no',
    '--input-cursor=no',
    '--cursor-autohide=no',
    '--keep-open=no',
    '--audio-file-auto=no',
    '--sub-auto=no',
    '--ytdl=no',
    `--hwdec=${video.hardware === false ? 'no' : 'auto-safe'}`,
    '--vo=gpu-next',
    '--cache=yes',
    `--demuxer-max-bytes=${bounded(video.bufferMb, 32, 2048) ?? 256}MiB`,
    '--demuxer-max-back-bytes=64MiB',
    '--network-timeout=30',
    '--sub-font=Segoe UI',
    `--sub-font-size=${bounded(subtitles.size, 16, 120) ?? 44}`,
    `--sub-border-size=${bounded(subtitles.outline, 0, 8) ?? 2}`,
    '--sub-shadow-offset=1',
    `--ao=${ao}`,
    `--audio-channels=${audio.channels === 2 ? 'stereo' : 'auto'}`,
  ];

  if (audio.mode === 'passthrough') {
    const formats = PASSTHROUGH_FORMATS.filter((format) => Array.isArray(audio.formats) && audio.formats.includes(format));
    if (formats.length) args.push(`--audio-spdif=${formats.join(',')}`);
  }
  if (audio.exclusive === true) args.push('--audio-exclusive=yes');
  const volume = bounded(video.volume, 0, 130);
  if (volume !== null) args.push(`--volume=${volume}`);
  if (video.fit === 'cover') args.push('--panscan=1');
  if (video.fit === 'fill') args.push('--keepaspect=no');
  if (typeof subtitles.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(subtitles.color)) args.push(`--sub-color=${subtitles.color}`);
  const position = bounded(subtitles.position, 0, 40);
  if (position !== null) args.push(`--sub-pos=${100 - position}`);
  if (subtitles.bold === true) args.push('--sub-bold=yes');
  if (subtitles.background === 'box') args.push('--sub-back-color=#99000000');
  if (validDevice(audio.device)) args.push(`--audio-device=${audio.device}`);
  if (logFile) args.push(`--log-file=${logFile}`);
  return args;
}

function wakeArgs(device) {
  const args = ['--no-config', '--no-terminal', '--really-quiet', '--idle=no', '--load-scripts=no', '--input-default-bindings=no', '--vo=null', '--vid=no', '--ao=wasapi'];
  if (validDevice(device)) args.push(`--audio-device=${device}`);
  args.push('av://lavfi:anullsrc=r=48000:cl=stereo');
  return args;
}

/**
 * When the audio device has been silent for a few seconds, some drivers (proven with Intel Smart
 * Sound) do not start the playback clock of the first audio stream: mpv writes audio, but the
 * playback time stands still. The next stream runs normally once the first one was closed.
 * So a short, silent process opens and closes the device before loading.
 */
function wakeAudioDevice(executable, device, ms = WAKE_MS) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, wakeArgs(device), { stdio: 'ignore', windowsHide: true });
    } catch {
      resolve();
      return;
    }
    const timer = setTimeout(() => child.kill(), ms);
    child.once('error', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('exit', () => {
      clearTimeout(timer);
      setTimeout(resolve, 50);
    });
  });
}

/** Parses the output of --audio-device=help: automatic and all WASAPI devices. */
function parseAudioDevices(text) {
  const devices = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*'([^']+)'\s*\((.*)\)\s*$/);
    if (match && (match[1] === 'auto' || match[1].startsWith('wasapi/'))) devices.push({ id: match[1], name: match[2] });
  }
  return devices;
}

function listAudioDevices(executable) {
  return new Promise((resolve) => {
    execFile(executable, ['--no-config', '--audio-device=help'], { timeout: 8000, windowsHide: true }, (_error, stdout) => {
      resolve(parseAudioDevices(stdout));
    });
  });
}

/** A running mpv, controlled through the JSON interface (named pipe). */
class MpvProcess extends EventEmitter {
  constructor(executable, options) {
    super();
    this.pending = new Map();
    this.requestId = 0;
    this.stopped = false;
    this.exited = false;
    this.lastTimeEvent = 0;
    this.pipe = options.pipe;
    this.child = spawn(executable, mpvArgs(options), { windowsHide: false, stdio: 'ignore' });
    this.child.on('exit', (code) => {
      this.exited = true;
      for (const { reject } of this.pending.values()) reject(new Error('mpv has exited'));
      this.pending.clear();
      if (!this.stopped) this.emit('event', { type: 'crash', code });
    });
    this.child.on('error', (error) => {
      if (!this.stopped) this.emit('event', { type: 'crash', code: error.message });
    });
    this.ready = this.connect();
  }

  async connect() {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (this.stopped || this.exited) throw new Error('mpv has exited');
      try {
        this.socket = await new Promise((resolve, reject) => {
          const socket = net.connect(this.pipe, () => resolve(socket));
          socket.once('error', reject);
        });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    if (!this.socket) throw new Error('mpv does not respond');

    let buffer = '';
    this.socket.setEncoding('utf8');
    this.socket.on('error', () => undefined);
    this.socket.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (line.trim()) this.handleLine(line);
      }
    });
    OBSERVED.forEach((name, index) => this.write({ command: ['observe_property', index + 1, name] }));
    // If the audio output fails, mpv only reports it in the log.
    this.write({ command: ['request_log_messages', 'error'] });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.request_id !== undefined && this.pending.has(message.request_id)) {
      const { resolve, reject } = this.pending.get(message.request_id);
      this.pending.delete(message.request_id);
      if (message.error === 'success') resolve(message.data);
      else reject(new Error(message.error));
      return;
    }
    if (message.event === 'property-change') {
      if (message.name === 'time-pos') {
        // The position arrives very often; a few updates per second are enough for the interface.
        const now = Date.now();
        if (now - this.lastTimeEvent < TIME_EVENT_MS) return;
        this.lastTimeEvent = now;
      }
      this.emit('event', { type: 'property', name: message.name, value: message.data ?? null });
    } else if (message.event === 'end-file') {
      this.emit('event', { type: 'end-file', reason: message.reason, error: message.file_error ?? null });
    } else if (message.event === 'log-message') {
      if (message.prefix === 'ao' && /Failed to initialize audio driver/.test(message.text ?? '')) this.emit('event', { type: 'audio-failed' });
    } else if (message.event === 'file-loaded' || message.event === 'playback-restart') {
      this.emit('event', { type: message.event });
    }
  }

  write(payload) {
    this.socket?.write(`${JSON.stringify(payload)}\n`);
  }

  async command(command) {
    await this.ready;
    if (this.exited) throw new Error('mpv has exited');
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ command, request_id: id });
    });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.write({ command: ['quit'] });
      this.socket?.end();
    } catch {
      /* Already disconnected. */
    }
    const { child } = this;
    setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 1500);
  }
}

module.exports = { MpvProcess, mpvArgs, parseAudioDevices, listAudioDevices, wakeArgs, wakeAudioDevice, PASSTHROUGH_FORMATS };
