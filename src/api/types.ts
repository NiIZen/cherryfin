import type {
  BaseItemDto,
  BaseItemKind,
  ItemFields,
  ItemFilter,
  ItemSortBy,
  MediaSegmentDto,
  MediaSourceInfo,
  MediaStream,
  RecommendationDto,
  TrickplayInfoDto,
  UserDto,
} from '@jellyfin/sdk/lib/generated-client/models';

export type Item = BaseItemDto;
export type Source = MediaSourceInfo;
export type Stream = MediaStream;
export type User = UserDto;
export type Segment = MediaSegmentDto;
export type Recommendation = RecommendationDto;
export type TrickplayInfo = TrickplayInfoDto;
export type { BaseItemKind, ItemFields, ItemFilter, ItemSortBy };

export type ImageType = 'Primary' | 'Backdrop' | 'Logo' | 'Thumb';

/** Zeigt auf genau ein Bild. Je nach Eintrag gehört es z. B. der Serie statt der Episode. */
export interface ImageRef {
  itemId: string;
  type: ImageType;
  tag?: string | null;
  index?: number;
}

export interface ItemQuery {
  parentId?: string;
  includeItemTypes?: BaseItemKind[];
  sortBy?: ItemSortBy[];
  sortOrder?: 'Ascending' | 'Descending';
  limit?: number;
  startIndex?: number;
  genres?: string[];
  personIds?: string[];
  searchTerm?: string;
  filters?: ItemFilter[];
  recursive?: boolean;
  fields?: ItemFields[];
  hasBackdrop?: boolean;
}

export interface Page {
  items: Item[];
  total: number;
}

export interface PlaybackOptions {
  mediaSourceId?: string;
  audioIndex?: number;
  subtitleIndex?: number;
  /** Direct Play ausschließen, etwa bei anderer Audiospur oder nach einem Decoder-Fehler. */
  forceTranscode?: boolean;
  maxBitrate?: number;
  maxAudioChannels?: number;
  /** Wiedergabe mit mpv: Der Player spielt praktisch alles direkt ab. */
  external?: boolean;
  /** Nur Fernseher: DTS direkt abspielen. */
  dts?: boolean;
}

export type PlayMethod = 'DirectPlay' | 'Transcode';

export interface PlaybackSession {
  url: string;
  isHls: boolean;
  method: PlayMethod;
  source: Source;
  playSessionId: string;
}

export interface ProgressReport {
  itemId: string;
  session: PlaybackSession;
  positionTicks: number;
  isPaused: boolean;
  audioIndex?: number;
  subtitleIndex?: number;
}

/** Gemeinsame Schnittstelle von echtem Server und Demo-Modus. */
export interface MediaClient {
  readonly isDemo: boolean;
  readonly serverName: string;
  readonly serverUrl: string;
  readonly user: User;
  /** Wird gerufen, wenn eine Anfrage scheitert oder ungewöhnlich lange hängt. */
  onConnectionIssue?: () => void;
  /** Wird nach jeder erfolgreichen Antwort gerufen. */
  onConnectionOk?: () => void;
  checkConnection(): Promise<boolean>;
  /** Bricht laufende Anfragen ab, damit sie neue nicht blockieren. */
  cancelPending(): void;

  getViews(): Promise<Item[]>;
  getItems(query: ItemQuery): Promise<Page>;
  getItem(id: string): Promise<Item>;
  getResume(limit?: number, types?: BaseItemKind[]): Promise<Item[]>;
  getNextUp(limit?: number, seriesId?: string, withinDays?: number): Promise<Item[]>;
  getSeasons(seriesId: string): Promise<Item[]>;
  getEpisodes(seriesId: string, options: { seasonId?: string; startItemId?: string; limit?: number }): Promise<Item[]>;
  getSimilar(id: string, limit?: number): Promise<Item[]>;
  getRecommendations(): Promise<Recommendation[]>;
  getGenres(types: BaseItemKind[], parentId?: string, limit?: number): Promise<string[]>;

  setPlayed(id: string, played: boolean): Promise<void>;
  setFavorite(id: string, favorite: boolean): Promise<void>;

  imageUrl(ref: ImageRef, width: number): string;
  userImageUrl(user: User, width: number): string | null;

  getPlayback(itemId: string, options: PlaybackOptions): Promise<PlaybackSession>;
  /** Nur Demo: rechnet den Wiedergabestand des Titels auf die Länge des Demo-Clips um. */
  mapStartSeconds?(itemId: string, seconds: number): number;
  getSegments(itemId: string): Promise<Segment[]>;
  fetchSubtitleVtt(itemId: string, source: Source, index: number): Promise<string>;
  subtitleUrl(itemId: string, source: Source, stream: Stream): string;
  trickplayTileUrl(itemId: string, width: number, sheet: number, mediaSourceId: string): string;

  reportStart(report: ProgressReport): Promise<void>;
  reportProgress(report: ProgressReport): Promise<void>;
  reportStopped(report: ProgressReport): Promise<void>;
  signOut(): Promise<void>;
}
