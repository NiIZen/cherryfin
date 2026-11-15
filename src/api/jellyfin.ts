import type {
  BaseItemKind,
  ImageRef,
  Item,
  ItemFields,
  ItemQuery,
  MediaClient,
  Page,
  PlaybackOptions,
  PlaybackSession,
  ProgressReport,
  Recommendation,
  Segment,
  Source,
  Stream,
  User,
} from './types';
import { buildDeviceProfile, buildExternalPlayerProfile, buildWebOSProfile } from './profile';
import { isTV } from '../tv/platform';

const CLIENT_NAME = 'Cherryfin';
const CLIENT_VERSION = '0.6.1';
/** Danach gilt eine Anfrage als gescheitert. Große Seiten dürfen dauern, hängen darf nichts ewig. */
const REQUEST_TIMEOUT_MS = 30_000;
/** Antwortet der Server so lange nicht, wird nebenbei seine Erreichbarkeit geprüft. */
const SLOW_REQUEST_MS = 6_000;
const PING_TIMEOUT_MS = 4_000;
const TICKS_PER_SECOND = 10_000_000;

/** Felder für Karten und Hero-Bereich. */
const LIST_FIELDS: ItemFields[] = ['Overview', 'Genres', 'DateCreated', 'PrimaryImageAspectRatio', 'SortName'];
/** Felder für Detailseite und Player. */
const DETAIL_FIELDS: ItemFields[] = [...LIST_FIELDS, 'People', 'Studios', 'Taglines', 'MediaSources', 'MediaStreams', 'Trickplay', 'Chapters', 'ExternalUrls'];

export interface Session {
  serverUrl: string;
  serverName: string;
  token: string;
  user: User;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function deviceId(): string {
  const key = 'jellytv.deviceId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function authHeader(id: string, token?: string): string {
  const parts = [`Client="${CLIENT_NAME}"`, `Device="Windows"`, `DeviceId="${id}"`, `Version="${CLIENT_VERSION}"`];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

/** Baut die Adressen, die für eine Eingabe wie "nas", "nas:8096" oder "https://jf.example" in Frage kommen. */
export function serverCandidates(input: string): string[] {
  const raw = input.trim().replace(/\/+$/, '');
  if (!raw) return [];
  if (/^https?:\/\//i.test(raw)) return [raw];
  const hasPort = /:\d+($|\/)/.test(raw);
  return hasPort ? [`http://${raw}`, `https://${raw}`] : [`http://${raw}:8096`, `https://${raw}`, `http://${raw}`];
}

export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** Wählt die Wiedergabeart aus der Antwort von /PlaybackInfo. */
export function chooseStream(
  serverUrl: string,
  token: string,
  itemId: string,
  source: Source,
  forceTranscode: boolean,
  useExtension = false,
): { url: string; isHls: boolean; method: PlaybackSession['method'] } {
  if (source.SupportsDirectPlay && !forceTranscode) {
    const query = buildQuery({ static: true, mediaSourceId: source.Id, api_key: token });
    // Der Medienplayer des Fernsehers erkennt das Format an der Endung.
    const extension = useExtension && source.Container ? `.${source.Container.split(',')[0]}` : '';
    return { url: `${serverUrl}/Videos/${itemId}/stream${extension}${query}`, isHls: false, method: 'DirectPlay' };
  }
  if (source.TranscodingUrl) {
    return { url: `${serverUrl}${source.TranscodingUrl}`, isHls: true, method: 'Transcode' };
  }
  throw new Error('Der Server bietet für dieses Medium keinen abspielbaren Stream an.');
}

export async function probeServer(baseUrl: string): Promise<{ url: string; name: string; version: string }> {
  const response = await fetch(`${baseUrl}/System/Info/Public`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new ApiError(response.status, `Server antwortet mit ${response.status}`);
  const info = await response.json();
  if (!info?.Id) throw new Error('Das ist kein Jellyfin-Server.');
  return { url: baseUrl, name: info.ServerName ?? 'Jellyfin', version: info.Version ?? '' };
}

/** Probiert alle Kandidaten nacheinander und gibt den ersten erreichbaren Server zurück. */
export async function findServer(input: string) {
  let lastError: unknown = new Error('Bitte gib eine Serveradresse ein.');
  for (const candidate of serverCandidates(input)) {
    try {
      return await probeServer(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function getPublicUsers(serverUrl: string): Promise<User[]> {
  try {
    const response = await fetch(`${serverUrl}/Users/Public`, { headers: { Authorization: authHeader(deviceId()) } });
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

export async function signIn(serverUrl: string, serverName: string, username: string, password: string): Promise<Session> {
  const response = await fetch(`${serverUrl}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { Authorization: authHeader(deviceId()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  if (response.status === 401) throw new ApiError(401, 'Benutzername oder Passwort ist falsch.');
  if (!response.ok) throw new ApiError(response.status, `Anmeldung fehlgeschlagen (${response.status}).`);
  const result = await response.json();
  return { serverUrl, serverName, token: result.AccessToken, user: result.User };
}

export function publicUserImage(serverUrl: string, user: User, width: number): string | null {
  if (!user.PrimaryImageTag) return null;
  return `${serverUrl}/Users/${user.Id}/Images/Primary${buildQuery({ fillWidth: width, quality: 90, tag: user.PrimaryImageTag })}`;
}

export class JellyfinClient implements MediaClient {
  readonly isDemo = false;
  readonly serverName: string;
  readonly serverUrl: string;
  readonly user: User;
  private readonly token: string;
  private readonly userId: string;
  private readonly device = deviceId();
  private readonly pending = new Set<AbortController>();
  /** Wird bei einem abgelaufenen Token aufgerufen, damit die App zur Anmeldung zurückkehrt. */
  onUnauthorized?: () => void;
  onConnectionIssue?: () => void;
  onConnectionOk?: () => void;

  constructor(session: Session) {
    this.serverName = session.serverName;
    this.serverUrl = session.serverUrl;
    this.user = session.user;
    this.token = session.token;
    this.userId = session.user.Id!;
  }

  private async request<T>(path: string, init: { method?: string; query?: Record<string, unknown>; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
    const watchdog = setTimeout(() => this.onConnectionIssue?.(), SLOW_REQUEST_MS);
    const cancel = new AbortController();
    // Nur Lesezugriffe lassen sich gefahrlos abbrechen. Meldungen an den Server sollen ankommen.
    if ((init.method ?? 'GET') === 'GET') this.pending.add(cancel);
    let response: Response;
    try {
      response = await fetch(`${this.serverUrl}${path}${buildQuery(init.query ?? {})}`, {
        method: init.method ?? 'GET',
        // Ältere webOS-Engines verweigern keepalive zusammen mit dem Anmelde-Header. Die Meldung
        // ginge dann verloren. Auf dem Fernseher läuft die App danach ohnehin weiter.
        keepalive: init.keepalive && !isTV,
        // Der Browser-Cache würde gleiche URLs hintereinanderstellen: Eine neue Anfrage
        // müsste auf eine hängende warten, auch wenn der Server längst wieder antwortet.
        cache: 'no-store',
        signal: AbortSignal.any([cancel.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        headers: {
          Authorization: authHeader(this.device, this.token),
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch {
      if (cancel.signal.aborted) throw new ApiError(0, 'Die Anfrage wurde abgebrochen.');
      this.onConnectionIssue?.();
      throw new ApiError(0, 'Der Server ist nicht erreichbar.');
    } finally {
      clearTimeout(watchdog);
      this.pending.delete(cancel);
    }
    this.onConnectionOk?.();
    if (response.status === 401) {
      this.onUnauthorized?.();
      throw new ApiError(401, 'Die Anmeldung ist abgelaufen.');
    }
    if (!response.ok) throw new ApiError(response.status, `Serverfehler ${response.status} bei ${path}`);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  cancelPending(): void {
    for (const cancel of this.pending) cancel.abort();
    this.pending.clear();
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/System/Info/Public`, { cache: 'no-store', signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getViews(): Promise<Item[]> {
    const result = await this.request<{ Items?: Item[] }>('/UserViews', { query: { userId: this.userId } });
    return result.Items ?? [];
  }

  async getItems(query: ItemQuery): Promise<Page> {
    const result = await this.request<{ Items?: Item[]; TotalRecordCount?: number }>('/Items', {
      query: {
        userId: this.userId,
        parentId: query.parentId,
        includeItemTypes: query.includeItemTypes,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        limit: query.limit,
        startIndex: query.startIndex,
        genres: query.genres?.join('|'),
        personIds: query.personIds,
        searchTerm: query.searchTerm,
        filters: query.filters,
        recursive: query.recursive ?? true,
        fields: query.fields ?? LIST_FIELDS,
        hasBackdrop: query.hasBackdrop,
        enableTotalRecordCount: true,
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Backdrop', 'Logo', 'Thumb'],
      },
    });
    return { items: result.Items ?? [], total: result.TotalRecordCount ?? 0 };
  }

  async getItem(id: string): Promise<Item> {
    const result = await this.request<{ Items?: Item[] }>('/Items', {
      query: { userId: this.userId, ids: id, fields: DETAIL_FIELDS, enableImageTypes: ['Primary', 'Backdrop', 'Logo', 'Thumb'] },
    });
    const item = result.Items?.[0];
    if (!item) throw new ApiError(404, 'Dieser Eintrag wurde nicht gefunden.');
    return item;
  }

  async getResume(limit = 16, types: BaseItemKind[] = ['Movie', 'Episode']): Promise<Item[]> {
    const page = await this.getItems({
      includeItemTypes: types,
      filters: ['IsResumable'],
      sortBy: ['DatePlayed'],
      sortOrder: 'Descending',
      limit,
    });
    return page.items;
  }

  async getNextUp(limit = 16, seriesId?: string, withinDays = 0): Promise<Item[]> {
    const result = await this.request<{ Items?: Item[] }>('/Shows/NextUp', {
      query: {
        userId: this.userId,
        limit,
        seriesId,
        fields: LIST_FIELDS,
        enableResumable: false,
        enableRewatching: false,
        nextUpDateCutoff: withinDays > 0 ? new Date(Date.now() - withinDays * 86_400_000).toISOString() : undefined,
      },
    });
    return result.Items ?? [];
  }

  async getSeasons(seriesId: string): Promise<Item[]> {
    const result = await this.request<{ Items?: Item[] }>(`/Shows/${seriesId}/Seasons`, { query: { userId: this.userId, fields: LIST_FIELDS } });
    return result.Items ?? [];
  }

  async getEpisodes(seriesId: string, options: { seasonId?: string; startItemId?: string; limit?: number }): Promise<Item[]> {
    const result = await this.request<{ Items?: Item[] }>(`/Shows/${seriesId}/Episodes`, {
      query: { userId: this.userId, fields: LIST_FIELDS, seasonId: options.seasonId, startItemId: options.startItemId, limit: options.limit },
    });
    return result.Items ?? [];
  }

  async getSimilar(id: string, limit = 16): Promise<Item[]> {
    const result = await this.request<{ Items?: Item[] }>(`/Items/${id}/Similar`, { query: { userId: this.userId, limit, fields: LIST_FIELDS } });
    return result.Items ?? [];
  }

  getRecommendations(): Promise<Recommendation[]> {
    return this.request<Recommendation[]>('/Movies/Recommendations', {
      query: { userId: this.userId, categoryLimit: 3, itemLimit: 16, fields: LIST_FIELDS },
    });
  }

  async getGenres(types: BaseItemKind[], parentId?: string, limit = 8): Promise<string[]> {
    const result = await this.request<{ Items?: Item[] }>('/Genres', {
      query: { userId: this.userId, includeItemTypes: types, parentId, limit, sortBy: ['SortName'] },
    });
    return (result.Items ?? []).map((genre) => genre.Name!).filter(Boolean);
  }

  async setPlayed(id: string, played: boolean): Promise<void> {
    await this.request(`/UserPlayedItems/${id}`, { method: played ? 'POST' : 'DELETE', query: { userId: this.userId } });
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    await this.request(`/UserFavoriteItems/${id}`, { method: favorite ? 'POST' : 'DELETE', query: { userId: this.userId } });
  }

  imageUrl(ref: ImageRef, width: number): string {
    const index = ref.index !== undefined ? `/${ref.index}` : '';
    return `${this.serverUrl}/Items/${ref.itemId}/Images/${ref.type}${index}${buildQuery({ fillWidth: width, quality: 90, tag: ref.tag })}`;
  }

  userImageUrl(user: User, width: number): string | null {
    return publicUserImage(this.serverUrl, user, width);
  }

  async getPlayback(itemId: string, options: PlaybackOptions): Promise<PlaybackSession> {
    const maxBitrate = options.maxBitrate ?? 120_000_000;
    const info = await this.request<{ MediaSources?: Source[]; PlaySessionId?: string; ErrorCode?: string }>(`/Items/${itemId}/PlaybackInfo`, {
      method: 'POST',
      query: { userId: this.userId },
      body: {
        UserId: this.userId,
        MaxStreamingBitrate: maxBitrate,
        MaxAudioChannels: options.maxAudioChannels,
        MediaSourceId: options.mediaSourceId,
        AudioStreamIndex: options.audioIndex,
        SubtitleStreamIndex: options.subtitleIndex,
        DeviceProfile: options.external
          ? buildExternalPlayerProfile(maxBitrate, options.maxAudioChannels === 2 ? 2 : 8)
          : isTV
            ? buildWebOSProfile(maxBitrate, options.maxAudioChannels, options.dts)
            : buildDeviceProfile(maxBitrate, undefined, options.maxAudioChannels),
        AutoOpenLiveStream: true,
        EnableDirectPlay: !options.forceTranscode,
        EnableDirectStream: !options.forceTranscode,
        EnableTranscoding: true,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true,
        // StartTimeTicks bleibt bewusst leer: Der Player setzt die Startposition selbst,
        // damit die HLS-Zeitachse immer beim Filmanfang beginnt.
      },
    });
    if (info.ErrorCode) throw new Error(`Der Server lehnt die Wiedergabe ab (${info.ErrorCode}).`);
    const sources = info.MediaSources ?? [];
    const source = sources.find((s) => s.Id === options.mediaSourceId) ?? sources[0];
    if (!source) throw new Error('Für diesen Eintrag gibt es keine Mediendatei.');
    return {
      ...chooseStream(this.serverUrl, this.token, itemId, source, Boolean(options.forceTranscode), isTV),
      source,
      playSessionId: info.PlaySessionId ?? '',
    };
  }

  async getSegments(itemId: string): Promise<Segment[]> {
    try {
      const result = await this.request<{ Items?: Segment[] }>(`/MediaSegments/${itemId}`);
      return result.Items ?? [];
    } catch {
      return []; // Vor Jellyfin 10.10 gibt es diesen Endpunkt nicht.
    }
  }

  async fetchSubtitleVtt(itemId: string, source: Source, index: number): Promise<string> {
    const response = await fetch(`${this.serverUrl}/Videos/${itemId}/${source.Id}/Subtitles/${index}/0/Stream.vtt`, {
      headers: { Authorization: authHeader(this.device, this.token) },
    });
    if (!response.ok) throw new ApiError(response.status, 'Untertitel konnten nicht geladen werden.');
    return response.text();
  }

  subtitleUrl(itemId: string, source: Source, stream: Stream): string {
    const format = stream.Codec === 'ass' || stream.Codec === 'ssa' ? 'ass' : 'srt';
    return `${this.serverUrl}/Videos/${itemId}/${source.Id}/Subtitles/${stream.Index}/0/Stream.${format}${buildQuery({ api_key: this.token })}`;
  }

  trickplayTileUrl(itemId: string, width: number, sheet: number, mediaSourceId: string): string {
    return `${this.serverUrl}/Videos/${itemId}/Trickplay/${width}/${sheet}.jpg${buildQuery({ mediaSourceId, api_key: this.token })}`;
  }

  private progressBody(report: ProgressReport) {
    return {
      ItemId: report.itemId,
      MediaSourceId: report.session.source.Id,
      PlaySessionId: report.session.playSessionId,
      PositionTicks: report.positionTicks,
      IsPaused: report.isPaused,
      IsMuted: false,
      CanSeek: true,
      PlayMethod: report.session.method,
      AudioStreamIndex: report.audioIndex,
      SubtitleStreamIndex: report.subtitleIndex,
      RepeatMode: 'RepeatNone',
    };
  }

  async reportStart(report: ProgressReport): Promise<void> {
    await this.request('/Sessions/Playing', { method: 'POST', body: this.progressBody(report) });
  }

  async reportProgress(report: ProgressReport): Promise<void> {
    await this.request('/Sessions/Playing/Progress', { method: 'POST', body: this.progressBody(report) });
  }

  async reportStopped(report: ProgressReport): Promise<void> {
    await this.request('/Sessions/Playing/Stopped', { method: 'POST', keepalive: true, body: this.progressBody(report) });
  }

  async signOut(): Promise<void> {
    await this.request('/Sessions/Logout', { method: 'POST' }).catch(() => undefined);
  }
}
