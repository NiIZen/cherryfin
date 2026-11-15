import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ApiError, JellyfinClient, type Session } from '../api/jellyfin';
import { DemoClient } from '../api/demo';
import type { Item, ItemQuery, MediaClient } from '../api/types';
import { focusElement, focusFirstIn, initFocusEngine, pushInterceptor, setRootBack } from '../focus/engine';
import { isTV } from '../tv/platform';
import { AppContext, type AppContextValue, type NewRoute, type Route } from './context';
import { applyAppearance, type LibraryPrefs, type Settings, type SortKey } from './settings';
import { isFullscreen, loadSession, loadSettings, saveSession, saveSettings, setFullscreen } from './session';
import { ConnectScreen } from '../screens/Connect';
import { TabsRoot } from '../screens/Tabs';
import { DetailScreen } from '../screens/Detail';
import { Overview } from '../screens/Overview';
import { OfflineScreen } from '../screens/Offline';
import { PlayerScreen } from '../screens/Player';
import { ChevronLeft } from '../ui/Icons';
import { t } from '../i18n';

/** The size of the demo library can be raised through localStorage for testing. */
const makeDemo = () => new DemoClient(Number(localStorage.getItem('jellytv.demoExtra')) || undefined);

let routeCounter = 0;
const withKey = (route: NewRoute): Route => ({ ...route, key: `${route.kind}-${++routeCounter}` }) as Route;

/** "Show all" and people: the same overview, but adjustments only apply to this list. */
function GridRoute({ title, query, variant }: { title: string; query: ItemQuery; variant?: 'poster' | 'landscape' }) {
  const { sortBy, sortOrder, ...scope } = query;
  const sort = sortBy?.[0] as SortKey | undefined;
  const [initial] = useState<Partial<LibraryPrefs>>(() => ({
    ...(sort ? { sort, descending: sortOrder === 'Descending' } : {}),
    ...(variant ? { image: variant } : {}),
    view: 'overview',
    hero: false,
  }));
  return <Overview title={title} scope={scope} autoFocus initial={initial} />;
}

function Shell({ client, onSignOut }: { client: MediaClient; onSignOut: () => void }) {
  const [routes, setRoutes] = useState<Route[]>([{ kind: 'tabs', key: 'tabs' }]);
  const [dataVersion, setDataVersion] = useState(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const focusMemory = useRef(new Map<string, HTMLElement>());
  const previousLength = useRef(1);
  const routesRef = useRef(routes);
  routesRef.current = routes;

  const rememberFocus = () => {
    const top = routesRef.current.at(-1);
    const active = document.activeElement as HTMLElement | null;
    if (top && active && active !== document.body) focusMemory.current.set(top.key, active);
  };

  const push = useCallback((route: NewRoute) => {
    rememberFocus();
    setRoutes((list) => [...list, withKey(route)]);
  }, []);

  const pop = useCallback(() => {
    setRoutes((list) => (list.length > 1 ? list.slice(0, -1) : list));
  }, []);

  const replaceTop = useCallback((route: NewRoute) => {
    setRoutes((list) => [...list.slice(0, -1), withKey(route)]);
  }, []);

  // After going back, the focus lands where it was before.
  useLayoutEffect(() => {
    if (routes.length < previousLength.current) {
      const top = routes.at(-1)!;
      const remembered = focusMemory.current.get(top.key);
      if (remembered?.isConnected) focusElement(remembered, false);
      else focusFirstIn(document.querySelector(`[data-route="${top.key}"]`) ?? document);
    }
    previousLength.current = routes.length;
  }, [routes]);

  useEffect(() => pushInterceptor((command) => {
    if (command === 'back' && routesRef.current.length > 1) {
      pop();
      return true;
    }
    return false;
  }), [pop]);

  const bumpData = useCallback(() => setDataVersion((v) => v + 1), []);

  const [reloadEpoch, setReloadEpoch] = useState(0);
  const reload = useCallback(() => {
    client.cancelPending();
    setReloadEpoch((v) => v + 1);
    setDataVersion((v) => v + 1);
  }, [client]);

  /* Connection: a single error only counts once a check of the server fails too. */
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  const check = useRef<Promise<boolean> | null>(null);

  const verifyConnection = useCallback((): Promise<boolean> => {
    check.current ??= client.checkConnection().then((ok) => {
      check.current = null;
      if (ok && offlineRef.current) {
        offlineRef.current = false;
        setOffline(false);
        reload();
      } else if (!ok && !offlineRef.current) {
        offlineRef.current = true;
        setOffline(true);
        // Hanging requests release their connection instead of blocking until the timeout.
        client.cancelPending();
      }
      return ok;
    });
    return check.current;
  }, [client, reload]);

  useEffect(() => {
    client.onConnectionIssue = () => void verifyConnection();
    // A response proves the server is back. The message need not wait for the next check.
    client.onConnectionOk = () => {
      if (offlineRef.current) void verifyConnection();
    };
    const onNetworkChange = () => void verifyConnection();
    window.addEventListener('online', onNetworkChange);
    window.addEventListener('offline', onNetworkChange);
    void verifyConnection();
    return () => {
      client.onConnectionIssue = undefined;
      client.onConnectionOk = undefined;
      window.removeEventListener('online', onNetworkChange);
      window.removeEventListener('offline', onNetworkChange);
    };
  }, [client, verifyConnection]);

  useEffect(() => {
    const timer = setInterval(() => void verifyConnection(), offline ? 5_000 : 30_000);
    return () => clearInterval(timer);
  }, [offline, verifyConnection]);

  // F5 and Ctrl+R reload all data without losing the position in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F5' || (event.ctrlKey && event.key.toLowerCase() === 'r')) {
        event.preventDefault();
        void verifyConnection();
        reload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reload, verifyConnection]);

  const open = useCallback((item: Item) => {
    if (item.Type === 'Season' && item.SeriesId) {
      push({ kind: 'detail', id: item.SeriesId });
    } else if (item.Type === 'CollectionFolder' || item.Type === 'Folder' || item.Type === 'UserView') {
      push({ kind: 'grid', title: item.Name ?? t('Library'), query: { parentId: item.Id!, recursive: false, sortBy: ['SortName'] }, variant: 'poster' });
    } else {
      push({ kind: 'detail', id: item.Id! });
    }
  }, [push]);

  const play = useCallback(async (item: Item, options?: { fromStart?: boolean }) => {
    let target = item;
    if (item.Type === 'Series') {
      const next = await client.getNextUp(1, item.Id!);
      target = next[0] ?? (await client.getEpisodes(item.Id!, { limit: 1 }))[0];
      if (!target) return;
    } else if (item.Type === 'BoxSet') {
      open(item);
      return;
    }
    const startTicks = options?.fromStart ? 0 : target.UserData?.PlaybackPositionTicks ?? 0;
    // mpv gets its own window. The demo file sits inside the app archive, where mpv cannot reach it.
    const bridge = window.native?.player;
    if (bridge && !client.isDemo && settingsRef.current.playerBackend === 'mpv' && await bridge.available()) {
      const { audio, audioChannels, fullscreenPlayback, playback, subtitles } = settingsRef.current;
      const opened = await bridge.open({
        itemId: target.Id!,
        startTicks,
        fullscreen: fullscreenPlayback,
        audio: { ...audio, channels: audioChannels },
        video: { hardware: playback.hardwareDecoding, fit: playback.fit, bufferMb: playback.bufferMb, volume: playback.volume },
        subtitles,
      });
      if (opened) return;
    }
    push({ kind: 'player', item: target, startTicks });
  }, [client, open, push]);

  // After the film, progress and "Continue watching" are out of date.
  useEffect(() => window.native?.player?.onClosed(() => setDataVersion((v) => v + 1)), []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      if (patch.language && patch.language !== current.language) setTimeout(() => location.reload(), 0);
      return next;
    });
  }, []);

  useEffect(() => applyAppearance(settings), [settings]);

  const value = useMemo<AppContextValue>(() => ({
    client, dataVersion, bumpData, reloadEpoch, reload, push, pop, replaceTop, play, open, signOut: onSignOut, settings, updateSettings,
  }), [client, dataVersion, bumpData, reloadEpoch, reload, push, pop, replaceTop, play, open, onSignOut, settings, updateSettings]);

  return (
    <AppContext.Provider value={value}>
      {routes.map((route, index) => (
        <div key={route.key} className="route" data-route={route.key} hidden={index !== routes.length - 1}>
          {route.kind === 'tabs' && <TabsRoot />}
          {route.kind === 'detail' && <DetailScreen id={route.id} />}
          {route.kind === 'grid' && <GridRoute title={route.title} query={route.query} variant={route.variant} />}
          {route.kind === 'player' && <PlayerScreen item={route.item} startTicks={route.startTicks} />}
          {/* Mouse only: keyboard and gamepad have their own back key. */}
          {route.kind !== 'tabs' && (
            <button type="button" className="back-btn" tabIndex={-1} aria-label={t('Back')} onClick={pop}><ChevronLeft /></button>
          )}
        </div>
      ))}
      {/* The player reports problems itself, so video that is already loaded can keep playing. */}
      {offline && routes.at(-1)?.kind !== 'player' && (
        <OfflineScreen serverName={client.serverName} serverUrl={client.serverUrl} onRetry={verifyConnection} onSignOut={onSignOut} />
      )}
    </AppContext.Provider>
  );
}

export function App() {
  const [client, setClient] = useState<MediaClient | null>(null);
  const [booting, setBooting] = useState(true);
  const clientRef = useRef<MediaClient | null>(null);
  clientRef.current = client;

  useEffect(() => initFocusEngine(), []);

  // On the TV, Back on the top level leaves the app, like other TV apps.
  useEffect(() => {
    if (!isTV) return undefined;
    setRootBack(() => window.close());
    return () => setRootBack(null);
  }, []);

  // The sign-in page already shows the chosen appearance.
  useEffect(() => applyAppearance(loadSettings()), []);

  // F11 and F toggle full screen, as usual for a media player.
  useEffect(() => {
    const onKey = async (event: KeyboardEvent) => {
      const inInput = event.target instanceof HTMLInputElement;
      const isSearching = Boolean(document.querySelector('[data-search-active]'));
      if (event.key === 'F11' || (!inInput && !isSearching && event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.altKey)) {
        event.preventDefault();
        await setFullscreen(!(await isFullscreen()));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const signOut = useCallback(async () => {
    // Without a connection, signing out must not wait for the server.
    void clientRef.current?.signOut();
    await saveSession(null);
    setClient(null);
  }, []);

  const applySession = useCallback((session: Session) => {
    const next = new JellyfinClient(session);
    next.onUnauthorized = () => {
      void saveSession(null);
      setClient(null);
    };
    setClient(next);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (new URLSearchParams(location.search).has('demo')) {
        if (alive) setClient(makeDemo());
      } else {
        const session = await loadSession();
        if (session && alive) applySession(session);
      }
      if (alive) setBooting(false);
    })().catch((error) => {
      if (!(error instanceof ApiError)) console.error(error);
      if (alive) setBooting(false);
    });
    return () => {
      alive = false;
    };
  }, [applySession]);

  if (booting) return <div className="boot" />;

  return (
    <>
      <div className="drag-strip" />
      {client ? (
        <Shell key={client.user.Id} client={client} onSignOut={signOut} />
      ) : (
        <ConnectScreen
          onSession={async (session) => {
            await saveSession(session);
            applySession(session);
          }}
          onDemo={() => setClient(makeDemo())}
        />
      )}
    </>
  );
}
