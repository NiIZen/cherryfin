import { useMemo } from 'react';
import type { BaseItemKind, Item } from '../api/types';
import { useApp, useData } from './context';
import { t } from '../i18n';

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
  // Mixed libraries have no CollectionType.
  '': ['Movie', 'Series', 'Video'],
  unknown: ['Movie', 'Series', 'Video'],
  folders: ['Movie', 'Series', 'Video'],
};

const DOCUMENTARY = /dokument|\bdoku|documentar/i;

/** Every video library becomes its own section. Music, books, photos and live TV are left out. */
export function buildLibraryTabs(views: Item[], options: { merge?: boolean; genres?: string[] } = {}): LibraryTab[] {
  const tabs: LibraryTab[] = [];
  if (options.merge) {
    if (views.some((v) => v.CollectionType === 'movies')) tabs.push({ kind: 'library', id: 'movies', label: t('Movies'), types: ['Movie'] });
    if (views.some((v) => v.CollectionType === 'tvshows')) tabs.push({ kind: 'library', id: 'series', label: t('Shows'), types: ['Series'] });
  }
  for (const view of views) {
    const type = view.CollectionType ?? '';
    if (options.merge && (type === 'movies' || type === 'tvshows')) continue;
    const types = VIEW_TYPES[type];
    if (types) tabs.push({ kind: 'library', id: view.Id!, label: view.Name ?? t('Library'), types, parentId: view.Id! });
  }

  // If documentaries have no library of their own, the section is built from the genre.
  const genres = (options.genres ?? []).filter((genre) => DOCUMENTARY.test(genre));
  if (genres.length && !tabs.some((tab) => DOCUMENTARY.test(tab.label))) {
    tabs.push({ kind: 'library', id: 'genre-documentary', label: t('Documentaries'), types: ['Movie', 'Series'], genres });
  }
  return tabs;
}

/** Custom order first; new sections are appended at the end. */
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
