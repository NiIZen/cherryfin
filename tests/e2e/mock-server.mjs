// Kleiner Testserver mit der Jellyfin-Schnittstelle, den die Tests gezielt ausfallen lassen können.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TICKS = 10_000_000;

function item(id, name, type, extra = {}) {
  return { Id: id, Name: name, SortName: name.toLowerCase(), Type: type, ProductionYear: 2024, Overview: `Testeintrag ${name}.`, RunTimeTicks: 120 * TICKS, Genres: ['Drama'], ImageTags: {}, BackdropImageTags: [], UserData: { Key: id, Played: false, IsFavorite: false, PlaybackPositionTicks: 0 }, ...extra };
}

const ITEMS = [
  item('direct', 'Direkter Film', 'Movie', { ParentId: 'lib1' }),
  item('hls', 'HLS Film', 'Movie', { ParentId: 'lib1', UserData: { Key: 'hls', Played: false, IsFavorite: false, PlaybackPositionTicks: 30 * TICKS, PlayedPercentage: 25 } }),
  item('mkv', 'MKV Film', 'Movie', { ParentId: 'lib1' }),
  item('doc', 'Doku Film', 'Movie', { ParentId: 'lib2', Genres: ['Dokumentation'] }),
  item('serie', 'Testserie', 'Series', { ParentId: 'lib3' }),
];

const VIEWS = [
  { Id: 'lib1', Name: 'Filme', Type: 'CollectionFolder', CollectionType: 'movies' },
  { Id: 'lib2', Name: 'Dokumentationen', Type: 'CollectionFolder', CollectionType: 'movies' },
  { Id: 'lib3', Name: 'Serien', Type: 'CollectionFolder', CollectionType: 'tvshows' },
  { Id: 'lib4', Name: 'Musik', Type: 'CollectionFolder', CollectionType: 'music' },
];

const USER = { Id: 'u1', Name: 'Tester', HasPassword: true };
export const TEST_USER = 'tester';
export const TEST_PASSWORD = 'nur-fuer-den-testserver';

const TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.mp4': 'video/mp4', '.m4s': 'video/iso.segment' };

export function startMockServer({ videoFile, hlsDir, mkvFile }) {
  const state = { mode: 'up', requests: [], playback: [], sessions: [], queries: [], segments: [], nextUp: [] };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const route = url.pathname;
    const base = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

    if (state.mode === 'down') return req.socket.destroy();
    if (state.mode === 'hang') return undefined; // Keine Antwort, wie bei einem abgestürzten Dienst.
    if (req.method === 'OPTIONS') { res.writeHead(204, base); return res.end(); }

    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      state.requests.push(`${req.method} ${route}`);
      state.queries.push(`${route}${url.search}`);
      const json = (body, status = 200) => { res.writeHead(status, { ...base, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      const none = () => { res.writeHead(204, base); res.end(); };
      const body = raw ? JSON.parse(raw) : {};

      if (route === '/System/Info/Public') return json({ Id: 'mock', ServerName: 'Testserver', Version: '10.11.0' });

      // Ab hier nur mit Anmeldung. Der Modus 401 simuliert ein abgelaufenes Token.
      if (route === '/Users/Public') return json([]);
      if (route === '/Users/AuthenticateByName') {
        if (body.Username !== TEST_USER || body.Pw !== TEST_PASSWORD) return json({}, 401);
        return json({ AccessToken: 'test-token', User: USER });
      }
      const isStream = route.startsWith('/Videos/') || route.startsWith('/hls/');
      if (state.mode === '401' && !isStream) return json({}, 401);

      if (route === '/UserViews') return json({ Items: VIEWS });
      if (route === '/Genres') return json({ Items: [] });
      if (route === '/Shows/NextUp') return json({ Items: state.nextUp });
      if (route === '/Movies/Recommendations') return json([]);
      if (route.endsWith('/Similar')) return json({ Items: [] });
      if (route.startsWith('/Sessions/')) { state.sessions.push({ route, ...body }); return none(); }
      if (route.startsWith('/MediaSegments/')) return json({ Items: state.segments });

      if (route === '/Items') {
        const q = url.searchParams;
        let list = ITEMS;
        if (q.get('ids')) list = list.filter((i) => q.get('ids').split(',').includes(i.Id));
        if (q.get('parentId')) list = list.filter((i) => i.ParentId === q.get('parentId'));
        if (q.get('includeItemTypes')) list = list.filter((i) => q.get('includeItemTypes').split(',').includes(i.Type));
        if (q.get('filters')?.includes('IsResumable')) list = list.filter((i) => i.UserData.PlaybackPositionTicks > 0);
        if (q.get('filters')?.includes('IsFavorite')) list = [];
        return json({ Items: list, TotalRecordCount: list.length });
      }

      const info = route.match(/^\/Items\/([^/]+)\/PlaybackInfo$/);
      if (info) {
        state.playback.push(body);
        const isHls = info[1] === 'hls';
        if (info[1] === 'mkv') {
          const direct = (body.DeviceProfile?.DirectPlayProfiles ?? []).some((p) => !p.Container || p.Container.split(',').includes('mkv'));
          return json({
            PlaySessionId: `session-${state.playback.length}`,
            MediaSources: [{
              Id: 'src-mkv',
              Container: 'mkv',
              RunTimeTicks: 120 * TICKS,
              SupportsDirectPlay: direct,
              SupportsDirectStream: direct,
              SupportsTranscoding: true,
              TranscodingUrl: direct ? undefined : '/hls/index.m3u8',
              DefaultAudioStreamIndex: 1,
              DefaultSubtitleStreamIndex: -1,
              MediaStreams: [
                { Index: 0, Type: 'Video', Codec: 'h264', Width: 1280, Height: 720 },
                { Index: 1, Type: 'Audio', Codec: 'ac3', Language: 'deu', Channels: 6, DisplayTitle: 'Deutsch – Dolby Digital 5.1' },
                { Index: 2, Type: 'Audio', Codec: 'eac3', Language: 'eng', Channels: 6, DisplayTitle: 'Englisch – Dolby Digital+ 5.1' },
                { Index: 3, Type: 'Audio', Codec: 'truehd', Language: 'eng', Channels: 6, DisplayTitle: 'Englisch – TrueHD 5.1' },
                { Index: 4, Type: 'Audio', Codec: 'dts', Language: 'fra', Channels: 6, DisplayTitle: 'Französisch – DTS 5.1' },
                { Index: 5, Type: 'Subtitle', Codec: 'subrip', Language: 'deu', IsTextSubtitleStream: true, DisplayTitle: 'Deutsch' },
              ],
            }],
          });
        }
        return json({
          PlaySessionId: `session-${state.playback.length}`,
          MediaSources: [{
            Id: `src-${info[1]}`,
            Container: 'mp4',
            RunTimeTicks: 120 * TICKS,
            SupportsDirectPlay: !isHls,
            SupportsDirectStream: !isHls,
            SupportsTranscoding: true,
            TranscodingUrl: isHls ? '/hls/index.m3u8' : undefined,
            DefaultAudioStreamIndex: 1,
            DefaultSubtitleStreamIndex: -1,
            MediaStreams: [
              { Index: 0, Type: 'Video', Codec: 'h264', Width: 1280, Height: 720 },
              { Index: 1, Type: 'Audio', Codec: 'aac', Language: 'deu', Channels: 2, DisplayTitle: 'Deutsch – AAC Stereo' },
            ],
          }],
        });
      }

      if (route.startsWith('/Videos/mkv/') && route.includes('/stream')) return sendFile(req, res, mkvFile, 'video/x-matroska', base);
      if (route.startsWith('/Videos/') && route.includes('/stream')) return sendFile(req, res, videoFile, 'video/mp4', base);
      if (route.startsWith('/hls/')) {
        const file = path.join(hlsDir, path.basename(route));
        return sendFile(req, res, file, TYPES[path.extname(file)] ?? 'application/octet-stream', base);
      }
      return json({}, 404);
    });
    return undefined;
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      state,
      port: server.address().port,
      setMode(mode) { state.mode = mode; },
      close() { server.closeAllConnections(); server.close(); },
    }));
  });
}

function sendFile(req, res, file, type, base) {
  if (!fs.existsSync(file)) { res.writeHead(404, base); res.end(); return; }
  const { size } = fs.statSync(file);
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { ...base, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...base, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
    fs.createReadStream(file).pipe(res);
  }
}
