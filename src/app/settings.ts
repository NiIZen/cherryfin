import type { LanguagePreference } from '../i18n';

/* All settings of the app. Unknown or missing values fall back to the default when loading. */

export type SortKey = 'SortName' | 'DateCreated' | 'CommunityRating' | 'ProductionYear';

export interface LibraryPrefs {
  view: 'overview' | 'rows';
  layout: 'grid' | 'list';
  image: 'poster' | 'landscape';
  /** 0 (very small) to 4 (very large). */
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
  mute: 'Mute and unmute',
  volumeUp: 'Volume up',
  volumeDown: 'Volume down',
  speedUp: 'Faster',
  speedDown: 'Slower',
  subtitles: 'Subtitles on and off',
  next: 'Next episode',
  skip: 'Skip segment',
};

export interface PlaybackSettings {
  /** Highest bitrate outside the home network. On the home network, maxBitrate applies. */
  maxBitrateInternet: number;
  seekBack: number;
  seekForward: number;
  fit: 'contain' | 'cover' | 'fill';
  hardwareDecoding: boolean;
  bufferMb: number;
  volume: number;
  rememberAudio: boolean;
  rememberSubtitles: boolean;
  /** The server is not told about playback; progress stays unchanged. */
  incognito: boolean;
  mediaKeys: boolean;
  segments: Record<SegmentKind, SegmentAction>;
  /** Speed while the mouse button is held on the picture. 0 = off. */
  speedBoost: number;
  doubleClick: 'fullscreen' | 'seek';
  /** Screensaver after one minute of pause. */
  screensaver: 'off' | 'clock' | 'logo';
  hotkeys: Record<HotkeyAction, string>;
}

export interface SubtitleSettings {
  size: number;
  bold: boolean;
  color: string;
  outline: number;
  /** Distance from the bottom edge in percent. */
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
  /** Factor in percent. */
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
  /** Power saving: turns off everything expensive at once, e.g. for less powerful devices. */
  lowPower: boolean;
  /** Spoiler protection: image and summary of unwatched episodes are hidden. */
  spoilerProtection: boolean;
  detailBackground: 'blurred' | 'sharp' | 'off';
}

export interface Settings {
  maxBitrate: number;
  autoplayNext: boolean;
  fullscreenPlayback: boolean;
  /** Maximum number of audio channels: 2 (stereo) or 6 (5.1). */
  audioChannels: number;
  /** TV only: play DTS directly. Many LG models cannot; the server converts it then. */
  tvDts: boolean;
  /** mpv with passthrough and all formats, or the built-in player. */
  playerBackend: 'mpv' | 'builtin';
  /** Interface language. "auto" follows the system language. */
  language: LanguagePreference;
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
    /** Next up only from shows watched within this many days. 0 = all. */
    nextUpDays: number;
    rows: HomeRowPref[];
  };
  /** Default for all sections. */
  library: LibraryPrefs;
  /** Adjustments of single sections, by section ID. */
  libraryOverrides: Record<string, Partial<LibraryPrefs>>;
  tabs: {
    merge: boolean;
    hidden: string[];
    order: string[];
  };
}

export const HOME_ROW_LABELS: Record<HomeRowId, string> = {
  continue: 'Continue watching',
  movies: 'New movies',
  series: 'New shows',
  recommendations: 'Recommendations',
  favorites: 'My list',
  libraries: 'Libraries',
};

const HOME_ROW_IDS = Object.keys(HOME_ROW_LABELS) as HomeRowId[];

export const ACCENTS = [
  { id: 'white', label: 'White', bg: '#ffffff', fg: '#000000' },
  { id: 'blue', label: 'Blue', bg: '#0a84ff', fg: '#ffffff' },
  { id: 'purple', label: 'Purple', bg: '#aa5cc3', fg: '#ffffff' },
  { id: 'pink', label: 'Pink', bg: '#ff375f', fg: '#ffffff' },
  { id: 'orange', label: 'Orange', bg: '#ff9f0a', fg: '#000000' },
  { id: 'green', label: 'Green', bg: '#30d158', fg: '#000000' },
  { id: 'teal', label: 'Turquoise', bg: '#40c8e0', fg: '#000000' },
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
  language: 'auto',
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

/** Moves an element by one position. The ends stay unchanged. */
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

/** Subtitles in the built-in player. With mpv, a start option does this. */
function applySubtitleStyle(s: SubtitleSettings) {
  let style = document.getElementById('cherryfin-cue') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'cherryfin-cue';
    document.head.appendChild(style);
  }
  // Validated values only: the setting ends up directly in the stylesheet.
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

/** Applies the appearance to the CSS variables of the page. */
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
  root.dataset.lowPower = a.lowPower ? 'on' : 'off';
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
