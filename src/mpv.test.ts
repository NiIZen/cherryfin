import { describe, expect, it } from 'vitest';
import { buildExternalPlayerProfile } from './api/profile';
import { DEFAULT_SETTINGS, mergeSettings } from './app/settings';
import { describeAudioOutput, findMpvTrack } from './player/tracks';
// @ts-expect-error The main process is plain CommonJS without types.
import { mpvArgs, parseAudioDevices } from '../electron/mpv.cjs';

const base = { wid: 42, pipe: '\\\\.\\pipe\\test' };
const option = (args: string[], name: string) => args.find((a) => a.startsWith(`--${name}`));

describe('mpv start options', () => {
  it('binds to the video window and the control pipe', () => {
    const args = mpvArgs(base);
    expect(args).toContain('--wid=42');
    expect(args).toContain('--input-ipc-server=\\\\.\\pipe\\test');
    expect(args).toContain('--no-config');
  });
  it('uses no spdif without passthrough', () => {
    expect(option(mpvArgs({ ...base, audio: { mode: 'pcm', formats: ['ac3'] } }), 'audio-spdif')).toBeUndefined();
  });
  it('passes only the chosen formats through', () => {
    const args = mpvArgs({ ...base, audio: { mode: 'passthrough', formats: ['eac3', 'truehd'] } });
    expect(option(args, 'audio-spdif')).toBe('--audio-spdif=eac3,truehd');
  });
  it('leaves the option out without a selected format', () => {
    expect(option(mpvArgs({ ...base, audio: { mode: 'passthrough', formats: [] } }), 'audio-spdif')).toBeUndefined();
  });
  it('turns on exclusive mode and stereo only on request', () => {
    expect(option(mpvArgs(base), 'audio-exclusive')).toBeUndefined();
    expect(option(mpvArgs({ ...base, audio: { exclusive: true } }), 'audio-exclusive')).toBe('--audio-exclusive=yes');
    expect(option(mpvArgs(base), 'audio-channels')).toBe('--audio-channels=auto');
    expect(option(mpvArgs({ ...base, audio: { channels: 2 } }), 'audio-channels')).toBe('--audio-channels=stereo');
  });
  it('lets no foreign options through from the settings', () => {
    const args = mpvArgs({ ...base, audio: { mode: 'passthrough', formats: ['ac3', 'ac3 --script=evil.lua'], device: 'x --script=evil.lua' } });
    expect(args.join(' ')).not.toContain('evil');
    expect(option(args, 'audio-device')).toBeUndefined();
  });
  it('accepts real device IDs', () => {
    const device = 'wasapi/{ff5f6f0a-051a-41f7-9015-329f57cacb1a}';
    expect(option(mpvArgs({ ...base, audio: { device } }), 'audio-device')).toBe(`--audio-device=${device}`);
  });
});

describe('Audio devices', () => {
  it('reads the device list and leaves out other interfaces', () => {
    const text = "List of detected audio devices:\r\n  'auto' (Autoselect device)\r\n  'wasapi/{ff5f}' (Lautsprecher (Intel® Audio))\r\n  'openal' (Default (openal))\r\n";
    expect(parseAudioDevices(text)).toEqual([
      { id: 'auto', name: 'Autoselect device' },
      { id: 'wasapi/{ff5f}', name: 'Lautsprecher (Intel® Audio)' },
    ]);
  });
  it('survives empty output', () => {
    expect(parseAudioDevices('')).toEqual([]);
  });
});

describe('Track mapping', () => {
  const streams = [
    { Index: 0, Type: 'Video' as const },
    { Index: 1, Type: 'Audio' as const },
    { Index: 2, Type: 'Audio' as const },
    { Index: 3, Type: 'Subtitle' as const },
    { Index: 9, Type: 'Subtitle' as const, IsExternal: true },
  ];

  it('uses the FFmpeg index when mpv knows it', () => {
    const tracks = [{ id: 1, type: 'audio', 'ff-index': 2 }, { id: 2, type: 'audio', 'ff-index': 1 }];
    expect(findMpvTrack(streams[1], tracks, streams)).toBe(2);
    expect(findMpvTrack(streams[2], tracks, streams)).toBe(1);
  });
  it('falls back to the order', () => {
    const tracks = [{ id: 7, type: 'audio' }, { id: 8, type: 'audio' }, { id: 1, type: 'sub' }];
    expect(findMpvTrack(streams[2], tracks, streams)).toBe(8);
    expect(findMpvTrack(streams[3], tracks, streams)).toBe(1);
  });
  it('maps external subtitles to no embedded track', () => {
    expect(findMpvTrack(streams[4], [{ id: 1, type: 'sub' }], streams)).toBeNull();
  });
  it('returns null when mpv does not have the track', () => {
    expect(findMpvTrack(streams[1], [], streams)).toBeNull();
  });
});

describe('Audio output display', () => {
  it('recognizes passthrough', () => {
    expect(describeAudioOutput({ format: 'spdif-truehd' })).toBe('Passthrough: Dolby TrueHD');
    expect(describeAudioOutput({ format: 'spdif-eac3' })).toBe('Passthrough: Dolby Digital Plus');
    expect(describeAudioOutput({ format: 'spdif-dtshd' })).toBe('Passthrough: DTS-HD');
  });
  it('shows PCM with channels', () => {
    expect(describeAudioOutput({ format: 'floatp', 'hr-channels': '5.1' })).toBe('PCM: 5.1');
    expect(describeAudioOutput({ format: 's16' })).toBe('PCM');
  });
  it('shows nothing without audio', () => {
    expect(describeAudioOutput(null)).toBe('');
    expect(describeAudioOutput({})).toBe('');
  });
});

describe('Profile and settings for mpv', () => {
  it('allows everything directly and burns nothing in', () => {
    const profile = buildExternalPlayerProfile(1_000_000_000);
    expect(profile.DirectPlayProfiles).toEqual([{ Type: 'Video' }]);
    expect(profile.SubtitleProfiles?.some((s) => s.Method === 'Encode')).toBe(false);
    expect(profile.SubtitleProfiles?.find((s) => s.Format === 'pgssub')?.Method).toBe('Embed');
  });
  it('limits to the chosen channels when converting', () => {
    expect(buildExternalPlayerProfile(1, 2).TranscodingProfiles?.[0].MaxAudioChannels).toBe('2');
    expect(buildExternalPlayerProfile(1).TranscodingProfiles?.[0].MaxAudioChannels).toBe('8');
  });
  it('starts with mpv and without passthrough', () => {
    expect(DEFAULT_SETTINGS.playerBackend).toBe('mpv');
    expect(DEFAULT_SETTINGS.audio.mode).toBe('pcm');
  });
  it('adds the audio values to older settings', () => {
    const merged = mergeSettings({ audio: { mode: 'passthrough' } });
    expect(merged.audio.mode).toBe('passthrough');
    expect(merged.audio.device).toBe('auto');
    expect(merged.playerBackend).toBe('mpv');
  });
});
