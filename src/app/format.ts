import type { Item, Source, Stream, TrickplayInfo } from '../api/types';

export const TICKS_PER_SECOND = 10_000_000;

export function formatRuntime(ticks?: number | null): string {
  if (!ticks) return '';
  const minutes = Math.round(ticks / TICKS_PER_SECOND / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} Min.`;
  return minutes % 60 ? `${hours} Std. ${minutes % 60} Min.` : `${hours} Std.`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatEndTime(secondsLeft: number, now = new Date()): string {
  const end = new Date(now.getTime() + secondsLeft * 1000);
  return end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function episodeLabel(item: Item): string {
  if (item.Type !== 'Episode') return '';
  const season = item.ParentIndexNumber;
  const episode = item.IndexNumber;
  if (season == null && episode == null) return '';
  return [season != null ? `S${season}` : '', episode != null ? `F${episode}` : ''].filter(Boolean).join(', ');
}

export function typeLabel(item: Item): string {
  switch (item.Type) {
    case 'Movie': return 'Film';
    case 'Series': return 'Serie';
    case 'Episode': return 'Folge';
    case 'BoxSet': return 'Sammlung';
    case 'Season': return 'Staffel';
    case 'Video': return 'Video';
    case 'MusicVideo': return 'Musikvideo';
    default: return '';
  }
}

/** Metadatenzeile wie "Film · 2024 · Drama · 2 Std. 8 Min." */
export function metaLine(item: Item): string {
  const parts: string[] = [];
  const type = typeLabel(item);
  if (type && item.Type !== 'Episode') parts.push(type);
  if (item.ProductionYear) parts.push(String(item.ProductionYear));
  if (item.Genres?.length) parts.push(item.Genres.slice(0, 2).join(', '));
  if (item.Type === 'Series') {
    if (item.ChildCount) parts.push(item.ChildCount === 1 ? '1 Staffel' : `${item.ChildCount} Staffeln`);
  } else {
    const runtime = formatRuntime(item.RunTimeTicks);
    if (runtime) parts.push(runtime);
  }
  return parts.join(' · ');
}

/** Technik-Plaketten wie auf einer Apple-TV-Detailseite, aus den echten Stream-Daten abgeleitet. */
export function mediaBadges(item: Item): string[] {
  const badges: string[] = [];
  if (item.OfficialRating) badges.push(item.OfficialRating);
  const streams: Stream[] = item.MediaSources?.[0]?.MediaStreams ?? [];
  const video = streams.find((s) => s.Type === 'Video');
  if (video) {
    const width = video.Width ?? 0;
    const height = video.Height ?? 0;
    if (width >= 3200 || height >= 1800) badges.push('4K');
    else if (width >= 1200 || height >= 700) badges.push('HD');
    const range = video.VideoRangeType ?? '';
    if (range.includes('DOVI')) badges.push('Dolby Vision');
    else if (video.VideoRange === 'HDR') badges.push('HDR');
  }
  const audio = streams.filter((s) => s.Type === 'Audio');
  if (audio.some((s) => /atmos/i.test(s.DisplayTitle ?? '') || /atmos/i.test(s.Profile ?? ''))) badges.push('Dolby Atmos');
  else if (audio.some((s) => (s.Channels ?? 0) >= 8)) badges.push('7.1');
  else if (audio.some((s) => (s.Channels ?? 0) >= 6)) badges.push('5.1');
  if (streams.some((s) => s.Type === 'Subtitle')) badges.push('UT');
  return badges;
}

export function trackLabel(stream: Stream): string {
  return stream.DisplayTitle || stream.Title || stream.Language || `Spur ${stream.Index}`;
}

export function streamsOf(source: Source | undefined, type: 'Audio' | 'Subtitle'): Stream[] {
  return source?.MediaStreams?.filter((s) => s.Type === type) ?? [];
}

export interface TrickplayTile {
  sheet: number;
  column: number;
  row: number;
}

/** Findet in den Vorschau-Kacheln von Jellyfin das Bild zu einer Zeitposition. */
export function trickplayTile(info: TrickplayInfo, seconds: number): TrickplayTile {
  const interval = info.Interval || 10_000;
  const tileWidth = info.TileWidth || 10;
  const tileHeight = info.TileHeight || 10;
  const lastIndex = Math.max(0, (info.ThumbnailCount || 1) - 1);
  const index = Math.min(lastIndex, Math.max(0, Math.floor((seconds * 1000) / interval)));
  const perSheet = tileWidth * tileHeight;
  const inSheet = index % perSheet;
  return { sheet: Math.floor(index / perSheet), column: inSheet % tileWidth, row: Math.floor(inSheet / tileWidth) };
}
