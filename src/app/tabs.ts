import { useMemo } from 'react';
import type { BaseItemKind, Item } from '../api/types';
import { useApp, useData } from './context';

export interface LibraryTab {
  kind: 'library';
  id: string;
  label: string;
  types: BaseItemKind[];
  parentId?: string;
  genres?: string[];
}

const VIEW_TYPES: Record<string, BaseItemKind[]> = {
  movies: ['Movie'],
  tvshows: ['Series'],
  homevideos: ['Video'],
  musicvideos: ['MusicVideo'],
  boxsets: ['BoxSet'],
  // Gemischte Bibliotheken haben keinen CollectionType.
  '': ['Movie', 'Series', 'Video'],
  unknown: ['Movie', 'Series', 'Video'],
  folders: ['Movie', 'Series', 'Video'],
};

const DOCUMENTARY = /dokument|\bdoku|documentar/i;

/** Jede Video-Bibliothek wird ein eigener Bereich. Musik, Bücher, Fotos und Live-TV bleiben außen vor. */
export function buildLibraryTabs(views: Item[], options: { merge?: boolean; genres?: string[] } = {}): LibraryTab[] {
  const tabs: LibraryTab[] = [];
  if (options.merge) {
    if (views.some((v) => v.CollectionType === 'movies')) tabs.push({ kind: 'library', id: 'movies', label: 'Filme', types: ['Movie'] });
    if (views.some((v) => v.CollectionType === 'tvshows')) tabs.push({ kind: 'library', id: 'series', label: 'Serien', types: ['Series'] });
  }
  for (const view of views) {
    const type = view.CollectionType ?? '';
    if (options.merge && (type === 'movies' || type === 'tvshows')) continue;
    const types = VIEW_TYPES[type];
    if (types) tabs.push({ kind: 'library', id: view.Id!, label: view.Name ?? 'Mediathek', types, parentId: view.Id! });
  }

  // Liegen Dokumentationen in keiner eigenen Bibliothek, entsteht der Bereich aus dem Genre.
  const genres = (options.genres ?? []).filter((genre) => DOCUMENTARY.test(genre));
  if (genres.length && !tabs.some((tab) => DOCUMENTARY.test(tab.label))) {
    tabs.push({ kind: 'library', id: 'genre-documentary', label: 'Dokumentationen', types: ['Movie', 'Series'], genres });
  }
  return tabs;
}

/** Eigene Reihenfolge zuerst, neue Bereiche hängen sich hinten an. */
export function orderTabs<T extends { id: string }>(tabs: T[], order: string[]): T[] {
  const position = (id: string) => {
    const index = order.indexOf(id);
    return index < 0 ? order.length : index;
  };
  return tabs.map((tab, index) => ({ tab, index })).sort((a, b) => position(a.tab.id) - position(b.tab.id) || a.index - b.index).map(({ tab }) => tab);
}

export function useLibraryTabs() {
  const { client, settings } = useApp();
  const views = useData(() => client.getViews(), [client]);
  const genres = useData(() => client.getGenres(['Movie', 'Series'], undefined, 400).catch(() => []), [client]);
  const { merge, order, hidden } = settings.tabs;
  const all = useMemo(
    () => orderTabs(buildLibraryTabs(views.data ?? [], { merge, genres: genres.data ?? [] }), order),
    [views.data, genres.data, merge, order],
  );
  const visible = useMemo(() => all.filter((tab) => !hidden.includes(tab.id)), [all, hidden]);
  return { all, visible, loading: views.loading };
}
