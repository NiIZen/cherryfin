import type { Stream } from '../api/types';

const KEY = 'jellytv.tracks';

export interface RememberedTracks {
  audio?: string;
  /** Subtitle language, or "off" if they were turned off last time. */
  subtitle?: string;
}

export function loadRemembered(): RememberedTracks {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function rememberTrack(kind: keyof RememberedTracks, value: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadRemembered(), [kind]: value }));
  } catch {
    /* Without storage the choice only applies to this title. */
  }
}

/** Looks for the remembered language in a title’s tracks. Without a match, the server’s choice stays. */
export function pickRemembered(streams: Stream[], type: 'Audio' | 'Subtitle', language: string | undefined, fallback: number | undefined): number | undefined {
  if (!language) return fallback;
  if (type === 'Subtitle' && language === 'off') return -1;
  const match = streams.find((s) => s.Type === type && s.Language?.toLowerCase() === language.toLowerCase());
  return match?.Index ?? fallback;
}

/** Home network or internet? Private addresses and local names count as home network. */
export function isLocalServer(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home') || !host.includes('.')) return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}
