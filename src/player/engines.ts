import Hls from 'hls.js';
import type { MediaClient, PlaybackSession, Source, Stream } from '../api/types';
import type { MpvEvent } from '../app/session';
import { trackLabel } from '../app/format';
import { describeAudioOutput, findMpvTrack, type AudioParams, type MpvTrack } from './tracks';
import { isTV } from '../tv/platform';

/** Tonspuren eines Videos. Der Standard-Typ kennt sie nicht, webOS bietet sie aber an. */
type AudioTrackList = ArrayLike<{ enabled: boolean }>;
const audioTracksOf = (el: HTMLVideoElement) => (el as HTMLVideoElement & { audioTracks?: AudioTrackList }).audioTracks;

const MAX_NETWORK_RETRIES = 4;
/** So lange darf die Zeit im laufenden Film stillstehen, bevor der Wächter eingreift. */
const STALL_MS = 2000;
/** Reihenfolge der Rettung. Zwei Neustarts genügten im Versuch meist, exklusiv ging immer. */
const RESCUE = ['reload-audio', 'reload-audio', 'exclusive-audio', 'reload-audio'];

export interface EngineEvents {
  onPlay(): void;
  onPause(): void;
  onBuffering(active: boolean): void;
  onTime(seconds: number): void;
  onDuration(seconds: number): void;
  onBuffered(seconds: number): void;
  onEnded(): void;
  /** network: Verbindung weg. media: Datei lässt sich so nicht abspielen. fatal: Es gibt keinen weiteren Versuch. */
  onError(kind: 'network' | 'media' | 'fatal', message: string): void;
  onAudioOutput(description: string): void;
  /** Kurzer Hinweis im Player. */
  onNotice(message: string): void;
}

export interface PlaybackEngine {
  /** Kann die Spur gewechselt werden, ohne dass der Server neu liefern muss? */
  canSwitchTracks(session: PlaybackSession | null): boolean;
  /** Lässt sich die Spur schon beim Start frei wählen, ohne dass der Server neu liefern muss? */
  canChooseAtStart(session: PlaybackSession): boolean;
  load(session: PlaybackSession, startSeconds: number, tracks: { audioIndex?: number; subtitleIndex: number }): void;
  play(): void;
  pause(): void;
  isPaused(): boolean;
  isSeeking(): boolean;
  position(): number;
  seek(seconds: number): void;
  setSpeed(rate: number): void;
  setVolume(percent: number): void;
  setMuted(muted: boolean): void;
  setAudio(index: number): void;
  /** -1 schaltet Untertitel aus. */
  setSubtitle(source: Source, index: number): void;
  destroy(): void;
}

/* ---------- Eingebauter Player: HTML5-Video, bei Bedarf mit HLS ---------- */

export class Html5Engine implements PlaybackEngine {
  private hls: Hls | null = null;
  private trackEl: HTMLTrackElement | null = null;
  private objectUrl: string | null = null;
  private subtitleRequest = 0;
  private session: PlaybackSession | null = null;
  private wantedAudio: number | undefined;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    private readonly el: HTMLVideoElement,
    private readonly events: EngineEvents,
    private readonly client: MediaClient,
    private readonly itemId: string,
  ) {
    const on = <K extends keyof HTMLMediaElementEventMap>(type: K, handler: () => void) => {
      el.addEventListener(type, handler);
      this.cleanup.push(() => el.removeEventListener(type, handler));
    };
    on('play', () => events.onPlay());
    on('pause', () => events.onPause());
    on('waiting', () => events.onBuffering(true));
    on('playing', () => events.onBuffering(false));
    on('canplay', () => events.onBuffering(false));
    on('seeked', () => events.onBuffering(false));
    on('timeupdate', () => events.onTime(el.currentTime));
    on('durationchange', () => {
      if (Number.isFinite(el.duration)) events.onDuration(el.duration);
    });
    on('progress', () => {
      if (el.buffered.length) events.onBuffered(el.buffered.end(el.buffered.length - 1));
    });
    on('ended', () => events.onEnded());
    on('error', () => {
      // Netzwerkfehler: Eine Transkodierung würde nichts ändern.
      if (el.error?.code === MediaError.MEDIA_ERR_NETWORK) events.onError('network', 'Die Verbindung zum Server ist unterbrochen.');
      else if (this.hls) events.onError('fatal', 'Dieses Video kann nicht wiedergegeben werden.');
      // Meldet Chromium trotz canPlayType einen Decoder-Fehler, übernimmt der Server.
      else events.onError('media', 'Dieses Video kann nicht wiedergegeben werden.');
    });
  }

  canSwitchTracks(session: PlaybackSession | null): boolean {
    const tracks = audioTracksOf(this.el);
    return isTV && session?.method === 'DirectPlay' && Boolean(tracks && tracks.length > 1);
  }

  canChooseAtStart(session: PlaybackSession): boolean {
    return isTV && session.method === 'DirectPlay';
  }

  private applyAudio() {
    const tracks = audioTracksOf(this.el);
    if (!tracks || this.wantedAudio === undefined) return;
    const position = (this.session?.source.MediaStreams ?? []).filter((s) => s.Type === 'Audio').findIndex((s) => s.Index === this.wantedAudio);
    if (position < 0 || position >= tracks.length) return;
    for (let i = 0; i < tracks.length; i++) tracks[i].enabled = i === position;
  }

  load(session: PlaybackSession, startSeconds: number, tracks?: { audioIndex?: number }): void {
    const { el, events } = this;
    this.session = session;
    this.wantedAudio = tracks?.audioIndex;
    if (isTV) el.addEventListener('loadedmetadata', () => this.applyAudio(), { once: true });
    this.hls?.destroy();
    this.hls = null;
    events.onBuffering(true);

    if (session.isHls && Hls.isSupported()) {
      const instance = new Hls({ startPosition: startSeconds, maxBufferLength: 40, backBufferLength: 60, enableWorker: true });
      this.hls = instance;
      let mediaRecoveries = 0;
      let networkRetries = 0;
      instance.on(Hls.Events.FRAG_LOADED, () => {
        networkRetries = 0;
      });
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // Kurze Aussetzer überbrückt der Player selbst, mit wachsendem Abstand.
          if (networkRetries >= MAX_NETWORK_RETRIES) {
            events.onError('network', 'Die Verbindung zum Server ist unterbrochen.');
            return;
          }
          const delay = 2000 * 2 ** networkRetries;
          networkRetries += 1;
          events.onBuffering(true);
          setTimeout(() => {
            if (this.hls === instance) instance.startLoad();
          }, delay);
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
          mediaRecoveries += 1;
          instance.recoverMediaError();
        } else {
          events.onError('fatal', 'Der Stream konnte nicht wiedergegeben werden.');
        }
      });
      instance.loadSource(session.url);
      instance.attachMedia(el);
    } else {
      el.src = session.url;
      const seekOnce = () => {
        // Ein Stand hinter dem Dateiende (z. B. nach Austausch der Datei) würde sofort als "beendet" gelten.
        if (startSeconds > 0 && startSeconds < el.duration - 5) el.currentTime = startSeconds;
      };
      el.addEventListener('loadedmetadata', seekOnce, { once: true });
    }
    el.play().catch(() => undefined);
    // Der erste Versuch kommt teils zu früh, bevor der Medienplayer des Fernsehers bereit ist.
    if (isTV) el.addEventListener('canplay', () => void el.play().catch(() => undefined), { once: true });
  }

  play(): void {
    void this.el.play().catch(() => undefined);
  }

  pause(): void {
    this.el.pause();
  }

  isPaused(): boolean {
    return this.el.paused;
  }

  isSeeking(): boolean {
    return this.el.seeking;
  }

  position(): number {
    return this.el.currentTime;
  }

  seek(seconds: number): void {
    this.el.currentTime = seconds;
  }

  setSpeed(rate: number): void {
    this.el.playbackRate = rate;
  }

  setVolume(percent: number): void {
    this.el.volume = Math.max(0, Math.min(1, percent / 100));
  }

  setMuted(muted: boolean): void {
    this.el.muted = muted;
  }

  setAudio(index: number): void {
    // Am Computer kann Chromium die Spur nicht wechseln, der Player lädt dort neu. Der Fernseher kann es.
    this.wantedAudio = index;
    this.applyAudio();
  }

  private clearSubtitle() {
    this.trackEl?.remove();
    this.trackEl = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  setSubtitle(source: Source, index: number): void {
    const request = ++this.subtitleRequest;
    this.clearSubtitle();
    const stream = source.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.Index === index);
    if (!stream?.IsTextSubtitleStream) return;
    this.client.fetchSubtitleVtt(this.itemId, source, stream.Index!).then((vtt) => {
      if (request !== this.subtitleRequest) return;
      this.objectUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.srclang = stream.Language ?? 'und';
      track.label = trackLabel(stream);
      track.src = this.objectUrl;
      track.default = true;
      this.el.appendChild(track);
      track.track.mode = 'showing';
      this.trackEl = track;
    }).catch(() => undefined);
  }

  destroy(): void {
    this.subtitleRequest += 1;
    this.cleanup.forEach((remove) => remove());
    this.clearSubtitle();
    this.hls?.destroy();
    this.hls = null;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }
}

/* ---------- mpv: läuft im Hauptprozess, gesteuert über die Bridge ---------- */

export class MpvEngine implements PlaybackEngine {
  private readonly bridge = window.native!.player;
  private readonly unsubscribe: () => void;
  private time = 0;
  private paused = false;
  private seeking = false;
  private session: PlaybackSession | null = null;
  private tracks: MpvTrack[] = [];
  private wanted: { audioIndex?: number; subtitleIndex: number } = { subtitleIndex: -1 };
  private tracksApplied = false;
  private addedSubtitles = new Map<number, number>();
  private output: AudioParams | null = null;
  private running = false;
  private cacheWait = false;
  private lastMove = 0;
  private kicks = 0;
  private readonly watchdog: ReturnType<typeof setInterval>;

  constructor(
    private readonly events: EngineEvents,
    private readonly client: MediaClient,
    private readonly itemId: string,
    private passthrough = false,
  ) {
    this.unsubscribe = this.bridge.onEvent((event) => this.handle(event));
    this.watchdog = setInterval(() => this.checkStall(), 500);
  }

  /**
   * Auf manchen Audiogeräten läuft die Abspieluhr nach dem Start nicht los, und das Video wartet
   * auf sie. mpv meldet dabei weder Fehler noch Puffern, und auch Springen hilft nicht. Der
   * Hauptprozess weckt das Gerät deshalb vor dem Laden. Hängt es trotzdem, startet der Wächter
   * die Audioausgabe neu.
   */
  private checkStall() {
    const now = Date.now();
    if (!this.running || this.paused || this.seeking || this.cacheWait) {
      this.lastMove = now;
      return;
    }
    if (now - this.lastMove < STALL_MS) return;
    this.lastMove = now;
    if (this.kicks >= RESCUE.length) {
      this.running = false;
      this.events.onError('fatal', 'Die Wiedergabe startet nicht. Prüfe das Ausgabegerät in den Einstellungen.');
      return;
    }
    const step = RESCUE[this.kicks];
    this.kicks += 1;
    if (step === 'exclusive-audio') this.events.onNotice('Das Audiogerät läuft für diesen Film exklusiv. Andere Programme bleiben stumm.');
    void this.bridge.command(step);
  }

  private handle(event: MpvEvent) {
    const { events } = this;
    switch (event.type) {
      case 'property':
        this.property(event.name, event.value);
        break;
      case 'playback-restart':
        this.running = true;
        this.lastMove = Date.now();
        events.onBuffering(false);
        break;
      case 'file-loaded':
        this.applyTracks();
        break;
      case 'audio-failed':
        // Bei einem gescheiterten Passthrough bleibt mpv vor dem Start stehen. Mit PCM geht es von vorn los.
        if (this.passthrough && this.session) {
          this.passthrough = false;
          events.onNotice('Das Audiogerät nimmt dieses Format nicht per Passthrough an. Der Ton läuft als PCM.');
          const { url } = this.session;
          void this.bridge.command('pcm-audio').then(() => this.bridge.load(url, this.time));
        }
        break;
      case 'end-file':
        this.running = false;
        if (event.reason === 'eof') events.onEnded();
        else if (event.reason === 'error') events.onError('media', 'Die Datei konnte nicht abgespielt werden.');
        break;
      case 'crash':
        this.running = false;
        events.onError('fatal', 'Der Player wurde unerwartet beendet.');
        break;
      default:
        break;
    }
  }

  private property(name: string, value: unknown) {
    const { events } = this;
    switch (name) {
      case 'time-pos':
        if (typeof value === 'number') {
          if (value !== this.time) {
            this.lastMove = Date.now();
            this.kicks = 0;
          }
          this.time = value;
          events.onTime(value);
        }
        break;
      case 'duration':
        if (typeof value === 'number') events.onDuration(value);
        break;
      case 'pause':
        this.paused = Boolean(value);
        if (this.paused) events.onPause();
        else events.onPlay();
        break;
      case 'paused-for-cache':
        this.cacheWait = Boolean(value);
        events.onBuffering(Boolean(value));
        break;
      case 'seeking':
        this.seeking = Boolean(value);
        break;
      case 'demuxer-cache-time':
        if (typeof value === 'number') events.onBuffered(value);
        break;
      case 'track-list':
        this.tracks = Array.isArray(value) ? (value as MpvTrack[]) : [];
        this.applyTracks();
        break;
      case 'audio-out-params':
        this.output = (value as AudioParams | null) ?? null;
        events.onAudioOutput(describeAudioOutput(this.output));
        break;
      default:
        break;
    }
  }

  private streams(): Stream[] {
    return this.session?.source.MediaStreams ?? [];
  }

  /** Setzt die gewünschten Spuren, sobald mpv die Datei geöffnet hat. */
  private applyTracks() {
    if (this.tracksApplied || !this.session || !this.tracks.length) return;
    this.tracksApplied = true;
    if (this.wanted.audioIndex !== undefined) this.setAudio(this.wanted.audioIndex);
    this.setSubtitle(this.session.source, this.wanted.subtitleIndex);
  }

  canSwitchTracks(session: PlaybackSession | null): boolean {
    return session?.method === 'DirectPlay';
  }

  canChooseAtStart(session: PlaybackSession): boolean {
    return session.method === 'DirectPlay';
  }

  load(session: PlaybackSession, startSeconds: number, tracks: { audioIndex?: number; subtitleIndex: number }): void {
    this.session = session;
    this.wanted = tracks;
    this.tracks = [];
    this.tracksApplied = false;
    this.addedSubtitles.clear();
    this.time = startSeconds;
    this.running = false;
    this.kicks = 0;
    this.events.onBuffering(true);
    void this.bridge.load(session.url, startSeconds);
    void this.bridge.command('pause', false);
  }

  play(): void {
    void this.bridge.command('pause', false);
  }

  pause(): void {
    void this.bridge.command('pause', true);
  }

  isPaused(): boolean {
    return this.paused;
  }

  isSeeking(): boolean {
    return this.seeking;
  }

  position(): number {
    return this.time;
  }

  seek(seconds: number): void {
    this.time = seconds;
    this.lastMove = Date.now();
    void this.bridge.command('seek', seconds);
  }

  setSpeed(rate: number): void {
    void this.bridge.command('speed', rate);
  }

  setVolume(percent: number): void {
    void this.bridge.command('volume', percent);
  }

  setMuted(muted: boolean): void {
    void this.bridge.command('mute', muted);
  }

  setAudio(index: number): void {
    this.wanted.audioIndex = index;
    const stream = this.streams().find((s) => s.Type === 'Audio' && s.Index === index);
    if (!stream) return;
    const id = findMpvTrack(stream, this.tracks, this.streams());
    if (id !== null) void this.bridge.command('aid', id);
  }

  setSubtitle(source: Source, index: number): void {
    this.wanted.subtitleIndex = index;
    // Ohne geladene Datei kann mpv nichts setzen. applyTracks holt das nach.
    if (!this.tracks.length) return;
    const stream = source.MediaStreams?.find((s) => s.Type === 'Subtitle' && s.Index === index);
    if (!stream) {
      void this.bridge.command('sid', null);
      return;
    }

    const embeddedId = this.session?.method === 'DirectPlay' ? findMpvTrack(stream, this.tracks, this.streams()) : null;
    if (embeddedId !== null) {
      void this.bridge.command('sid', embeddedId);
      return;
    }
    const known = this.addedSubtitles.get(index);
    if (known !== undefined) {
      void this.bridge.command('sid', known);
      return;
    }
    // Externe Datei oder transkodierter Stream: Der Server liefert den Untertitel einzeln.
    if (!stream.IsTextSubtitleStream) return;
    void this.bridge.command('sub-add', this.client.subtitleUrl(this.itemId, source, stream), trackLabel(stream), stream.Language ?? '').then((result) => {
      const id = (result as { track_id?: number } | null)?.track_id;
      if (typeof id === 'number') this.addedSubtitles.set(index, id);
    });
  }

  destroy(): void {
    clearInterval(this.watchdog);
    this.unsubscribe();
  }
}
