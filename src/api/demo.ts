import type {
  BaseItemKind,
  ImageRef,
  Item,
  ItemQuery,
  MediaClient,
  Page,
  PlaybackOptions,
  PlaybackSession,
  ProgressReport,
  Recommendation,
  Segment,
  Source,
  User,
} from './types';

/*
 * Demo mode without a server: all titles are made up, and all images are generated here as SVG.
 * This lets the whole interface, player included, be shown and tested.
 */

const TICKS_PER_MINUTE = 600_000_000;
const DEMO_VIDEO_SECONDS = 120;

interface Art {
  sky: [string, string, string];
  ridge: string;
  sun: string;
  kind: 'mountains' | 'city' | 'ocean' | 'stars' | 'dunes';
}

const ART: Art[] = [
  { sky: ['#0b1d3a', '#2a4d8f', '#f2a65a'], ridge: '#0a1428', sun: '#ffd9a0', kind: 'mountains' },
  { sky: ['#12061f', '#54206e', '#e8547c'], ridge: '#0d0518', sun: '#ffb3c4', kind: 'city' },
  { sky: ['#03212e', '#0e6a7d', '#8fe3d0'], ridge: '#021a24', sun: '#e6fff5', kind: 'ocean' },
  { sky: ['#02030c', '#101a4a', '#3a2c7a'], ridge: '#03040f', sun: '#cfd8ff', kind: 'stars' },
  { sky: ['#3a1408', '#b4501a', '#f6c25e'], ridge: '#2a0e05', sun: '#fff0c0', kind: 'dunes' },
  { sky: ['#07241b', '#14684a', '#b8d96a'], ridge: '#04160f', sun: '#f4ffc9', kind: 'mountains' },
  { sky: ['#1a1a24', '#49506e', '#c3b6c9'], ridge: '#101018', sun: '#f6eef5', kind: 'city' },
  { sky: ['#2b0a0a', '#8a1c2a', '#f07a4a'], ridge: '#1a0506', sun: '#ffd0a8', kind: 'dunes' },
];

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

function rng(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2147483647 + state) >>> 0;
    return state / 4294967296;
  };
}

function mix(from: string, to: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const parts = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * amount));
  return `rgb(${parts.join(',')})`;
}

function ridgePath(random: () => number, width: number, height: number, base: number, amplitude: number, steps: number): string {
  const points: string[] = [`M0 ${height}`, `L0 ${base}`];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = base - random() * amplitude;
    points.push(`L${x.toFixed(0)} ${y.toFixed(0)}`);
  }
  points.push(`L${width} ${height} Z`);
  return points.join(' ');
}

function scene(seed: string, width: number, height: number): string {
  const random = rng(hash(seed));
  const art = ART[hash(seed) % ART.length];
  const id = `g${hash(seed) % 100000}`;
  const horizon = height * 0.62;
  const sunX = width * (0.2 + random() * 0.6);
  const sunR = Math.min(width, height) * (0.07 + random() * 0.08);
  let body = '';

  if (art.kind === 'stars') {
    for (let i = 0; i < 160; i++) {
      body += `<circle cx="${(random() * width).toFixed(0)}" cy="${(random() * height * 0.8).toFixed(0)}" r="${(random() * 2.2 + 0.4).toFixed(1)}" fill="#fff" opacity="${(random() * 0.8 + 0.2).toFixed(2)}"/>`;
    }
  }

  body += `<circle cx="${sunX}" cy="${horizon - sunR * 0.5}" r="${sunR * 2.6}" fill="${art.sun}" opacity=".16" filter="url(#${id}b)"/>`;
  body += `<circle cx="${sunX}" cy="${horizon - sunR * 0.5}" r="${sunR}" fill="${art.sun}"/>`;

  if (art.kind === 'city') {
    for (let layer = 0; layer < 3; layer++) {
      const opacity = 0.45 + layer * 0.27;
      let x = -10;
      while (x < width) {
        const w = 26 + random() * (width * 0.05);
        const h = height * (0.14 + random() * 0.32) * (1 - layer * 0.18);
        body += `<rect x="${x.toFixed(0)}" y="${(height - h - height * 0.06).toFixed(0)}" width="${w.toFixed(0)}" height="${(h + height * 0.06).toFixed(0)}" fill="${mix(art.sky[1], art.ridge, opacity)}"/>`;
        if (layer === 2) {
          for (let w2 = 0; w2 < 6; w2++) {
            body += `<rect x="${(x + 4 + random() * (w - 10)).toFixed(0)}" y="${(height - random() * h).toFixed(0)}" width="3" height="4" fill="${art.sun}" opacity=".75"/>`;
          }
        }
        x += w + 3;
      }
    }
  } else if (art.kind === 'ocean') {
    for (let layer = 0; layer < 5; layer++) {
      const base = horizon + layer * (height * 0.085);
      body += `<path d="${ridgePath(random, width, height, base, height * 0.03, 22)}" fill="${mix(art.sky[1], art.ridge, 0.3 + layer * 0.16)}"/>`;
    }
  } else {
    const smooth = art.kind === 'dunes';
    for (let layer = 0; layer < 4; layer++) {
      const base = horizon + layer * (height * 0.09);
      const amplitude = height * (smooth ? 0.05 : 0.22) * (1 - layer * 0.14);
      const color = mix(art.sky[1], art.ridge, 0.42 + layer * 0.2);
      body += `<path d="${ridgePath(random, width, height, base, amplitude, smooth ? 8 : 14 + layer * 3)}" fill="${color}" stroke-linejoin="round" stroke="${color}" stroke-width="${smooth ? 40 : 2}"/>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${art.sky[0]}"/><stop offset=".6" stop-color="${art.sky[1]}"/><stop offset="1" stop-color="${art.sky[2]}"/></linearGradient>
<filter id="${id}b" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="${sunR}"/></filter></defs>
<rect width="${width}" height="${height}" fill="url(#${id})"/>${body}TEXT_SLOT</svg>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const FONT = `font-family="Inter Variable, Segoe UI, sans-serif"`;

function posterText(title: string, width: number, height: number): string {
  const words = title.split(' ');
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && (last + ' ' + word).length < 13) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const longest = Math.max(...lines.map((line) => line.length));
  const size = Math.min(width * 0.105, (width * 0.88) / (longest * 0.72));
  return lines
    .map((line, i) => `<text x="${width / 2}" y="${height * 0.15 + i * size * 1.12}" ${FONT} font-weight="800" font-size="${size}" fill="#fff" text-anchor="middle" letter-spacing="1">${escapeXml(line.toUpperCase())}</text>`)
    .join('');
}

const USER: User = { Id: 'demo-user', Name: 'Demo', HasPassword: false };

interface Blueprint {
  id: string;
  name: string;
  year: number;
  genres: string[];
  rating: number;
  certificate: string;
  minutes: number;
  overview: string;
  tagline?: string;
  created: number;
}

const MOVIES: Blueprint[] = [
  { id: 'm1', name: 'The Last Summer', year: 2024, genres: ['Drama'], rating: 8.2, certificate: 'FSK 12', minutes: 128, created: 1, tagline: 'Some goodbyes take a lifetime.', overview: 'When her father dies, the architect Mara returns to the coastal village of her childhood to sell the house where she spent every summer. There she stumbles upon a secret that puts everything in question.' },
  { id: 'm2', name: 'Neon Fever', year: 2023, genres: ['Thriller', 'Crime'], rating: 7.6, certificate: 'FSK 16', minutes: 112, created: 2, tagline: 'The city never sleeps. Neither does he.', overview: 'In a rain-soaked metropolis, a night courier gets caught between two rival gangs while delivering a package that should never have existed.' },
  { id: 'm3', name: 'Deep Sea', year: 2025, genres: ['Science-Fiction', 'Adventure'], rating: 7.9, certificate: 'FSK 12', minutes: 141, created: 3, overview: 'A research crew discovers a signal at the bottom of the Pacific that is older than humanity. The descent becomes a journey with no safe way back.' },
  { id: 'm4', name: 'Stardust', year: 2022, genres: ['Science-Fiction', 'Drama'], rating: 8.5, certificate: 'FSK 6', minutes: 134, created: 4, overview: 'The last astronaut on an abandoned space station receives a message from Earth that seems to come from the future.' },
  { id: 'm5', name: 'Sand and Ash', year: 2021, genres: ['Adventure', 'Action'], rating: 7.1, certificate: 'FSK 16', minutes: 119, created: 5, overview: 'Two feuding caravan leaders must cross the largest desert in the world together to free their kidnapped families.' },
  { id: 'm6', name: 'Forest Child', year: 2024, genres: ['Family', 'Adventure'], rating: 8.0, certificate: 'FSK 6', minutes: 96, created: 6, overview: 'Twelve-year-old Juna gets lost in the mountain forest and finds a friend there whom the grown-ups take for a fairy tale.' },
  { id: 'm7', name: 'Gray Zone', year: 2023, genres: ['Crime', 'Drama'], rating: 7.4, certificate: 'FSK 16', minutes: 124, created: 7, overview: 'A Berlin detective investigates her own partner and has to decide how far loyalty may go.' },
  { id: 'm8', name: 'Ember Red', year: 2020, genres: ['Action', 'Thriller'], rating: 6.9, certificate: 'FSK 18', minutes: 107, created: 8, overview: 'A firefighter uncovers that the series of fires in her hometown was planned from the very top. Now she is the next target.' },
  { id: 'm9', name: 'The Cartographer', year: 2025, genres: ['Drama', 'Adventure'], rating: 8.3, certificate: 'FSK 12', minutes: 152, created: 9, overview: 'In 1887, against all odds, a young cartographer sets out to survey the last blank spot on the map.' },
  { id: 'm10', name: 'Midnight Train', year: 2022, genres: ['Thriller'], rating: 7.3, certificate: 'FSK 12', minutes: 101, created: 10, overview: 'On the night train from Vienna to Paris, a passenger vanishes without a trace. Nobody but a conductor will admit to remembering him.' },
  { id: 'm11', name: 'Little Escapes', year: 2024, genres: ['Comedy'], rating: 7.7, certificate: 'FSK 0', minutes: 93, created: 11, overview: 'Three pensioners hijack a coach and drive to the sea. The police, their children and a very determined poodle are hot on their heels.' },
  { id: 'm12', name: 'Northern Lights', year: 2023, genres: ['Drama', 'Comedy'], rating: 7.8, certificate: 'FSK 6', minutes: 110, created: 12, overview: 'A chef from Hamburg inherits a guesthouse at the Arctic Circle and wants to get rid of it fast. Winter and the neighbors have other plans.' },
];

const SERIES: Array<Blueprint & { seasons: number; episodes: number }> = [
  { id: 's1', name: 'The Archive', year: 2023, genres: ['Science-Fiction', 'Thriller'], rating: 8.8, certificate: 'FSK 16', minutes: 52, created: 1, seasons: 3, episodes: 8, overview: 'An underground agency archives events that never happened. Then a new employee finds her own file.' },
  { id: 's2', name: 'Harbor Town', year: 2022, genres: ['Crime', 'Drama'], rating: 8.1, certificate: 'FSK 12', minutes: 45, created: 2, seasons: 2, episodes: 10, overview: 'A customs investigator in Rostock gets on the trail of a smuggling ring that reaches deeper into her family than she wants to admit.' },
  { id: 's3', name: 'Morning Glow', year: 2025, genres: ['Drama'], rating: 8.4, certificate: 'FSK 12', minutes: 58, created: 3, seasons: 1, episodes: 6, overview: 'A clinic in the Alps, six people and one night after which nothing is the same.' },
  { id: 's4', name: 'Orbit', year: 2024, genres: ['Science-Fiction', 'Adventure'], rating: 7.9, certificate: 'FSK 12', minutes: 48, created: 4, seasons: 2, episodes: 8, overview: 'The first private space station opens to tourists. On the very first day, contact with Earth breaks off.' },
  { id: 's5', name: 'Kreuzberg Flatshare', year: 2021, genres: ['Comedy'], rating: 7.5, certificate: 'FSK 6', minutes: 26, created: 5, seasons: 4, episodes: 12, overview: 'Five flatmates, a kitchen far too small and a landlord who has not been in the flat for ages but supposedly knows everything.' },
];

const DOCUMENTARIES: Blueprint[] = [
  { id: 'd1', name: 'Atlas of the Seas', year: 2024, genres: ['Documentary'], rating: 8.6, certificate: 'FSK 0', minutes: 94, created: 20, overview: 'A journey to the deepest trenches and most remote coasts on Earth.' },
  { id: 'd2', name: 'Bee Country', year: 2022, genres: ['Documentary'], rating: 7.9, certificate: 'FSK 0', minutes: 78, created: 21, overview: 'A year with beekeepers between alpine meadows and city rooftops.' },
  { id: 'd3', name: 'Icy Times', year: 2023, genres: ['Documentary'], rating: 8.1, certificate: 'FSK 6', minutes: 102, created: 22, overview: 'Researchers measure Greenland’s glaciers while they still exist.' },
  { id: 'd4', name: 'City of Foxes', year: 2025, genres: ['Documentary'], rating: 8.4, certificate: 'FSK 0', minutes: 86, created: 23, overview: 'How wild animals conquer the big cities and what we can learn from them.' },
  { id: 'd5', name: 'Witnesses', year: 2021, genres: ['Documentary'], rating: 8.8, certificate: 'FSK 12', minutes: 118, created: 24, overview: 'People tell of the one day that changed their lives.' },
];

const EXTRA_WORDS = ['Afterglow', 'Beacon', 'Comeback', 'Dusk', 'Echo', 'Faraway', 'Glass Tides', 'Horizon', 'Island Time', 'Jamboree', 'Keystone', 'Lighthouse', 'Morning Grey', 'Night Drive', 'Odyssey', 'Polar Circle', 'Quicksilver', 'Rainy Season', 'Shadow Play', 'Tidewater', 'Undertow', 'Vanishing Point', 'Winter Garden', 'Xenon', 'Yukon', 'Zephyr', '1984 revisited'];
const EXTRA_SUFFIX = ['', ' by the Sea', ' in Berlin', ' in Winter', ' and Us', ' Without End'];
const EXTRA_GENRES = ['Drama', 'Thriller', 'Comedy', 'Adventure', 'Science-Fiction', 'Crime'];

function extraMovies(count: number): Blueprint[] {
  return Array.from({ length: count }, (_, i) => {
    const suffix = EXTRA_SUFFIX[Math.floor(i / EXTRA_WORDS.length) % EXTRA_SUFFIX.length];
    const round = Math.floor(i / (EXTRA_WORDS.length * EXTRA_SUFFIX.length));
    const seed = hash(`x${i}`);
    return {
      id: `x${i}`,
      name: `${EXTRA_WORDS[i % EXTRA_WORDS.length]}${suffix}${round ? ` ${round + 1}` : ''}`,
      year: 1990 + (seed % 36),
      genres: [EXTRA_GENRES[seed % EXTRA_GENRES.length]],
      rating: 5 + (seed % 45) / 10,
      certificate: 'FSK 12',
      minutes: 85 + (seed % 70),
      created: 100 + i,
      overview: 'A made-up title that only fills the demo library.',
    };
  });
}

const PEOPLE = ['Lena Hartwig', 'Jonas Reuter', 'Amira Saleh', 'Tom Brandt', 'Sophie Lindner', 'Milan Kovač', 'Greta Voss', 'Emil Sørensen', 'Nora Weiß', 'David Okafor'];

const EPISODE_NAMES = ['The Beginning', 'Under Water', 'The Second Door', 'Radio Silence', 'Old Acquaintances', 'Headwind', 'The Promise', 'Flying Blind', 'Whispers', 'Back to Zero', 'Double Game', 'The Last Train'];

function imageTags(id: string) {
  return { Primary: id, Logo: id, Thumb: id };
}

function makeMediaSource(id: string, minutes: number): Source {
  return {
    Id: `src-${id}`,
    Container: 'mp4',
    RunTimeTicks: minutes * TICKS_PER_MINUTE,
    SupportsDirectPlay: true,
    SupportsDirectStream: true,
    SupportsTranscoding: true,
    DefaultAudioStreamIndex: 1,
    DefaultSubtitleStreamIndex: -1,
    MediaStreams: [
      { Index: 0, Type: 'Video', Codec: 'h264', Height: 2160, Width: 3840, VideoRange: 'HDR', VideoRangeType: 'DOVIWithHDR10', DisplayTitle: '4K Dolby Vision' },
      { Index: 1, Type: 'Audio', Codec: 'eac3', Language: 'deu', Channels: 6, ChannelLayout: '5.1', IsDefault: true, DisplayTitle: 'German – Dolby Digital+ 5.1' },
      { Index: 2, Type: 'Audio', Codec: 'truehd', Language: 'eng', Channels: 8, ChannelLayout: '7.1', DisplayTitle: 'English – Dolby Atmos' },
      { Index: 3, Type: 'Subtitle', Codec: 'srt', Language: 'deu', IsTextSubtitleStream: true, SupportsExternalStream: true, DisplayTitle: 'German' },
      { Index: 4, Type: 'Subtitle', Codec: 'srt', Language: 'eng', IsTextSubtitleStream: true, SupportsExternalStream: true, DisplayTitle: 'English' },
    ],
  };
}

const CREATED_BASE = Date.UTC(2026, 9, 30);

function baseItem(blueprint: Blueprint, type: BaseItemKind): Item {
  const seed = hash(blueprint.id);
  return {
    Id: blueprint.id,
    Name: blueprint.name,
    Type: type,
    ProductionYear: blueprint.year,
    Genres: blueprint.genres,
    CommunityRating: blueprint.rating,
    OfficialRating: blueprint.certificate,
    RunTimeTicks: blueprint.minutes * TICKS_PER_MINUTE,
    Overview: blueprint.overview,
    Taglines: blueprint.tagline ? [blueprint.tagline] : [],
    DateCreated: new Date(CREATED_BASE - blueprint.created * 86_400_000).toISOString(),
    ImageTags: imageTags(blueprint.id),
    BackdropImageTags: [blueprint.id],
    People: Array.from({ length: 7 }, (_, i) => {
      const name = PEOPLE[(seed + i * 3) % PEOPLE.length];
      return { Id: `p${(seed + i * 3) % PEOPLE.length}`, Name: name, Role: i === 6 ? undefined : `Role ${i + 1}`, Type: i === 6 ? 'Director' as const : 'Actor' as const, PrimaryImageTag: name };
    }),
    Studios: [{ Name: 'Northern Lights Studio', Id: 'studio' }],
    UserData: { Key: '', Played: false, IsFavorite: false, PlaybackPositionTicks: 0 },
  };
}

function buildLibrary(extra: number) {
  const items = new Map<string, Item>();
  for (const movie of [...MOVIES, ...DOCUMENTARIES, ...extraMovies(extra)]) {
    const item = baseItem(movie, 'Movie');
    item.MediaSources = [makeMediaSource(movie.id, movie.minutes)];
    items.set(movie.id, item);
  }
  for (const series of SERIES) {
    items.set(series.id, { ...baseItem(series, 'Series'), ChildCount: series.seasons, Status: 'Continuing' });
    for (let s = 1; s <= series.seasons; s++) {
      const seasonId = `${series.id}-s${s}`;
      items.set(seasonId, {
        Id: seasonId,
        Name: `Season ${s}`,
        Type: 'Season',
        IndexNumber: s,
        SeriesId: series.id,
        SeriesName: series.name,
        ParentId: series.id,
        ImageTags: { Primary: seasonId },
        UserData: { Key: '', Played: false, IsFavorite: false },
      });
      for (let e = 1; e <= series.episodes; e++) {
        const id = `${seasonId}-e${e}`;
        items.set(id, {
          Id: id,
          Name: EPISODE_NAMES[(hash(id) + e) % EPISODE_NAMES.length],
          Type: 'Episode',
          SeriesId: series.id,
          SeriesName: series.name,
          SeasonId: seasonId,
          SeasonName: `Season ${s}`,
          ParentIndexNumber: s,
          IndexNumber: e,
          RunTimeTicks: series.minutes * TICKS_PER_MINUTE,
          ProductionYear: series.year + s - 1,
          OfficialRating: series.certificate,
          Overview: `Episode ${e} of “${series.name}”: a new clue forces everyone involved to decide whom they can still trust.`,
          ImageTags: { Primary: id },
          SeriesPrimaryImageTag: series.id,
          ParentLogoItemId: series.id,
          ParentLogoImageTag: series.id,
          ParentBackdropItemId: series.id,
          ParentBackdropImageTags: [series.id],
          UserData: { Key: '', Played: false, IsFavorite: false, PlaybackPositionTicks: 0 },
          MediaSources: [makeMediaSource(id, series.minutes)],
        });
      }
    }
  }

  const setProgress = (id: string, percent: number) => {
    const item = items.get(id);
    if (!item?.RunTimeTicks) return;
    item.UserData = { Key: '', ...item.UserData, PlaybackPositionTicks: Math.round((item.RunTimeTicks * percent) / 100), PlayedPercentage: percent, LastPlayedDate: new Date(CREATED_BASE).toISOString() };
  };
  setProgress('m3', 42);
  setProgress('s1-s2-e3', 68);
  setProgress('m7', 15);
  for (let e = 1; e <= 3; e++) {
    const item = items.get(`s4-s1-e${e}`);
    if (item) item.UserData = { Key: '', ...item.UserData, Played: true };
  }
  const favorite = items.get('m4');
  if (favorite) favorite.UserData = { Key: '', ...favorite.UserData, IsFavorite: true };
  return items;
}

const DEMO_VTT = `WEBVTT

00:00:01.000 --> 00:00:05.000
This is a demo subtitle.

00:00:06.000 --> 00:00:11.000
In normal use, subtitles come from your Jellyfin server.

00:00:20.000 --> 00:00:26.000
Press the up arrow to reach subtitles and audio tracks.
`;

export class DemoClient implements MediaClient {
  readonly isDemo = true;
  readonly serverName = 'Demo library';
  readonly serverUrl = 'demo://';
  readonly user = USER;
  private items: Map<string, Item>;
  private imageCache = new Map<string, string>();

  constructor(extra = 90) {
    this.items = buildLibrary(extra);
  }

  private get all() {
    return [...this.items.values()];
  }

  private clone(item: Item): Item {
    return { ...item, UserData: { Key: '', ...item.UserData } };
  }

  async checkConnection(): Promise<boolean> {
    return true;
  }

  cancelPending(): void {}

  async getViews(): Promise<Item[]> {
    return [
      { Id: 'lib-movies', Name: 'Movies', Type: 'CollectionFolder', CollectionType: 'movies', ImageTags: { Primary: 'lib-movies' } },
      { Id: 'lib-shows', Name: 'Shows', Type: 'CollectionFolder', CollectionType: 'tvshows', ImageTags: { Primary: 'lib-shows' } },
      { Id: 'lib-docs', Name: 'Documentaries', Type: 'CollectionFolder', CollectionType: 'movies', ImageTags: { Primary: 'lib-docs' } },
    ];
  }

  async getItems(query: ItemQuery): Promise<Page> {
    let list = this.all;
    if (query.parentId === 'lib-movies') list = list.filter((i) => i.Type === 'Movie' && !i.Genres?.includes('Documentary'));
    else if (query.parentId === 'lib-docs') list = list.filter((i) => i.Genres?.includes('Documentary'));
    else if (query.parentId === 'lib-shows') list = list.filter((i) => i.Type === 'Series');
    if (query.includeItemTypes?.length) list = list.filter((i) => query.includeItemTypes!.includes(i.Type!));
    if (query.genres?.length) list = list.filter((i) => i.Genres?.some((g) => query.genres!.includes(g)));
    if (query.personIds?.length) list = list.filter((i) => i.People?.some((p) => query.personIds!.includes(p.Id!)));
    if (query.searchTerm) {
      const term = query.searchTerm.toLowerCase();
      list = list.filter((i) => i.Name?.toLowerCase().includes(term));
    }
    for (const filter of query.filters ?? []) {
      if (filter === 'IsResumable') list = list.filter((i) => (i.UserData?.PlaybackPositionTicks ?? 0) > 0);
      if (filter === 'IsFavorite') list = list.filter((i) => i.UserData?.IsFavorite);
      if (filter === 'IsUnplayed') list = list.filter((i) => !i.UserData?.Played);
    }

    const sort = query.sortBy?.[0];
    const direction = query.sortOrder === 'Descending' ? -1 : 1;
    const value = (item: Item): number | string => {
      if (sort === 'DateCreated') return item.DateCreated ?? '';
      if (sort === 'CommunityRating') return item.CommunityRating ?? 0;
      if (sort === 'ProductionYear' || sort === 'PremiereDate') return item.ProductionYear ?? 0;
      if (sort === 'DatePlayed') return item.UserData?.LastPlayedDate ?? '';
      if (sort === 'Random') return hash(item.Id!);
      return item.Name ?? '';
    };
    if (sort) list = [...list].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      const order = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'de') : x < y ? -1 : x > y ? 1 : 0;
      return order * direction;
    });

    const start = query.startIndex ?? 0;
    return { items: list.slice(start, start + (query.limit ?? list.length)).map((i) => this.clone(i)), total: list.length };
  }

  async getItem(id: string): Promise<Item> {
    const item = this.items.get(id);
    if (!item) throw new Error('This item was not found.');
    return this.clone(item);
  }

  async getResume(limit = 16, types: BaseItemKind[] = ['Movie', 'Episode']): Promise<Item[]> {
    return (await this.getItems({ includeItemTypes: types, filters: ['IsResumable'], sortBy: ['DatePlayed'], sortOrder: 'Descending', limit })).items;
  }

  async getNextUp(limit = 16, seriesId?: string, _withinDays = 0): Promise<Item[]> {
    const result: Item[] = [];
    for (const series of SERIES) {
      if (seriesId && series.id !== seriesId) continue;
      const episodes = this.all.filter((i) => i.Type === 'Episode' && i.SeriesId === series.id);
      const lastPlayed = episodes.reduce((last, ep, i) => (ep.UserData?.Played ? i : last), -1);
      if (lastPlayed >= 0 && episodes[lastPlayed + 1]) result.push(this.clone(episodes[lastPlayed + 1]));
    }
    return result.slice(0, limit);
  }

  async getSeasons(seriesId: string): Promise<Item[]> {
    return this.all.filter((i) => i.Type === 'Season' && i.SeriesId === seriesId).map((i) => this.clone(i));
  }

  async getEpisodes(seriesId: string, options: { seasonId?: string; startItemId?: string; limit?: number }): Promise<Item[]> {
    let list = this.all.filter((i) => i.Type === 'Episode' && i.SeriesId === seriesId);
    if (options.seasonId) list = list.filter((i) => i.SeasonId === options.seasonId);
    if (options.startItemId) list = list.slice(Math.max(0, list.findIndex((i) => i.Id === options.startItemId)));
    if (options.limit) list = list.slice(0, options.limit);
    return list.map((i) => this.clone(i));
  }

  async getSimilar(id: string, limit = 16): Promise<Item[]> {
    const source = this.items.get(id);
    return this.all
      .filter((i) => i.Id !== id && i.Type === source?.Type && i.Genres?.some((g) => source?.Genres?.includes(g)))
      .slice(0, limit)
      .map((i) => this.clone(i));
  }

  async getRecommendations(): Promise<Recommendation[]> {
    const baseline = this.items.get('m4')!;
    const similar = await this.getSimilar('m4');
    return similar.length ? [{ BaselineItemName: baseline.Name, RecommendationType: 'SimilarToRecentlyPlayed', CategoryId: 'm4', Items: similar }] : [];
  }

  async getGenres(types: BaseItemKind[], _parentId?: string, limit = 8): Promise<string[]> {
    const genres = new Set<string>();
    for (const item of this.all) if (types.includes(item.Type!)) item.Genres?.forEach((g) => genres.add(g));
    return [...genres].sort().slice(0, limit);
  }

  private patchUserData(id: string, data: Partial<NonNullable<Item['UserData']>>) {
    const item = this.items.get(id);
    if (item) item.UserData = { Key: '', ...item.UserData, ...data };
  }

  async setPlayed(id: string, played: boolean): Promise<void> {
    this.patchUserData(id, { Played: played, PlaybackPositionTicks: 0, PlayedPercentage: 0 });
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    this.patchUserData(id, { IsFavorite: favorite });
  }

  imageUrl(ref: ImageRef): string {
    const key = `${ref.itemId}:${ref.type}`;
    let uri = this.imageCache.get(key);
    if (!uri) {
      uri = toDataUri(this.renderImage(ref));
      this.imageCache.set(key, uri);
    }
    return uri;
  }

  private renderImage(ref: ImageRef): string {
    const item = this.items.get(ref.itemId);
    const isPerson = /^p\d+$/.test(ref.itemId);
    const name = item?.Name ?? (isPerson ? ref.tag ?? '?' : ({ 'lib-movies': 'Movies', 'lib-shows': 'Shows', 'lib-docs': 'Documentaries' } as Record<string, string>)[ref.itemId] ?? ref.itemId);

    if (ref.type === 'Logo') {
      const size = 150;
      const width = Math.max(600, name.length * size * 0.66);
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 220" width="${width}" height="220"><text x="0" y="170" ${FONT} font-weight="800" font-size="${size}" letter-spacing="-3" fill="#fff">${escapeXml(name)}</text></svg>`;
    }
    if (isPerson) {
      const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2);
      const seed = hash(ref.itemId);
      const hue = seed % 360;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 45%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 55% 22%)"/></linearGradient></defs><rect width="300" height="300" fill="url(#a)"/><text x="150" y="188" ${FONT} font-weight="600" font-size="110" fill="#fff" fill-opacity=".92" text-anchor="middle">${escapeXml(initials)}</text></svg>`;
    }

    const isSeasonOrEpisode = item?.Type === 'Episode';
    const portrait = ref.type === 'Primary' && !isSeasonOrEpisode;
    const [width, height] = portrait ? [600, 900] : [1920, 1080];
    const seed = ref.itemId.startsWith('s') && item?.SeriesId && !isSeasonOrEpisode ? item.SeriesId : ref.itemId;
    const text = portrait ? posterText(name, width, height) : ref.itemId.startsWith('lib-') ? `<text x="960" y="580" ${FONT} font-weight="700" font-size="150" fill="#fff" text-anchor="middle">${escapeXml(name)}</text>` : '';
    return scene(seed, width, height).replace('TEXT_SLOT', text);
  }

  userImageUrl(): string | null {
    return null;
  }

  async getPlayback(itemId: string, options: PlaybackOptions): Promise<PlaybackSession> {
    const item = this.items.get(itemId);
    const original = item?.MediaSources?.[0] ?? makeMediaSource(itemId, 2);
    const source: Source = { ...original, RunTimeTicks: DEMO_VIDEO_SECONDS * 10_000_000 };
    return {
      url: new URL('demo/demo.mp4', document.baseURI).href,
      isHls: false,
      method: options.forceTranscode ? 'Transcode' : 'DirectPlay',
      source,
      playSessionId: `demo-${Date.now()}`,
    };
  }

  mapStartSeconds(itemId: string, seconds: number): number {
    const runtime = (this.items.get(itemId)?.RunTimeTicks ?? 0) / 10_000_000;
    return runtime > 0 ? (seconds / runtime) * DEMO_VIDEO_SECONDS : 0;
  }

  async getSegments(): Promise<Segment[]> {
    return [{ Id: 'intro', Type: 'Intro', StartTicks: 5 * 10_000_000, EndTicks: 18 * 10_000_000 }];
  }

  async fetchSubtitleVtt(): Promise<string> {
    return DEMO_VTT;
  }

  subtitleUrl(): string {
    return '';
  }

  trickplayTileUrl(): string {
    return '';
  }

  private store(report: ProgressReport, finished = false) {
    const item = this.items.get(report.itemId);
    if (!item) return;
    // The demo file is only 2 minutes long. Progress is scaled to the runtime of the title.
    const ratio = report.positionTicks / (DEMO_VIDEO_SECONDS * 10_000_000);
    const nearEnd = ratio > 0.95;
    this.patchUserData(report.itemId, {
      PlaybackPositionTicks: nearEnd ? 0 : Math.round((item.RunTimeTicks ?? 0) * ratio),
      PlayedPercentage: nearEnd ? 0 : ratio * 100,
      LastPlayedDate: new Date().toISOString(),
      ...(finished && nearEnd ? { Played: true } : {}),
    });
  }

  async reportStart(): Promise<void> {}
  async reportProgress(report: ProgressReport): Promise<void> {
    this.store(report);
  }
  async reportStopped(report: ProgressReport): Promise<void> {
    this.store(report, true);
  }
  async signOut(): Promise<void> {}
}
