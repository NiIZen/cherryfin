import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, moveItem, prefsFor } from './app/settings';
import { layoutRows, letterOf, letterStarts, rowOfItem, visibleRange, worthGrouping } from './app/virtualGrid';
import { buildLibraryTabs, orderTabs } from './app/tabs';

describe('Settings', () => {
  it('fills missing values with the defaults', () => {
    const merged = mergeSettings({ fullscreenPlayback: false, appearance: { accent: 'blue' } });
    expect(merged.fullscreenPlayback).toBe(false);
    expect(merged.appearance.accent).toBe('blue');
    expect(merged.appearance.tilt).toBe(true);
    expect(merged.library.view).toBe('overview');
  });
  it('survives broken stored values', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps the order of the home screen and adds new rows', () => {
    const merged = mergeSettings({ home: { rows: [{ id: 'favorites', enabled: false }, { id: 'gibtsnicht', enabled: true }] } });
    expect(merged.home.rows[0]).toEqual({ id: 'favorites', enabled: false });
    expect(merged.home.rows.map((r) => r.id)).not.toContain('gibtsnicht');
    expect(merged.home.rows).toHaveLength(6);
  });
  it('applies adjustments of a section only there', () => {
    const settings = mergeSettings({ library: { size: 1 }, libraryOverrides: { filme: { layout: 'list' } } });
    expect(prefsFor(settings, 'filme')).toMatchObject({ layout: 'list', size: 1 });
    expect(prefsFor(settings, 'serien')).toMatchObject({ layout: 'grid', size: 1 });
  });
  it('moves entries and stops at the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('Sections', () => {
  const views = [
    { Id: '1', Name: 'Filme', CollectionType: 'movies' as const },
    { Id: '2', Name: 'Documentaries', CollectionType: 'movies' as const },
    { Id: '3', Name: 'Serien', CollectionType: 'tvshows' as const },
    { Id: '4', Name: 'Musik', CollectionType: 'music' as const },
    { Id: '5', Name: 'Gemischt' },
  ];

  it('turns every video library into a section and leaves out music', () => {
    expect(buildLibraryTabs(views).map((t) => t.label)).toEqual(['Filme', 'Documentaries', 'Serien', 'Gemischt']);
    expect(buildLibraryTabs(views)[1]).toMatchObject({ parentId: '2', types: ['Movie'] });
  });
  it('merges movies and shows on request', () => {
    expect(buildLibraryTabs(views, { merge: true }).map((t) => t.id)).toEqual(['movies', 'series', '5']);
  });
  it('builds documentaries from the genre when there is no library of their own', () => {
    const tabs = buildLibraryTabs([views[0]], { genres: ['Drama', 'Dokumentarfilm', 'Documentary'] });
    expect(tabs.at(-1)).toMatchObject({ label: 'Documentaries', genres: ['Dokumentarfilm', 'Documentary'] });
  });
  it('does not create a second documentaries section', () => {
    expect(buildLibraryTabs(views, { genres: ['Dokumentation'] }).filter((t) => /Dokument|Documentar/.test(t.label))).toHaveLength(1);
  });
  it('keeps the custom order and appends new entries', () => {
    const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'new' }];
    expect(orderTabs(tabs, ['c', 'a', 'b']).map((t) => t.id)).toEqual(['c', 'a', 'b', 'new']);
  });
});

describe('A–Z overview', () => {
  const named = (...names: string[]) => names.map((Name, i) => ({ Id: String(i), Name }));
  const options = { columns: 2, rowHeight: 100, headerHeight: 40, groupKey: letterOf };

  it('groups umlauts with their base letter and everything else under #', () => {
    expect(letterOf({ Name: 'Ärger' })).toBe('A');
    expect(letterOf({ Name: 'zeit' })).toBe('Z');
    expect(letterOf({ Name: '1984' })).toBe('#');
    expect(letterOf({ Name: '' })).toBe('#');
  });
  it('prefers the sort name from the server', () => {
    expect(letterOf({ Name: 'Der Pate', SortName: 'pate, der' })).toBe('P');
  });
  it('remembers the first title per letter', () => {
    const starts = letterStarts(named('Aal', 'Axt', 'Bär', 'Zoo'));
    expect(starts.get('A')).toBe(0);
    expect(starts.get('B')).toBe(2);
    expect(starts.has('C')).toBe(false);
  });
  it('skips headings when almost every title would need its own', () => {
    expect(worthGrouping(named('Atlas', 'Biene', 'Eis', 'Stadt', 'Zeit'), letterOf)).toBe(false);
    expect(worthGrouping(named('Aal', 'Axt', 'Arm', 'Bär', 'Biene', 'Berg'), letterOf)).toBe(true);
  });
  it('creates headings and rows without mixing groups', () => {
    const { rows, height } = layoutRows(named('Aal', 'Axt', 'Arm', 'Bär'), options);
    expect(rows.map((r) => `${r.kind}:${r.start}-${r.end}`)).toEqual(['header:0-0', 'items:0-2', 'items:2-3', 'header:3-3', 'items:3-4']);
    expect(height).toBe(40 + 100 + 100 + 40 + 100);
  });
  it('copes without grouping and without titles', () => {
    const { rows } = layoutRows(named('Aal', 'Bär', 'Zoo'), { ...options, groupKey: null });
    expect(rows.map((r) => r.end - r.start)).toEqual([2, 1]);
    expect(layoutRows([], options)).toEqual({ rows: [], height: 0 });
  });
  it('finds the visible rows', () => {
    const { rows } = layoutRows(named(...Array.from({ length: 100 }, (_, i) => `A${i}`)), { ...options, groupKey: null });
    expect(visibleRange(rows, 250, 450)).toEqual([2, 4]);
    expect(visibleRange(rows, -500, 50)).toEqual([0, 0]);
    expect(visibleRange([], 0, 100)).toEqual([0, -1]);
  });
  it('finds the row of a title, even right after a heading', () => {
    const { rows } = layoutRows(named('Aal', 'Axt', 'Arm', 'Bär'), options);
    expect(rows[rowOfItem(rows, 0)].kind).toBe('items');
    expect(rowOfItem(rows, 2)).toBe(2);
    expect(rows[rowOfItem(rows, 3)]).toMatchObject({ kind: 'items', start: 3 });
  });
});
