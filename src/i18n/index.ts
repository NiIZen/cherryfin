import { DE } from './de';

export type Language = 'de' | 'en';
export type LanguagePreference = 'auto' | Language;

let current: Language = 'en';

/** Follows the system language when set to "auto": German for any German locale, English otherwise. */
export function resolveLanguage(preference: LanguagePreference | undefined): Language {
  if (preference === 'de' || preference === 'en') return preference;
  const nav = typeof navigator === 'undefined' ? 'en' : (navigator.languages?.[0] ?? navigator.language ?? 'en');
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function setLanguage(language: Language) {
  current = language;
  if (typeof document !== 'undefined' && document.documentElement.lang !== language) document.documentElement.lang = language;
}

export const language = () => current;

/** Locale for dates, times and numbers. */
export const locale = () => (current === 'de' ? 'de-DE' : 'en-US');

/**
 * Translates an English source text. Placeholders like `{count}` are filled from `vars`.
 * Every text passed here must have a German entry in `de.ts`; a unit test checks that.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const translated = current === 'de' ? (DE[text] ?? text) : text;
  if (!vars) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
