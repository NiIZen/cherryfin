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

/** Points to exactly one image. Depending on the item it may belong to the show instead of the episode. */
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
  /** Rule out direct play, e.g. for another audio track or after a decoder error. */
  forceTranscode?: boolean;
  maxBitrate?: number;
  maxAudioChannels?: number;
  /** Playback with mpv: the player plays practically everything directly. */
  external?: boolean;
  /** TV only: play DTS directly. */
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

/** Shared interface of the real server and demo mode. */
export interface MediaClient {
  readonly isDemo: boolean;
  readonly serverName: string;
  readonly serverUrl: string;
  readonly user: User;
  /** Called when a request fails or hangs unusually long. */
  onConnectionIssue?: () => void;
  /** Called after every successful response. */
  onConnectionOk?: () => void;
  checkConnection(): Promise<boolean>;
  /** Cancels running requests so they do not block new ones. */
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
  /** Demo only: maps the title’s playback position onto the length of the demo clip. */
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
