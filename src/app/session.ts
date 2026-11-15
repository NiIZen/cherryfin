import type { Session } from '../api/jellyfin';
import { resolveLanguage, setLanguage } from '../i18n';
import { mergeSettings, type Settings } from './settings';
import { isTV } from '../tv/platform';

export interface PlayerParams {
  itemId: string;
  startTicks: number;
}

export type MpvEvent =
  | { type: 'property'; name: string; value: unknown }
  | { type: 'end-file'; reason: string; error: string | null }
  | { type: 'file-loaded' }
  | { type: 'playback-restart' }
  | { type: 'audio-failed' }
  | { type: 'crash'; code: unknown };

export interface PlayerBridge {
  available(): Promise<boolean>;
    wakeAudio(): Promise<boolean>;
  audioDevices(): Promise<Array<{ id: string; name: string }>>;
  open(params: PlayerParams & { fullscreen: boolean; audio: unknown; video: unknown; subtitles: unknown }): Promise<boolean>;
  close(): Promise<void>;
  params(): Promise<PlayerParams | null>;
  load(url: string, start: number): Promise<unknown>;
  command(name: string, ...args: unknown[]): Promise<unknown>;
  onEvent(callback: (event: MpvEvent) => void): () => void;
  onClosed(callback: () => void): () => void;
}

export interface NativeBridge {
  secureGet(): Promise<string | null>;
  secureSet(value: string | null): Promise<boolean>;
  setFullscreen(on: boolean): Promise<void>;
  isFullscreen(): Promise<boolean>;
  discover(): Promise<Array<{ id: string; name: string; address: string }>>;
  onFullscreen(callback: (on: boolean) => void): () => void;
  player: PlayerBridge;
}

declare global {
  interface Window {
    native?: NativeBridge;
  }
}

const DEV_KEY = 'jellytv.dev-session';

/** The TV has no encrypted storage. There, localStorage belongs to this app alone. */
const plainStore = () => (isTV ? localStorage : sessionStorage);
// The keys keep their original names so existing settings are preserved.
const SETTINGS_KEY = 'jellytv.settings';

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = window.native ? await window.native.secureGet() : plainStore().getItem(DEV_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session | null): Promise<void> {
  const raw = session ? JSON.stringify(session) : null;
  if (window.native) {
    await window.native.secureSet(raw);
  } else if (raw) {
    // Plain browser (development): the token only survives this tab.
    plainStore().setItem(DEV_KEY, raw);
  } else {
    plainStore().removeItem(DEV_KEY);
  }
}

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const settings = mergeSettings(stored);
    setLanguage(resolveLanguage(settings.language));
    // The glass effect is expensive on TVs. Anyone who wants it can turn it on.
    if (isTV && stored?.appearance?.glass === undefined) settings.appearance.glass = false;
    return settings;
  } catch {
    const settings = mergeSettings(null);
    setLanguage(resolveLanguage(settings.language));
    return settings;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Settings then only apply to this session. */
  }
}

export async function setFullscreen(on: boolean) {
  if (isTV) return;
  if (window.native) {
    await window.native.setFullscreen(on);
  } else if (on) {
    await document.documentElement.requestFullscreen?.().catch(() => undefined);
  } else if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
  }
}

export async function isFullscreen(): Promise<boolean> {
  if (isTV) return true;
  return window.native ? window.native.isFullscreen() : Boolean(document.fullscreenElement);
}
