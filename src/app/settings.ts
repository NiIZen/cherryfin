/* Alle einstellbaren Werte der App. Unbekannte oder fehlende Werte fallen beim Laden auf den Standard zurück. */

export type SortKey = 'SortName' | 'DateCreated' | 'CommunityRating' | 'ProductionYear';

export interface LibraryPrefs {
  view: 'overview' | 'rows';
  layout: 'grid' | 'list';
  image: 'poster' | 'landscape';
  /** 0 (sehr klein) bis 4 (sehr groß). */
  size: number;
  labels: 'always' | 'focus' | 'off';
  sort: SortKey;
  descending: boolean;
  group: boolean;
  rail: boolean;
  unwatched: boolean;
  hero: boolean;
}

export type PassthroughFormat = 'ac3' | 'eac3' | 'dts' | 'dts-hd' | 'truehd';

export interface AudioSettings {
  mode: 'pcm' | 'passthrough';
  formats: PassthroughFormat[];
  exclusive: boolean;
  device: string;
}

export type SegmentAction = 'off' | 'ask' | 'skip';
export type SegmentKind = 'Intro' | 'Recap' | 'Preview' | 'Commercial' | 'Outro';
export type HotkeyAction = 'mute' | 'volumeUp' | 'volumeDown' | 'speedUp' | 'speedDown' | 'subtitles' | 'next' | 'skip';

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  mute: 'Ton aus und an',
  volumeUp: 'Lauter',
  volumeDown: 'Leiser',
  speedUp: 'Schneller',
  speedDown: 'Langsamer',
  subtitles: 'Untertitel ein und aus',
  next: 'Nächste Folge',
  skip: 'Segment überspringen',
};

export interface PlaybackSettings {
  /** Höchste Bitrate außerhalb des Heimnetzes. Im Heimnetz gilt maxBitrate. */
  maxBitrateInternet: number;
  seekBack: number;
  seekForward: number;
  fit: 'contain' | 'cover' | 'fill';
  hardwareDecoding: boolean;
  bufferMb: number;
  volume: number;
  rememberAudio: boolean;
  rememberSubtitles: boolean;
  /** Der Server erfährt nichts von der Wiedergabe, der Fortschritt bleibt unverändert. */
  incognito: boolean;
  mediaKeys: boolean;
  segments: Record<SegmentKind, SegmentAction>;
  /** Tempo, solange die Maustaste auf dem Bild gehalten wird. 0 = aus. */
  speedBoost: number;
  doubleClick: 'fullscreen' | 'seek';
  /** Bildschirmschoner nach einer Minute Pause. */
  screensaver: 'off' | 'clock' | 'logo';
  hotkeys: Record<HotkeyAction, string>;
}

export interface SubtitleSettings {
  size: number;
  bold: boolean;
  color: string;
  outline: number;
  /** Abstand vom unteren Bildrand in Prozent. */
  position: number;
  background: 'none' | 'box';
}

export type HomeRowId = 'continue' | 'movies' | 'series' | 'recommendations' | 'favorites' | 'libraries';

export interface HomeRowPref {
  id: HomeRowId;
  enabled: boolean;
}

export interface Appearance {
  accent: string;
  background: 'black' | 'graphite' | 'slate';
  font: 'inter' | 'system';
  /** Faktor in Prozent. */
  scale: number;
  corners: 'sharp' | 'normal' | 'round';
  focusZoom: 'small' | 'normal' | 'large';
  tilt: boolean;
  focusRing: boolean;
  glass: boolean;
  motion: boolean;
  cardScale: number;
  labels: 'auto' | 'always' | 'focus' | 'off';
  progress: boolean;
  watched: boolean;
  /** Sparmodus: schaltet alles Rechenintensive auf einmal ab, etwa für schwächere Geräte. */
  lowPower: boolean;
  /** Spoiler-Schutz: Bild und Inhalt ungesehener Folgen sind verdeckt. */
  spoilerProtection: boolean;
  detailBackground: 'blurred' | 'sharp' | 'off';
}

export interface Settings {
  maxBitrate: number;
  autoplayNext: boolean;
  fullscreenPlayback: boolean;
  /** Höchstzahl der Tonkanäle: 2 (Stereo) oder 6 (5.1). */
  audioChannels: number;
  /** Nur Fernseher: DTS direkt abspielen. Viele LG-Modelle können es nicht, dann wandelt der Server um. */
  tvDts: boolean;
  /** mpv mit Passthrough und allen Formaten, oder der eingebaute Player. */
  playerBackend: 'mpv' | 'builtin';
  audio: AudioSettings;
  playback: PlaybackSettings;
  subtitles: SubtitleSettings;
  appearance: Appearance;
  home: {
    hero: 'carousel' | 'static' | 'off';
    heroSeconds: number;
    cardStyle: 'auto' | 'poster' | 'landscape';
    heroSource: 'new' | 'continue' | 'nextup' | 'mixed';
    heroDetails: boolean;
    continueMode: 'combined' | 'separate' | 'resume' | 'nextup';
    /** Nächste Folgen nur von Serien, die in so vielen Tagen zuletzt liefen. 0 = alle. */
    nextUpDays: number;
    rows: HomeRowPref[];
  };
  /** Standard für alle Bereiche. */
  library: LibraryPrefs;
  /** Eigene Anpassungen einzelner Bereiche, nach Bereichs-ID. */
  libraryOverrides: Record<string, Partial<LibraryPrefs>>;
  tabs: {
    merge: boolean;
    hidden: string[];
    order: string[];
  };
}

export const HOME_ROW_LABELS: Record<HomeRowId, string> = {
  continue: 'Weiter ansehen',
  movies: 'Neue Filme',
  series: 'Neue Serien',
  recommendations: 'Empfehlungen',
  favorites: 'Meine Merkliste',
  libraries: 'Mediatheken',
};

const HOME_ROW_IDS = Object.keys(HOME_ROW_LABELS) as HomeRowId[];

export const ACCENTS = [
  { id: 'white', label: 'Weiß', bg: '#ffffff', fg: '#000000' },
  { id: 'blue', label: 'Blau', bg: '#0a84ff', fg: '#ffffff' },
  { id: 'purple', label: 'Violett', bg: '#aa5cc3', fg: '#ffffff' },
  { id: 'pink', label: 'Pink', bg: '#ff375f', fg: '#ffffff' },
  { id: 'orange', label: 'Orange', bg: '#ff9f0a', fg: '#000000' },
  { id: 'green', label: 'Grün', bg: '#30d158', fg: '#000000' },
  { id: 'teal', label: 'Türkis', bg: '#40c8e0', fg: '#000000' },
];

export const DEFAULT_LIBRARY: LibraryPrefs = {
  view: 'overview',
  layout: 'grid',
  image: 'poster',
  size: 2,
  labels: 'focus',
  sort: 'SortName',
  descending: false,
  group: true,
  rail: true,
  unwatched: false,
  hero: false,
};

export const DEFAULT_SETTINGS: Settings = {
  maxBitrate: 120_000_000,
  autoplayNext: true,
  fullscreenPlayback: true,
  audioChannels: 6,
  tvDts: false,
  playerBackend: 'mpv',
  audio: { mode: 'pcm', formats: ['ac3', 'eac3', 'dts'], exclusive: false, device: 'auto' },
  playback: {
    maxBitrateInternet: 120_000_000,
    seekBack: 10,
    seekForward: 10,
    fit: 'contain',
    hardwareDecoding: true,
    bufferMb: 256,
    volume: 100,
    rememberAudio: true,
    rememberSubtitles: true,
    incognito: false,
    mediaKeys: true,
    segments: { Intro: 'ask', Recap: 'ask', Preview: 'ask', Commercial: 'ask', Outro: 'ask' },
    speedBoost: 2,
    doubleClick: 'fullscreen',
    screensaver: 'off',
    hotkeys: { mute: 'm', volumeUp: '+', volumeDown: '-', speedUp: ']', speedDown: '[', subtitles: 'u', next: 'n', skip: 's' },
  },
  subtitles: { size: 44, bold: false, color: '#ffffff', outline: 2, position: 5, background: 'none' },
  appearance: {
    accent: 'white',
    background: 'black',
    font: 'inter',
    scale: 100,
    corners: 'normal',
    focusZoom: 'normal',
    tilt: true,
    focusRing: false,
    glass: true,
    motion: true,
    cardScale: 1,
    labels: 'auto',
    progress: true,
    watched: true,
    lowPower: false,
    spoilerProtection: false,
    detailBackground: 'blurred',
  },
  home: {
    hero: 'carousel',
    heroSeconds: 9,
    cardStyle: 'auto',
    heroSource: 'new',
    heroDetails: true,
    continueMode: 'combined',
    nextUpDays: 0,
    rows: HOME_ROW_IDS.map((id) => ({ id, enabled: true })),
  },
  library: DEFAULT_LIBRARY,
  libraryOverrides: {},
  tabs: { merge: false, hidden: [], order: [] },
};

function mergeHomeRows(stored: HomeRowPref[] | undefined): HomeRowPref[] {
  const known = (stored ?? []).filter((row) => HOME_ROW_IDS.includes(row?.id));
  const seen = new Set(known.map((row) => row.id));
  return [...known, ...HOME_ROW_IDS.filter((id) => !seen.has(id)).map((id) => ({ id, enabled: true }))];
}

export function mergeSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    audio: { ...DEFAULT_SETTINGS.audio, ...s.audio },
    playback: {
      ...DEFAULT_SETTINGS.playback,
      ...s.playback,
      segments: { ...DEFAULT_SETTINGS.playback.segments, ...s.playback?.segments },
      hotkeys: { ...DEFAULT_SETTINGS.playback.hotkeys, ...s.playback?.hotkeys },
    },
    subtitles: { ...DEFAULT_SETTINGS.subtitles, ...s.subtitles },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...s.appearance },
    home: { ...DEFAULT_SETTINGS.home, ...s.home, rows: mergeHomeRows(s.home?.rows) },
    library: { ...DEFAULT_LIBRARY, ...s.library },
    libraryOverrides: s.libraryOverrides ?? {},
    tabs: { ...DEFAULT_SETTINGS.tabs, ...s.tabs },
  };
}

export function prefsFor(settings: Settings, tabId?: string): LibraryPrefs {
  return { ...settings.library, ...(tabId ? settings.libraryOverrides[tabId] : undefined) };
}

/** Verschiebt ein Element um eine Position. Ränder bleiben unverändert. */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

const BACKGROUNDS = { black: '#000000', graphite: '#111114', slate: '#141a24' };
const RADII = { sharp: '0.25rem', normal: '0.875rem', round: '1.5rem' };
const ZOOMS = { small: '1.05', normal: '1.1', large: '1.16' };

/** Untertitel im eingebauten Player. Bei mpv übernimmt das eine Startoption. */
function applySubtitleStyle(s: SubtitleSettings) {
  let style = document.getElementById('cherryfin-cue') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'cherryfin-cue';
    document.head.appendChild(style);
  }
  // Nur geprüfte Werte: Die Einstellung landet hier direkt im Stylesheet.
  const color = /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#ffffff';
  const size = Math.max(16, Math.min(120, Number(s.size) || 44)) / 16;
  const outline = Math.max(0, Math.min(8, Number(s.outline) || 0));
  style.textContent = `.player-video::cue {
    color: ${color};
    font-size: ${size}rem;
    font-weight: ${s.bold ? 700 : 500};
    background: ${s.background === 'box' ? 'rgba(0, 0, 0, 0.6)' : 'transparent'};
    text-shadow: 0 0 ${outline}px #000, 0 0 ${outline * 2}px #000, 0 0.0625rem 0.25rem rgba(0, 0, 0, 0.95);
  }`;
}

/** Überträgt die Darstellung auf die CSS-Variablen der Seite. */
export function applyAppearance(settings: Settings) {
  const a = settings.appearance;
  const root = document.documentElement;
  const accent = ACCENTS.find((entry) => entry.id === a.accent) ?? ACCENTS[0];
  const vars: Record<string, string> = {
    '--focus-bg': accent.bg,
    '--focus-fg': accent.fg,
    '--bg': BACKGROUNDS[a.background],
    '--ui-scale': String(a.scale / 100),
    '--radius': RADII[a.corners],
    '--focus-scale': ZOOMS[a.focusZoom],
    '--focus-ring': a.focusRing ? '0.1875rem' : '0rem',
    '--card-scale': String(a.cardScale),
    '--font': a.font === 'system' ? "'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif" : "'SF Pro Display', 'Inter Variable', 'Segoe UI', system-ui, sans-serif",
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.dataset.tilt = a.tilt && !a.lowPower ? 'on' : 'off';
  root.dataset.glass = a.glass && !a.lowPower ? 'on' : 'off';
  root.dataset.motion = a.motion && !a.lowPower ? 'on' : 'off';
  root.dataset.spoiler = a.spoilerProtection ? 'on' : 'off';
  root.dataset.detailBg = a.detailBackground;
  root.dataset.heroDetails = settings.home.heroDetails ? 'on' : 'off';
  root.dataset.fit = settings.playback.fit;
  applySubtitleStyle(settings.subtitles);
  root.dataset.labels = a.labels;
  root.dataset.progress = a.progress ? 'on' : 'off';
  root.dataset.watched = a.watched ? 'on' : 'off';
}
