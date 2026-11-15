import { createContext, useContext, useEffect, useRef, useState, type DependencyList } from 'react';
import type { Item, ItemQuery, MediaClient } from '../api/types';
import { focusWhenReady } from '../focus/engine';
import type { Settings } from './settings';

export type Route =
  | { kind: 'tabs'; key: string }
  | { kind: 'detail'; key: string; id: string }
  | { kind: 'grid'; key: string; title: string; query: ItemQuery; variant?: 'poster' | 'landscape' }
  | { kind: 'player'; key: string; item: Item; startTicks: number };

export type NewRoute =
  | { kind: 'detail'; id: string }
  | { kind: 'grid'; title: string; query: ItemQuery; variant?: 'poster' | 'landscape' }
  | { kind: 'player'; item: Item; startTicks: number };

export interface AppContextValue {
  client: MediaClient;
  /** Steigt, wenn sich Wiedergabestand oder Favoriten geändert haben. Reihen laden dann neu. */
  dataVersion: number;
  bumpData: () => void;
  /** Steigt bei "Neu laden": Alle Screens holen ihre Daten erneut. */
  reloadEpoch: number;
  reload: () => void;
  push: (route: NewRoute) => void;
  pop: () => void;
  replaceTop: (route: NewRoute) => void;
  play: (item: Item, options?: { fromStart?: boolean }) => void;
  open: (item: Item) => void;
  signOut: () => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp außerhalb der App verwendet');
  return value;
}

/** Lädt Daten und behält beim Aktualisieren die alten, damit Reihen nicht flackern und der Fokus bleibt. */
export function useData<T>(load: () => Promise<T>, deps: DependencyList) {
  const epoch = useContext(AppContext)?.reloadEpoch ?? 0;
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    load().then(
      (data) => alive && setState({ data, loading: false }),
      (error) => alive && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => {
      alive = false;
    };
    // Die Abhängigkeiten übergibt der Aufrufer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, epoch]);
  return state;
}

/** Setzt den ersten Fokus, sobald der Inhalt eines Screens bereit ist. */
export function useInitialFocus(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const epoch = useContext(AppContext)?.reloadEpoch ?? 0;
  useEffect(() => {
    if (!ready || !ref.current || !ref.current.checkVisibility()) return undefined;
    // Nach einem erneuten Laden nur fokussieren, wenn gerade nichts den Fokus hat.
    const nothingFocused = !document.activeElement || document.activeElement === document.body;
    if (done.current && !nothingFocused) return undefined;
    done.current = true;
    return focusWhenReady(ref.current);
  }, [ready, epoch]);
  return ref;
}
