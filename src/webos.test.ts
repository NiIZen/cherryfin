import { describe, expect, it } from 'vitest';
import { commandForKey } from './focus/engine';
import { chooseStream } from './api/jellyfin';
import { buildWebOSProfile } from './api/profile';

const key = (keyCode: number, name = 'Unidentified') => commandForKey({ key: name, keyCode });

describe('Fernbedienung', () => {
  it('erkennt die webOS-Tasten am Tastencode', () => {
    expect(key(461)).toBe('back');
    expect(key(415)).toBe('play');
    expect(key(19)).toBe('pause');
    expect(key(413)).toBe('stop');
    expect(key(417)).toBe('forward');
    expect(key(412)).toBe('rewind');
  });
  it('erkennt Pfeile und OK auch ohne Tastenname', () => {
    expect(key(37)).toBe('left');
    expect(key(38)).toBe('up');
    expect(key(39)).toBe('right');
    expect(key(40)).toBe('down');
    expect(key(13)).toBe('select');
  });
  it('bevorzugt den Tastennamen', () => {
    expect(commandForKey({ key: 'Escape', keyCode: 27 })).toBe('back');
    expect(commandForKey({ key: ' ', keyCode: 32 })).toBe('playpause');
  });
  it('ignoriert andere Tasten', () => {
    expect(key(65, 'a')).toBeUndefined();
  });
});

describe('Abspielprofil für webOS', () => {
  const direct = () => buildWebOSProfile(1).DirectPlayProfiles![0];

  it('spielt MKV, HEVC und Dolby direkt', () => {
    expect(direct().Container).toContain('mkv');
    expect(direct().VideoCodec).toContain('hevc');
    expect(direct().AudioCodec).toContain('eac3');
  });
  it('lässt DTS und TrueHD standardmäßig umwandeln', () => {
    expect(direct().AudioCodec).not.toContain('dts');
    expect(direct().AudioCodec).not.toContain('truehd');
  });
  it('spielt DTS nur auf Wunsch direkt', () => {
    expect(buildWebOSProfile(1, 6, true).DirectPlayProfiles![0].AudioCodec).toContain('dts');
  });
  it('wandelt mit der gewählten Kanalzahl um', () => {
    expect(buildWebOSProfile(1, 2).TranscodingProfiles![0].MaxAudioChannels).toBe('2');
  });
  it('brennt nur Bilduntertitel ein', () => {
    const subtitles = buildWebOSProfile(1).SubtitleProfiles!;
    expect(subtitles.find((s) => s.Format === 'pgssub')?.Method).toBe('Encode');
    expect(subtitles.find((s) => s.Format === 'srt')?.Method).toBe('External');
  });
});

describe('Stream-Adresse auf dem Fernseher', () => {
  const source = { Id: 'm1', SupportsDirectPlay: true, Container: 'mkv' };

  it('nennt die Dateiendung, damit der TV-Player das Format erkennt', () => {
    expect(chooseStream('http://s', 't', 'i', source, false, true).url).toBe('http://s/Videos/i/stream.mkv?static=true&mediaSourceId=m1&api_key=t');
  });
  it('nimmt bei mehreren Containern den ersten', () => {
    expect(chooseStream('http://s', 't', 'i', { ...source, Container: 'mov,mp4,m4a' }, false, true).url).toContain('/stream.mov?');
  });
  it('lässt die Endung am Computer weg', () => {
    expect(chooseStream('http://s', 't', 'i', source, false).url).toContain('/stream?');
  });
});
