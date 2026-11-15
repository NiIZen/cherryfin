import { describe, expect, it } from 'vitest';
import { authHeader, buildQuery, chooseStream, secondsToTicks, serverCandidates } from './api/jellyfin';
import { buildDeviceProfile } from './api/profile';
import { backdropRef, landscapeRef, logoRef, posterRef } from './api/images';
import { formatClock, formatRuntime, mediaBadges, trickplayTile } from './app/format';
import { pickBest, revealOffset, scoreMove, type Box } from './focus/spatial';

const box = (left: number, top: number, width = 100, height = 100): Box => ({ left, top, right: left + width, bottom: top + height });

describe('Fokus-Navigation', () => {
  const current = box(100, 100);
  const rightNeighbor = box(220, 100);
  const farRight = box(340, 100);
  const below = box(100, 300);
  const belowRight = box(400, 300);

  it('wählt seitwärts den direkten Nachbarn', () => {
    expect(pickBest(current, [farRight, rightNeighbor], 'right')).toBe(1);
  });

  it('springt am Reihenende nicht seitwärts in eine andere Reihe', () => {
    expect(scoreMove(current, belowRight, 'right')).toBeNull();
    expect(pickBest(current, [below, belowRight], 'right')).toBe(-1);
  });

  it('wählt nach unten die Karte, die am besten darunter liegt', () => {
    expect(pickBest(current, [belowRight, below], 'down')).toBe(1);
  });

  it('ignoriert alles, was entgegen der Richtung liegt', () => {
    expect(pickBest(current, [below], 'up')).toBe(-1);
  });

  it('bevorzugt die nähere von zwei Reihen', () => {
    expect(pickBest(current, [box(100, 600), box(100, 300)], 'down')).toBe(1);
  });
});

describe('Scrollposition', () => {
  it('bleibt stehen, wenn das Element schon sichtbar ist', () => {
    expect(revealOffset(0, 1000, 200, 400, 50, 0, 5000)).toBe(0);
  });
  it('scrollt zurück, wenn das Element links aus dem Bild ist', () => {
    expect(revealOffset(600, 1000, 300, 500, 50, 0, 5000)).toBe(250);
  });
  it('scrollt vor und lässt eine Vorschau auf das nächste Element', () => {
    expect(revealOffset(0, 1000, 900, 1100, 50, 70, 5000)).toBe(220);
  });
  it('bleibt in den Grenzen des Scrollbereichs', () => {
    expect(revealOffset(0, 1000, 900, 1100, 50, 70, 100)).toBe(100);
    expect(revealOffset(100, 1000, 10, 200, 50, 0, 5000)).toBe(0);
  });
});

describe('Serveradresse', () => {
  it('ergänzt bei einem bloßen Hostnamen den Standardport', () => {
    expect(serverCandidates('nas')[0]).toBe('http://nas:8096');
  });
  it('behält einen angegebenen Port', () => {
    expect(serverCandidates('192.168.1.20:8920')).toEqual(['http://192.168.1.20:8920', 'https://192.168.1.20:8920']);
  });
  it('verändert eine vollständige Adresse nicht, außer dem Schrägstrich am Ende', () => {
    expect(serverCandidates(' https://jf.example.org/jellyfin/ ')).toEqual(['https://jf.example.org/jellyfin']);
  });
  it('gibt bei leerer Eingabe nichts zurück', () => {
    expect(serverCandidates('   ')).toEqual([]);
  });
});

describe('Anfragen', () => {
  it('lässt leere Werte aus und verbindet Listen mit Komma', () => {
    expect(buildQuery({ a: 1, b: undefined, c: '', d: ['x', 'y'], e: [], f: false })).toBe('?a=1&d=x%2Cy&f=false');
  });
  it('gibt ohne Parameter einen leeren Text zurück', () => {
    expect(buildQuery({})).toBe('');
  });
  it('baut den Jellyfin-Auth-Header', () => {
    const header = authHeader('abc', 'tok');
    expect(header.startsWith('MediaBrowser ')).toBe(true);
    expect(header).toContain('DeviceId="abc"');
    expect(header).toContain('Token="tok"');
    expect(authHeader('abc')).not.toContain('Token');
  });
  it('rechnet Sekunden in Ticks um', () => {
    expect(secondsToTicks(1.5)).toBe(15_000_000);
  });
});

describe('Stream-Auswahl', () => {
  const url = 'http://srv:8096';

  it('nimmt Direct Play, wenn der Server es erlaubt', () => {
    const result = chooseStream(url, 'tok', 'id1', { Id: 'm1', SupportsDirectPlay: true, TranscodingUrl: '/x.m3u8' }, false);
    expect(result.method).toBe('DirectPlay');
    expect(result.isHls).toBe(false);
    expect(result.url).toBe('http://srv:8096/Videos/id1/stream?static=true&mediaSourceId=m1&api_key=tok');
  });
  it('nimmt HLS, wenn Direct Play nicht geht', () => {
    const result = chooseStream(url, 'tok', 'id1', { Id: 'm1', SupportsDirectPlay: false, TranscodingUrl: '/videos/id1/master.m3u8?x=1' }, false);
    expect(result).toEqual({ url: 'http://srv:8096/videos/id1/master.m3u8?x=1', isHls: true, method: 'Transcode' });
  });
  it('übergeht Direct Play, wenn Transkodierung erzwungen ist', () => {
    const result = chooseStream(url, 'tok', 'id1', { Id: 'm1', SupportsDirectPlay: true, TranscodingUrl: '/a.m3u8' }, true);
    expect(result.isHls).toBe(true);
  });
  it('meldet einen Fehler, wenn nichts abspielbar ist', () => {
    expect(() => chooseStream(url, 'tok', 'id1', { Id: 'm1', SupportsDirectPlay: false }, false)).toThrow();
  });
});

describe('Geräteprofil', () => {
  it('meldet ohne Hardware-Decoder nur H.264 und kein MKV', () => {
    const profile = buildDeviceProfile(10_000_000, () => false);
    const mp4 = profile.DirectPlayProfiles?.find((p) => p.Container?.includes('mp4'));
    expect(mp4?.VideoCodec).toBe('h264');
    expect(profile.DirectPlayProfiles?.some((p) => p.Container?.includes('mkv'))).toBe(false);
    expect(profile.MaxStreamingBitrate).toBe(10_000_000);
  });
  it('meldet HEVC, wenn der Browser es kann', () => {
    const profile = buildDeviceProfile(10_000_000, (mime) => mime.includes('hvc1'));
    expect(profile.DirectPlayProfiles?.[0].VideoCodec).toContain('hevc');
  });
  it('brennt Bilduntertitel ein und liefert Text extern', () => {
    const profile = buildDeviceProfile(1, () => false);
    expect(profile.SubtitleProfiles?.find((s) => s.Format === 'pgssub')?.Method).toBe('Encode');
    expect(profile.SubtitleProfiles?.find((s) => s.Format === 'srt')?.Method).toBe('External');
  });
});

describe('Bilder', () => {
  const episode = {
    Id: 'e1',
    Type: 'Episode' as const,
    SeriesId: 's1',
    SeriesPrimaryImageTag: 'sp',
    ImageTags: { Primary: 'ep' },
    ParentBackdropItemId: 's1',
    ParentBackdropImageTags: ['bd'],
    ParentLogoItemId: 's1',
    ParentLogoImageTag: 'lg',
  };

  it('nimmt bei Episoden das Plakat der Serie', () => {
    expect(posterRef(episode)?.itemId).toBe('s1');
  });
  it('nimmt für Querformat das Episodenbild', () => {
    expect(landscapeRef(episode)).toMatchObject({ itemId: 'e1', tag: 'ep' });
  });
  it('erbt Backdrop und Logo von der Serie', () => {
    expect(backdropRef(episode)).toMatchObject({ itemId: 's1', type: 'Backdrop', tag: 'bd' });
    expect(logoRef(episode)).toMatchObject({ itemId: 's1', tag: 'lg' });
  });
  it('gibt null zurück, wenn es kein Bild gibt', () => {
    expect(landscapeRef({ Id: 'x' })).toBeNull();
    expect(logoRef({ Id: 'x' })).toBeNull();
  });
});

describe('Formatierung', () => {
  it('formatiert Laufzeiten', () => {
    expect(formatRuntime(45 * 600_000_000)).toBe('45 Min.');
    expect(formatRuntime(128 * 600_000_000)).toBe('2 Std. 8 Min.');
    expect(formatRuntime(120 * 600_000_000)).toBe('2 Std.');
    expect(formatRuntime(null)).toBe('');
  });
  it('formatiert Zeiten im Player', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(NaN)).toBe('0:00');
  });
  it('leitet Plaketten aus den Streams ab', () => {
    const badges = mediaBadges({
      OfficialRating: 'FSK 12',
      MediaSources: [{ MediaStreams: [
        { Type: 'Video', Width: 3840, Height: 2160, VideoRange: 'HDR', VideoRangeType: 'DOVIWithHDR10' },
        { Type: 'Audio', Channels: 6, DisplayTitle: 'Deutsch 5.1' },
        { Type: 'Subtitle' },
      ] }],
    });
    expect(badges).toEqual(['FSK 12', '4K', 'Dolby Vision', '5.1', 'UT']);
  });
});

describe('Trickplay', () => {
  const info = { Width: 320, Height: 180, TileWidth: 10, TileHeight: 10, ThumbnailCount: 250, Interval: 10_000 };

  it('findet die Kachel für den Anfang', () => {
    expect(trickplayTile(info, 0)).toEqual({ sheet: 0, column: 0, row: 0 });
  });
  it('rechnet Zeile und Spalte aus', () => {
    expect(trickplayTile(info, 125)).toEqual({ sheet: 0, column: 2, row: 1 });
  });
  it('wechselt nach 100 Bildern auf das nächste Blatt', () => {
    expect(trickplayTile(info, 1000)).toEqual({ sheet: 1, column: 0, row: 0 });
  });
  it('geht nicht über das letzte Bild hinaus', () => {
    expect(trickplayTile(info, 99_999)).toEqual({ sheet: 2, column: 9, row: 4 });
  });
});
