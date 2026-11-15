import { useCallback, useEffect, useMemo, useState } from 'react';
import { JellyfinClient } from '../api/jellyfin';
import type { Item, MediaClient } from '../api/types';
import { initFocusEngine } from '../focus/engine';
import { PlayerScreen } from '../screens/Player';
import { ChevronLeft } from '../ui/Icons';
import { AppContext, type AppContextValue, type NewRoute } from './context';
import { isFullscreen, loadSession, loadSettings, setFullscreen } from './session';
import { applyAppearance } from './settings';

interface Current {
  key: number;
  item: Item;
  startTicks: number;
}

/**
 * Inhalt des transparenten Fensters über dem mpv-Video. Es läuft als eigene Seite, daher
 * braucht es nur den Player und eine eigene Verbindung zum Server.
 */
export function PlayerWindow() {
  const [client, setClient] = useState<MediaClient | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [settings] = useState(loadSettings);
  const close = useCallback(() => void window.native?.player.close(), []);

  useEffect(() => {
    document.documentElement.classList.add('player-window');
    applyAppearance(settings);
    return initFocusEngine();
  }, [settings]);

  useEffect(() => {
    const onKey = async (event: KeyboardEvent) => {
      if (event.key === 'F11' || (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.altKey)) {
        event.preventDefault();
        await setFullscreen(!(await isFullscreen()));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [params, session] = await Promise.all([window.native!.player.params(), loadSession()]);
      if (!params || !session) throw new Error('Keine Sitzung');
      const next = new JellyfinClient(session);
      next.onUnauthorized = close;
      const item = await next.getItem(params.itemId);
      if (alive) {
        setClient(next);
        setCurrent({ key: 1, item, startTicks: params.startTicks });
      }
    })().catch(close);
    return () => {
      alive = false;
    };
  }, [close]);

  const replaceTop = useCallback((route: NewRoute) => {
    if (route.kind === 'player') setCurrent((old) => ({ key: (old?.key ?? 0) + 1, item: route.item, startTicks: route.startTicks }));
  }, []);

  const value = useMemo<AppContextValue | null>(() => client && ({
    client,
    dataVersion: 0,
    bumpData: () => undefined,
    reloadEpoch: 0,
    reload: () => undefined,
    push: () => undefined,
    pop: close,
    replaceTop,
    play: () => undefined,
    open: () => undefined,
    signOut: close,
    settings,
    updateSettings: () => undefined,
  }), [client, close, replaceTop, settings]);

  if (!value || !current) return null;

  return (
    <AppContext.Provider value={value}>
      <div className="drag-strip" />
      <div className="route">
        <PlayerScreen key={current.key} item={current.item} startTicks={current.startTicks} external />
        <button type="button" className="back-btn" tabIndex={-1} aria-label="Zurück" onClick={close}><ChevronLeft /></button>
      </div>
    </AppContext.Provider>
  );
}
