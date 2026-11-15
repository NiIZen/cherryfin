import { afterEach, describe, expect, it, vi } from 'vitest';
import { DE } from './i18n/de';
import { resolveLanguage, setLanguage, t } from './i18n';

// Every source file of the app as text, read by Vite at test time.
const raw = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sources = Object.entries(raw).map(([file, code]) => ({ file, code }));
const basename = (file: string) => file.split('/').at(-1) ?? file;

/** Texts that read the same in German, or proper names and formats. */
const SAME_IN_GERMAN = new Set([
  'Normal', 'Stereo', 'mpv', 'Logo', 'Inter', 'Segoe UI', 'Deutsch', 'English', 'Player', 'Pink', 'Orange', 'Intro', 'Demo',
  'Dolby Digital (AC3)', 'Dolby Digital Plus (E-AC3)', 'Dolby TrueHD', 'DTS', 'DTS-HD Master Audio', 'Passthrough', 'Enter / A',
  '40 Mbit/s', '20 Mbit/s', '10 Mbit/s', '4 Mbit/s', '1,5×', '2×', '3×', 'Details', 'A–Z',
  'SortName', 'Dolby Digital', 'Dolby Digital Plus', 'DTS-HD',
]);

/** English source texts handed to t(), to ChoiceRow (label, hint, option labels) or to label constants. */
function usedTexts(): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /\bt\('((?:[^'\\]|\\.)*)'/g,
    /\b(?:label|hint)="([^"]+)"/g,
    /\blabel: '((?:[^'\\]|\\.)*)'/g,
    /^\s{2}\w+: '([A-Z][^']*)',$/gm,
  ];
  for (const { file, code } of sources) {
    if (/i18n|demo\.ts|jellyfin\.ts|profile\.ts/.test(file)) continue;
    for (const pattern of patterns) for (const match of code.matchAll(pattern)) found.add(match[1].replace(/\\'/g, "'"));
  }
  return found;
}

describe('Translations', () => {
  afterEach(() => {
    setLanguage('en');
    vi.unstubAllGlobals();
  });

  it('has a German text for every text shown in the interface', () => {
    expect(sources.length).toBeGreaterThan(40);
    expect(usedTexts().size).toBeGreaterThan(300);
    const missing = [...usedTexts()].filter((text) => !(text in DE) && !SAME_IN_GERMAN.has(text) && !/^[a-z]/.test(text));
    expect(missing).toEqual([]);
  });

  it('keeps the placeholders in the German texts', () => {
    const broken = Object.entries(DE).filter(([en, de]) => {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      return names(en) !== names(de);
    });
    expect(broken).toEqual([]);
  });

  it('has no German text left in the code outside the translations', () => {
    const allowed = /i18n[\\/]de\.ts$/;
    const offenders = sources
      .filter(({ file }) => !allowed.test(file))
      .flatMap(({ file, code }) => code.split('\n').map((line, i) => ({ file, line, i })))
      .filter(({ line }) => /[äöüÄÖÜß]/.test(line))
      // Letters of the on-screen keyboard and German names in the demo data are intended.
      .filter(({ line }) => !/ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ|Milan Kovač|Nora Weiß|\/dokument\|\\bdoku/.test(line));
    expect(offenders.map(({ file, i, line }) => `${basename(file)}:${i + 1} ${line.trim()}`)).toEqual([]);
  });

  it('translates to German and fills placeholders', () => {
    setLanguage('de');
    expect(t('Settings')).toBe('Einstellungen');
    expect(t('{value} seconds', { value: 15 })).toBe('15 Sekunden');
    setLanguage('en');
    expect(t('Settings')).toBe('Settings');
    expect(t('{value} seconds', { value: 15 })).toBe('15 seconds');
  });

  it('keeps unknown texts as they are', () => {
    setLanguage('de');
    expect(t('Something new')).toBe('Something new');
  });

  it('follows the system language on "auto"', () => {
    vi.stubGlobal('navigator', { languages: ['de-AT'], language: 'de-AT' });
    expect(resolveLanguage('auto')).toBe('de');
    vi.stubGlobal('navigator', { languages: ['fr-FR'], language: 'fr-FR' });
    expect(resolveLanguage('auto')).toBe('en');
    expect(resolveLanguage('de')).toBe('de');
  });
});
