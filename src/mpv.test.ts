import { describe, expect, it } from 'vitest';
import { buildExternalPlayerProfile } from './api/profile';
import { DEFAULT_SETTINGS, mergeSettings } from './app/settings';
import { describeAudioOutput, findMpvTrack } from './player/tracks';
// @ts-expect-error Der Hauptprozess ist reines CommonJS ohne Typen.
import { mpvArgs, parseAudioDevices } from '../electron/mpv.cjs';

const base = { wid: 42, pipe: '\\\\.\\pipe\\test' };
const option = (args: string[], name: string) => args.find((a) => a.startsWith(`--${name}`));

describe('mpv-Startoptionen', () => {
  it('bindet sich an das Videofenster und die Steuerung', () => {
    const args = mpvArgs(base);
    expect(args).toContain('--wid=42');
    expect(args).toContain('--input-ipc-server=\\\\.\\pipe\\test');
    expect(args).toContain('--no-config');
  });
  it('nutzt ohne Passthrough kein spdif', () => {
    expect(option(mpvArgs({ ...base, audio: { mode: 'pcm', formats: ['ac3'] } }), 'audio-spdif')).toBeUndefined();
  });
  it('reicht nur die gewählten Formate durch', () => {
    const args = mpvArgs({ ...base, audio: { mode: 'passthrough', formats: ['eac3', 'truehd'] } });
    expect(option(args, 'audio-spdif')).toBe('--audio-spdif=eac3,truehd');
  });
  it('lässt ohne ausgewähltes Format die Option weg', () => {
    expect(option(mpvArgs({ ...base, audio: { mode: 'passthrough', formats: [] } }), 'audio-spdif')).toBeUndefined();
  });
  it('schaltet exklusiven Modus und Stereo nur auf Wunsch', () => {
    expect(option(mpvArgs(base), 'audio-exclusive')).toBeUndefined();
    expect(option(mpvArgs({ ...base, audio: { exclusive: true } }), 'audio-exclusive')).toBe('--audio-exclusive=yes');
    expect(option(mpvArgs(base), 'audio-channels')).toBe('--audio-channels=auto');
    expect(option(mpvArgs({ ...base, audio: { channels: 2 } }), 'audio-channels')).toBe('--audio-channels=stereo');
  });
  it('lässt keine fremden Optionen aus den Einstellungen durch', () => {
    const args = mpvArgs({ ...base, audio: { mode: 'passthrough', formats: ['ac3', 'ac3 --script=boese.lua'], device: 'x --script=boese.lua' } });
    expect(args.join(' ')).not.toContain('boese');
    expect(option(args, 'audio-device')).toBeUndefined();
  });
  it('akzeptiert echte Geräte-IDs', () => {
    const device = 'wasapi/{ff5f6f0a-051a-41f7-9015-329f57cacb1a}';
    expect(option(mpvArgs({ ...base, audio: { device } }), 'audio-device')).toBe(`--audio-device=${device}`);
  });
});

describe('Audiogeräte', () => {
  it('liest die Geräteliste und lässt andere Schnittstellen weg', () => {
    const text = "List of detected audio devices:\r\n  'auto' (Autoselect device)\r\n  'wasapi/{ff5f}' (Lautsprecher (Intel® Audio))\r\n  'openal' (Default (openal))\r\n";
    expect(parseAudioDevices(text)).toEqual([
      { id: 'auto', name: 'Autoselect device' },
      { id: 'wasapi/{ff5f}', name: 'Lautsprecher (Intel® Audio)' },
    ]);
  });
  it('übersteht leere Ausgabe', () => {
    expect(parseAudioDevices('')).toEqual([]);
  });
});

describe('Spurzuordnung', () => {
  const streams = [
    { Index: 0, Type: 'Video' as const },
    { Index: 1, Type: 'Audio' as const },
    { Index: 2, Type: 'Audio' as const },
    { Index: 3, Type: 'Subtitle' as const },
    { Index: 9, Type: 'Subtitle' as const, IsExternal: true },
  ];

  it('nutzt den FFmpeg-Index, wenn mpv ihn kennt', () => {
    const tracks = [{ id: 1, type: 'audio', 'ff-index': 2 }, { id: 2, type: 'audio', 'ff-index': 1 }];
    expect(findMpvTrack(streams[1], tracks, streams)).toBe(2);
    expect(findMpvTrack(streams[2], tracks, streams)).toBe(1);
  });
  it('fällt auf die Reihenfolge zurück', () => {
    const tracks = [{ id: 7, type: 'audio' }, { id: 8, type: 'audio' }, { id: 1, type: 'sub' }];
    expect(findMpvTrack(streams[2], tracks, streams)).toBe(8);
    expect(findMpvTrack(streams[3], tracks, streams)).toBe(1);
  });
  it('ordnet externe Untertitel keiner eingebetteten Spur zu', () => {
    expect(findMpvTrack(streams[4], [{ id: 1, type: 'sub' }], streams)).toBeNull();
  });
  it('gibt null zurück, wenn mpv die Spur nicht hat', () => {
    expect(findMpvTrack(streams[1], [], streams)).toBeNull();
  });
});

describe('Anzeige der Tonausgabe', () => {
  it('erkennt Passthrough', () => {
    expect(describeAudioOutput({ format: 'spdif-truehd' })).toBe('Passthrough: Dolby TrueHD');
    expect(describeAudioOutput({ format: 'spdif-eac3' })).toBe('Passthrough: Dolby Digital Plus');
    expect(describeAudioOutput({ format: 'spdif-dtshd' })).toBe('Passthrough: DTS-HD');
  });
  it('zeigt PCM mit Kanälen', () => {
    expect(describeAudioOutput({ format: 'floatp', 'hr-channels': '5.1' })).toBe('PCM: 5.1');
    expect(describeAudioOutput({ format: 's16' })).toBe('PCM');
  });
  it('zeigt ohne Ton nichts', () => {
    expect(describeAudioOutput(null)).toBe('');
    expect(describeAudioOutput({})).toBe('');
  });
});

describe('Profil und Einstellungen für mpv', () => {
  it('erlaubt alles direkt und brennt nichts ein', () => {
    const profile = buildExternalPlayerProfile(1_000_000_000);
    expect(profile.DirectPlayProfiles).toEqual([{ Type: 'Video' }]);
    expect(profile.SubtitleProfiles?.some((s) => s.Method === 'Encode')).toBe(false);
    expect(profile.SubtitleProfiles?.find((s) => s.Format === 'pgssub')?.Method).toBe('Embed');
  });
  it('begrenzt beim Umwandeln auf die gewählten Kanäle', () => {
    expect(buildExternalPlayerProfile(1, 2).TranscodingProfiles?.[0].MaxAudioChannels).toBe('2');
    expect(buildExternalPlayerProfile(1).TranscodingProfiles?.[0].MaxAudioChannels).toBe('8');
  });
  it('startet mit mpv und ohne Passthrough', () => {
    expect(DEFAULT_SETTINGS.playerBackend).toBe('mpv');
    expect(DEFAULT_SETTINGS.audio.mode).toBe('pcm');
  });
  it('ergänzt bei älteren Einstellungen die Tonwerte', () => {
    const merged = mergeSettings({ audio: { mode: 'passthrough' } });
    expect(merged.audio.mode).toBe('passthrough');
    expect(merged.audio.device).toBe('auto');
    expect(merged.playerBackend).toBe('mpv');
  });
});
