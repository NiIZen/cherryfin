import { describe, expect, it } from 'vitest';
import { commandForKey } from './focus/engine';
import { chooseStream } from './api/jellyfin';
import { buildWebOSProfile } from './api/profile';

const key = (keyCode: number, name = 'Unidentified') => commandForKey({ key: name, keyCode });

describe('Remote control', () => {
  it('recognizes webOS keys by key code', () => {
    expect(key(461)).toBe('back');
    expect(key(415)).toBe('play');
    expect(key(19)).toBe('pause');
    expect(key(413)).toBe('stop');
    expect(key(417)).toBe('forward');
    expect(key(412)).toBe('rewind');
  });
  it('recognizes arrows and OK without a key name', () => {
    expect(key(37)).toBe('left');
    expect(key(38)).toBe('up');
    expect(key(39)).toBe('right');
    expect(key(40)).toBe('down');
    expect(key(13)).toBe('select');
  });
  it('prefers the key name', () => {
    expect(commandForKey({ key: 'Escape', keyCode: 27 })).toBe('back');
    expect(commandForKey({ key: ' ', keyCode: 32 })).toBe('playpause');
  });
  it('ignores other keys', () => {
    expect(key(65, 'a')).toBeUndefined();
  });
});

describe('Playback profile for webOS', () => {
  const direct = () => buildWebOSProfile(1).DirectPlayProfiles![0];

  it('plays MKV, HEVC and Dolby directly', () => {
    expect(direct().Container).toContain('mkv');
    expect(direct().VideoCodec).toContain('hevc');
    expect(direct().AudioCodec).toContain('eac3');
  });
  it('has DTS and TrueHD converted by default', () => {
    expect(direct().AudioCodec).not.toContain('dts');
    expect(direct().AudioCodec).not.toContain('truehd');
  });
  it('plays DTS directly only on request', () => {
    expect(buildWebOSProfile(1, 6, true).DirectPlayProfiles![0].AudioCodec).toContain('dts');
  });
  it('converts with the chosen channel count', () => {
    expect(buildWebOSProfile(1, 2).TranscodingProfiles![0].MaxAudioChannels).toBe('2');
  });
  it('burns in only image subtitles', () => {
    const subtitles = buildWebOSProfile(1).SubtitleProfiles!;
    expect(subtitles.find((s) => s.Format === 'pgssub')?.Method).toBe('Encode');
    expect(subtitles.find((s) => s.Format === 'srt')?.Method).toBe('External');
  });
});

describe('Stream address on the TV', () => {
  const source = { Id: 'm1', SupportsDirectPlay: true, Container: 'mkv' };

  it('names the file extension so the TV player recognizes the format', () => {
    expect(chooseStream('http://s', 't', 'i', source, false, true).url).toBe('http://s/Videos/i/stream.mkv?static=true&mediaSourceId=m1&api_key=t');
  });
  it('takes the first of several containers', () => {
    expect(chooseStream('http://s', 't', 'i', { ...source, Container: 'mov,mp4,m4a' }, false, true).url).toContain('/stream.mov?');
  });
  it('leaves out the extension on the computer', () => {
    expect(chooseStream('http://s', 't', 'i', source, false).url).toContain('/stream?');
  });
});
