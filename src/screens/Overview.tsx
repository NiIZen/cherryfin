import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Item, ItemFilter, ItemQuery } from '../api/types';
import { posterRef } from '../api/images';
import { useApp, useData } from '../app/context';
import { formatRuntime } from '../app/format';
import { prefsFor, type LibraryPrefs, type SortKey } from '../app/settings';
import { ALPHABET, groupKeyFor, layoutRows, letterStarts, rowOfItem, visibleRange, worthGrouping } from '../app/virtualGrid';
import { animateScroll, focusElement, focusFirstIn, focusWhenReady, inputMode, pushInterceptor } from '../focus/engine';
import { Card, Picture, tiltHandlers } from '../ui/Card';
import { Hero } from '../ui/Hero';
import { CheckIcon, SlidersIcon } from '../ui/Icons';
import { RetryMessage } from '../ui/RetryMessage';
import { LibraryPrefRows, SORT_LABELS } from '../ui/SettingRows';
import { locale, t } from '../i18n';

const PAGE_SIZE = 500;
const POSTER_WIDTHS = [9.5, 11.5, 13.5, 16, 19];
const LANDSCAPE_WIDTHS = [16, 20, 23.75, 28, 34];
const LIST_HEIGHTS = [5, 6, 7.5, 9, 11];
const GRID_GAP = 1.75;
const ROW_GAP = 2.25;
const CAPTION = 3.5;
const HEADER = 4;

function ListEntry({ item, index, height, onSelect }: { item: Item; index: number; height: number; onSelect: () => void }) {
  const { client } = useApp();
  const ref = posterRef(item);
  const meta = [item.ProductionYear, item.Genres?.slice(0, 2).join(', '), item.Type === 'Series' ? null : formatRuntime(item.RunTimeTicks)].filter(Boolean).join(' · ');
  const percent = item.UserData?.PlayedPercentage ?? 0;
  return (
    <button type="button" className="list-entry" style={{ height: `${height}rem`, '--list-h': `${height}rem` } as CSSProperties} data-focusable data-index={index} aria-label={item.Name ?? undefined} onClick={onSelect} {...tiltHandlers()}>
      <div className="list-entry-thumb">
        <Picture src={ref ? client.imageUrl(ref, 240) : null} alt={item.Name ?? ''} />
        {percent > 0 && percent < 100 && <span className="card-progress"><span style={{ width: `${percent}%` }} /></span>}
      </div>
      <div className="list-entry-text">
        <div className="list-entry-title">{item.Name}</div>
        {meta && <div className="list-entry-meta">{meta}</div>}
        {item.Overview && <div className="list-entry-overview">{item.Overview}</div>}
      </div>
      {item.UserData?.Played && <span className="list-entry-check"><CheckIcon /></span>}
      {item.CommunityRating ? <span className="list-entry-rating">{item.CommunityRating.toFixed(1)}</span> : null}
    </button>
  );
}

interface OverviewProps {
  title: string;
  scope: ItemQuery;
  /** With a section ID, adjustments are saved; otherwise they only apply to this view. */
  tabId?: string;
  autoFocus?: boolean;
  initial?: Partial<LibraryPrefs>;
}

export function Overview({ title, scope, tabId, autoFocus, initial }: OverviewProps) {
  const { client, dataVersion, settings, updateSettings, open } = useApp();
  const [local, setLocal] = useState<Partial<LibraryPrefs>>(initial ?? {});
  const prefs = useMemo(() => ({ ...prefsFor(settings, tabId), ...local }), [settings, tabId, local]);

  const setPref = useCallback(<K extends keyof LibraryPrefs>(key: K, value: LibraryPrefs[K]) => {
    if (tabId) {
      updateSettings({ libraryOverrides: { ...settings.libraryOverrides, [tabId]: { ...settings.libraryOverrides[tabId], [key]: value } } });
    } else {
      setLocal((current) => ({ ...current, [key]: value }));
    }
  }, [settings.libraryOverrides, tabId, updateSettings]);

  const resetPrefs = () => {
    setLocal({});
    if (tabId) {
      const { [tabId]: _removed, ...rest } = settings.libraryOverrides;
      updateSettings({ libraryOverrides: rest });
    }
  };

  /* ---------- Data: load everything page by page; display starts with the first page ---------- */

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const page = useRef<HTMLDivElement>(null);
  const loadKey = useRef('');

  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    let alive = true;
    const filters: ItemFilter[] = [...(scope.filters ?? []), ...(prefs.unwatched ? (['IsUnplayed'] as const) : [])];
    const key = `${scopeKey}|${prefs.sort}|${prefs.descending}|${prefs.unwatched}`;
    const isRefresh = loadKey.current === key;
    loadKey.current = key;

    (async () => {
      const collected: Item[] = [];
      for (let start = 0; ; start += PAGE_SIZE) {
        const result = await client.getItems({
          ...scope,
          filters,
          sortBy: prefs.sort === 'SortName' ? ['SortName'] : [prefs.sort, 'SortName'],
          sortOrder: prefs.descending ? 'Descending' : 'Ascending',
          startIndex: start,
          limit: PAGE_SIZE,
        });
        if (!alive) return;
        collected.push(...result.items);
        setTotal(result.total);
        // When refreshing, swap only at the end so the list does not shrink for a moment.
        if (!isRefresh) setItems([...collected]);
        if (start === 0 && !isRefresh) setLoaded(true);
        if (!result.items.length || collected.length >= result.total) break;
      }
      if (isRefresh) setItems(collected);
      setLoaded(true);
      setError('');
    })().catch((e: Error) => {
      if (alive) {
        setError(e.message);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
    // scope is covered by scopeKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, scopeKey, prefs.sort, prefs.descending, prefs.unwatched, dataVersion]);

  // A new sort order starts at the top.
  useEffect(() => {
    if (page.current) page.current.scrollTop = 0;
  }, [prefs.sort, prefs.descending, prefs.unwatched]);

  /* ---------- Layout: only the visible rows are rendered ---------- */

  const grid = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, rem: 16 });

  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return undefined;
    const measure = () => {
      // A hidden section measures 0. The last layout is kept then.
      if (!el.clientWidth) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      setBox((old) => (old.width === el.clientWidth && old.rem === rem ? old : { width: el.clientWidth, rem }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [settings.appearance.scale]);

  const isList = prefs.layout === 'list';
  const size = Math.max(0, Math.min(4, prefs.size));
  const { columns, cellHeight } = useMemo(() => {
    const { width, rem } = box;
    if (isList) return { columns: 1, cellHeight: (LIST_HEIGHTS[size] + 1) * rem };
    const target = (prefs.image === 'poster' ? POSTER_WIDTHS : LANDSCAPE_WIDTHS)[size] * rem;
    const gap = GRID_GAP * rem;
    const count = Math.max(1, Math.floor((width + gap) / (target + gap)));
    const cardWidth = (width - gap * (count - 1)) / count;
    const image = prefs.image === 'poster' ? cardWidth * 1.5 : (cardWidth * 9) / 16;
    return { columns: count, cellHeight: image + ROW_GAP * rem + (prefs.labels === 'off' ? 0 : CAPTION * rem) };
  }, [box, isList, prefs.image, prefs.labels, size]);

  const { rows, height } = useMemo(() => {
    const groupKey = prefs.group ? groupKeyFor(prefs.sort) : null;
    return layoutRows(items, {
      columns,
      rowHeight: cellHeight,
      headerHeight: HEADER * box.rem,
      groupKey: groupKey && worthGrouping(items, groupKey) ? groupKey : null,
    });
  }, [items, columns, cellHeight, box.rem, prefs.group, prefs.sort]);

  const [range, setRange] = useState<[number, number]>([0, 12]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const updateRange = useCallback(() => {
    const scroller = page.current;
    const el = grid.current;
    if (!scroller || !el || !scroller.clientHeight) return;
    const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const overscan = scroller.clientHeight * 0.75;
    const [from, to] = visibleRange(rows, -offset - overscan, -offset + scroller.clientHeight + overscan);
    setRange((old) => (old[0] === from && old[1] === to ? old : [from, to]));
  }, [rows]);

  useLayoutEffect(updateRange, [updateRange]);

  // The focused row always stays in the DOM, even when scrolling lags behind a held key.
  const rendered = useMemo(() => {
    const set = new Set<number>();
    for (let i = range[0]; i <= range[1] && i < rows.length; i++) set.add(i);
    if (focusIndex !== null && rows.length) {
      const row = rowOfItem(rows, focusIndex);
      for (let i = Math.max(0, row - 2); i <= Math.min(rows.length - 1, row + 2); i++) set.add(i);
    }
    return [...set].sort((a, b) => a - b).map((i) => rows[i]);
  }, [range, rows, focusIndex]);

  // After a layout change (window size, column count), put the focus back on the same title.
  useLayoutEffect(() => {
    if (focusIndex === null || document.activeElement !== document.body) return;
    grid.current?.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`)?.focus({ preventScroll: true });
    // Only on a new layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  /* ---------- A–Z bar ---------- */

  const isAlpha = prefs.sort === 'SortName';
  const showRail = isAlpha && prefs.rail && items.length > 0;
  const starts = useMemo(() => (isAlpha ? letterStarts(items) : new Map<string, number>()), [isAlpha, items]);
  const pendingFocus = useRef<number | null>(null);

  const scrollToLetter = (letter: string) => {
    const index = starts.get(letter);
    const scroller = page.current;
    const el = grid.current;
    if (index === undefined || !scroller || !el) return;
    const row = rows[rowOfItem(rows, index)];
    // If a heading sits right before it, bring it into view too.
    const above = rows.find((candidate) => candidate.kind === 'header' && candidate.start === index);
    const top = (above ?? row).top;
    const gridTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    animateScroll(scroller, { top: Math.max(0, gridTop + top - box.rem * 2) });
  };

  const jumpInto = (letter: string) => {
    const index = starts.get(letter);
    if (index === undefined) return;
    scrollToLetter(letter);
    pendingFocus.current = index;
    setFocusIndex(index);
  };

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const target = grid.current?.querySelector<HTMLElement>(`[data-index="${pendingFocus.current}"]`);
    if (target) {
      focusElement(target, false);
      pendingFocus.current = null;
    }
  }, [focusIndex, rendered]);

  /* ---------- View menu ---------- */

  const [panel, setPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelButton = useRef<HTMLButtonElement>(null);
  const closePanel = useCallback(() => {
    setPanel(false);
    requestAnimationFrame(() => panelButton.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!panel) return undefined;
    if (panelRef.current) focusFirstIn(panelRef.current);
    return pushInterceptor((command) => {
      if (command === 'back') {
        closePanel();
        return true;
      }
      return false;
    });
  }, [panel, closePanel]);

  useEffect(() => {
    if (!autoFocus || !loaded || !page.current) return undefined;
    return focusWhenReady(grid.current?.querySelector('[data-focusable]') ? grid.current : page.current);
    // Only on the first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, loaded, box.width]);

  const hero = useData(
    () => (prefs.hero ? client.getItems({ ...scope, sortBy: ['Random'], limit: 6, hasBackdrop: true }).then((p) => p.items) : Promise.resolve([])),
    [client, scopeKey, prefs.hero],
  );

  const sortKeys = Object.keys(SORT_LABELS) as SortKey[];
  const hasOwnPrefs = tabId ? Boolean(settings.libraryOverrides[tabId]) : Object.keys(local).length > 0;

  return (
    <div className={`overview ${showRail ? 'has-rail' : ''}`}>
      <div className="page" data-vscroll ref={page} onScroll={updateRange}>
        {prefs.hero && hero.data && hero.data.length > 0 && <Hero items={hero.data} />}
        <header className={`overview-head ${prefs.hero && hero.data?.length ? 'after-hero' : ''}`} data-section="top">
          <div className="overview-title">
            <h1>{title}</h1>
            {loaded && <span>{total === 1 ? t('1 title') : t('{count} titles', { count: total.toLocaleString(locale()) })}</span>}
          </div>
          <div className="pill-row" data-focus-group>
            {sortKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={`pill ${prefs.sort === key ? 'selected' : ''}`}
                data-focusable
                aria-pressed={prefs.sort === key}
                onClick={() => {
                  // Pressing again reverses the direction. A new sort starts sensibly: A–Z ascending, otherwise newest first.
                  if (prefs.sort === key) setPref('descending', !prefs.descending);
                  else if (tabId) updateSettings({ libraryOverrides: { ...settings.libraryOverrides, [tabId]: { ...settings.libraryOverrides[tabId], sort: key, descending: key !== 'SortName' } } });
                  else setLocal((current) => ({ ...current, sort: key, descending: key !== 'SortName' }));
                }}
              >
                {SORT_LABELS[key]}{prefs.sort === key && <i className="sort-arrow">{prefs.descending ? '↓' : '↑'}</i>}
              </button>
            ))}
            <span className="pill-divider" />
            <button type="button" className={`pill ${prefs.unwatched ? 'selected' : ''}`} data-focusable aria-pressed={prefs.unwatched} onClick={() => setPref('unwatched', !prefs.unwatched)}>
              {t('Unwatched')}
            </button>
            <span className="pill-divider" />
            <button type="button" className="pill pill-icon" ref={panelButton} data-focusable data-view-button aria-expanded={panel} onClick={() => setPanel(true)}>
              <SlidersIcon /> {t('View')}
            </button>
          </div>
        </header>

        {error && <RetryMessage title={t('Loading failed')} message={error} />}
        {loaded && !error && items.length === 0 && <div className="screen-message"><p>{t('Nothing to see here.')}</p></div>}

        <div
          className={`vgrid ${isList ? 'vgrid-list' : ''}`}
          ref={grid}
          data-labels={prefs.labels}
          style={{ height }}
          onFocusCapture={(event) => {
            const value = (event.target as HTMLElement).dataset?.index;
            if (value !== undefined) setFocusIndex(Number(value));
          }}
        >
          {rendered.map((row) => {
            if (row.kind === 'header') {
              return <h2 key={row.key} className="vgrid-header" style={{ top: row.top, height: row.height }}>{row.label}</h2>;
            }
            return (
              <div
                key={row.key}
                className="vrow"
                style={{ top: row.top, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, height: row.height }}
              >
                {items.slice(row.start, row.end).map((item, offset) => (
                  isList
                    ? <ListEntry key={item.Id} item={item} index={row.start + offset} height={LIST_HEIGHTS[size]} onSelect={() => open(item)} />
                    : <Card key={item.Id} item={item} variant={prefs.image} index={row.start + offset} onSelect={open} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {showRail && (
        <nav className="alpha-rail" aria-label={t('Jump to letter')} data-focus-group>
          {ALPHABET.map((letter) => {
            const available = starts.has(letter);
            return (
              <button
                key={letter}
                type="button"
                className="alpha-key"
                disabled={!available}
                data-focusable={available ? '' : undefined}
                data-letter={letter}
                onFocus={() => {
                  if (inputMode() === 'keyboard') scrollToLetter(letter);
                }}
                onClick={() => jumpInto(letter)}
              >
                {letter}
              </button>
            );
          })}
        </nav>
      )}

      {panel && (
        <>
          <div className="view-panel-backdrop" onClick={closePanel} />
          <aside className="view-panel" ref={panelRef} data-focus-scope role="dialog" aria-label={`${t('View')}: ${title}`}>
            <h2>{t('View')}</h2>
            <p>{tabId ? t('Only applies to “{name}”.', { name: title }) : t('Only applies to this list.')}</p>
            <LibraryPrefRows prefs={prefs} onChange={setPref} />
            {hasOwnPrefs && (
              <button type="button" className="list-row danger" data-focusable onClick={resetPrefs}>
                <span className="list-row-title">{t('Reset to default')}</span>
              </button>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
