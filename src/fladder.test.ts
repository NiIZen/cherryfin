import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from './app/settings';
import { isLocalServer, pickRemembered } from './player/remember';
import { mergeContinue } from './app/homeRows';
// @ts-expect-error Der Hauptprozess ist reines CommonJS ohne Typen.
import { mpvArgs } from '../electron/mpv.cjs';

const base = { wid: 1, pipe: 'p' };
const option = (args: string[], name: string) => args.find((a) => a.startsWith(`--${name}=`));

describe('Heimnetz oder Internet', () => {
  it('erkennt private Adressen', () => {
    for (const url of ['http://192.168.1.20:8096', 'http://10.0.0.5', 'http://172.20.1.1:8096', 'http://localhost:8096', 'http://nas:8096', 'http://jellyfin.local', 'http://127.0.0.1:1']) {
      expect(isLocalServer(url), url).toBe(true);
    }
  });
  it('erkennt das Internet', () => {
    for (const url of ['https://jf.example.org', 'http://8.8.8.8', 'http://172.32.0.1', 'http://192.169.1.1']) {
      expect(isLocalServer(url), url).toBe(false);
    }
  });
  it('wertet Unsinn als Internet', () => {
    expect(isLocalServer('kein url')).toBe(false);
  });
});

describe('Gemerkte Spuren', () => {
  const streams = [
    { Index: 1, Type: 'Audio' as const, Language: 'deu' },
    { Index: 2, Type: 'Audio' as const, Language: 'eng' },
    { Index: 3, Type: 'Subtitle' as const, Language: 'ENG' },
  ];
  it('findet die Sprache', () => {
    expect(pickRemembered(streams, 'Audio', 'eng', 1)).toBe(2);
    expect(pickRemembered(streams, 'Subtitle', 'eng', -1)).toBe(3);
  });
  it('bleibt ohne Treffer beim Vorschlag des Servers', () => {
    expect(pickRemembered(streams, 'Audio', 'fra', 1)).toBe(1);
    expect(pickRemembered(streams, 'Audio', undefined, 1)).toBe(1);
  });
  it('merkt sich ausgeschaltete Untertitel', () => {
    expect(pickRemembered(streams, 'Subtitle', 'off', 3)).toBe(-1);
  });
});

describe('Startseite', () => {
  const episode = (Id: string, SeriesId: string) => ({ Id, SeriesId, Type: 'Episode' as const });
  it('zeigt jede Serie zusammengelegt nur einmal', () => {
    const result = mergeContinue([episode('a', 's1')], [episode('b', 's1'), episode('c', 's2')]);
    expect(result.map((i) => i.Id)).toEqual(['a', 'c']);
  });
});

describe('Neue Einstellungen', () => {
  it('startet mit sinnvollen Werten', () => {
    const { playback, subtitles, home } = DEFAULT_SETTINGS;
    expect(playback.seekBack).toBe(10);
    expect(playback.segments.Intro).toBe('ask');
    expect(playback.incognito).toBe(false);
    expect(subtitles.color).toBe('#ffffff');
    expect(home.continueMode).toBe('combined');
  });
  it('ergänzt ältere Einstellungen, auch verschachtelt', () => {
    const merged = mergeSettings({ playback: { seekBack: 30, segments: { Intro: 'skip' } } });
    expect(merged.playback.seekBack).toBe(30);
    expect(merged.playback.seekForward).toBe(10);
    expect(merged.playback.segments.Intro).toBe('skip');
    expect(merged.playback.segments.Recap).toBe('ask');
  });
});

describe('mpv-Optionen aus den Einstellungen', () => {
  it('setzt Hardware-Decoding und Puffer', () => {
    expect(option(mpvArgs(base), 'hwdec')).toBe('--hwdec=auto-safe');
    expect(option(mpvArgs({ ...base, video: { hardware: false } }), 'hwdec')).toBe('--hwdec=no');
    expect(option(mpvArgs({ ...base, video: { bufferMb: 512 } }), 'demuxer-max-bytes')).toBe('--demuxer-max-bytes=512MiB');
  });
  it('setzt die Bildanpassung', () => {
    expect(option(mpvArgs({ ...base, video: { fit: 'cover' } }), 'panscan')).toBe('--panscan=1');
    expect(option(mpvArgs({ ...base, video: { fit: 'fill' } }), 'keepaspect')).toBe('--keepaspect=no');
    expect(option(mpvArgs({ ...base, video: { fit: 'contain' } }), 'panscan')).toBeUndefined();
  });
  it('setzt Lautstärke und Untertitel', () => {
    const args = mpvArgs({ ...base, video: { volume: 80 }, subtitles: { size: 60, color: '#ffcc00', outline: 3, position: 10, bold: true, background: 'box' } });
    expect(option(args, 'volume')).toBe('--volume=80');
    expect(option(args, 'sub-font-size')).toBe('--sub-font-size=60');
    expect(option(args, 'sub-color')).toBe('--sub-color=#ffcc00');
    expect(option(args, 'sub-border-size')).toBe('--sub-border-size=3');
    expect(option(args, 'sub-pos')).toBe('--sub-pos=90');
    expect(option(args, 'sub-bold')).toBe('--sub-bold=yes');
    expect(option(args, 'sub-back-color')).toBe('--sub-back-color=#99000000');
  });
  it('lässt keine fremden Werte durch', () => {
    const args = mpvArgs({ ...base, video: { bufferMb: '1 --script=boese.lua', volume: 'x', fit: 'boese' }, subtitles: { color: 'red --script=boese.lua', size: 'x' } });
    expect(args.join(' ')).not.toContain('boese');
    expect(option(args, 'volume')).toBeUndefined();
    expect(option(args, 'sub-color')).toBeUndefined();
  });
  it('begrenzt Werte auf sinnvolle Bereiche', () => {
    expect(option(mpvArgs({ ...base, video: { volume: 500 } }), 'volume')).toBe('--volume=130');
    expect(option(mpvArgs({ ...base, video: { bufferMb: 99999 } }), 'demuxer-max-bytes')).toBe('--demuxer-max-bytes=2048MiB');
  });
});
