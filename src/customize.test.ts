import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, moveItem, prefsFor } from './app/settings';
import { layoutRows, letterOf, letterStarts, rowOfItem, visibleRange, worthGrouping } from './app/virtualGrid';
import { buildLibraryTabs, orderTabs } from './app/tabs';

describe('Einstellungen', () => {
  it('füllt fehlende Werte mit dem Standard auf', () => {
    const merged = mergeSettings({ fullscreenPlayback: false, appearance: { accent: 'blue' } });
    expect(merged.fullscreenPlayback).toBe(false);
    expect(merged.appearance.accent).toBe('blue');
    expect(merged.appearance.tilt).toBe(true);
    expect(merged.library.view).toBe('overview');
  });
  it('übersteht kaputte gespeicherte Werte', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings('Unsinn')).toEqual(DEFAULT_SETTINGS);
  });
  it('behält die Reihenfolge der Startseite und ergänzt neue Reihen', () => {
    const merged = mergeSettings({ home: { rows: [{ id: 'favorites', enabled: false }, { id: 'gibtsnicht', enabled: true }] } });
    expect(merged.home.rows[0]).toEqual({ id: 'favorites', enabled: false });
    expect(merged.home.rows.map((r) => r.id)).not.toContain('gibtsnicht');
    expect(merged.home.rows).toHaveLength(6);
  });
  it('lässt Anpassungen eines Bereichs nur dort gelten', () => {
    const settings = mergeSettings({ library: { size: 1 }, libraryOverrides: { filme: { layout: 'list' } } });
    expect(prefsFor(settings, 'filme')).toMatchObject({ layout: 'list', size: 1 });
    expect(prefsFor(settings, 'serien')).toMatchObject({ layout: 'grid', size: 1 });
  });
  it('verschiebt Einträge und bleibt an den Rändern stehen', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('Bereiche', () => {
  const views = [
    { Id: '1', Name: 'Filme', CollectionType: 'movies' as const },
    { Id: '2', Name: 'Dokumentationen', CollectionType: 'movies' as const },
    { Id: '3', Name: 'Serien', CollectionType: 'tvshows' as const },
    { Id: '4', Name: 'Musik', CollectionType: 'music' as const },
    { Id: '5', Name: 'Gemischt' },
  ];

  it('macht aus jeder Video-Bibliothek einen Bereich und lässt Musik weg', () => {
    expect(buildLibraryTabs(views).map((t) => t.label)).toEqual(['Filme', 'Dokumentationen', 'Serien', 'Gemischt']);
    expect(buildLibraryTabs(views)[1]).toMatchObject({ parentId: '2', types: ['Movie'] });
  });
  it('legt auf Wunsch Filme und Serien zusammen', () => {
    expect(buildLibraryTabs(views, { merge: true }).map((t) => t.id)).toEqual(['movies', 'series', '5']);
  });
  it('baut Dokumentationen aus dem Genre, wenn es keine eigene Bibliothek gibt', () => {
    const tabs = buildLibraryTabs([views[0]], { genres: ['Drama', 'Dokumentarfilm', 'Documentary'] });
    expect(tabs.at(-1)).toMatchObject({ label: 'Dokumentationen', genres: ['Dokumentarfilm', 'Documentary'] });
  });
  it('legt keinen zweiten Dokumentations-Bereich an', () => {
    expect(buildLibraryTabs(views, { genres: ['Dokumentation'] }).filter((t) => /Dokument/.test(t.label))).toHaveLength(1);
  });
  it('hält sich an die eigene Reihenfolge und hängt Neues hinten an', () => {
    const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'neu' }];
    expect(orderTabs(tabs, ['c', 'a', 'b']).map((t) => t.id)).toEqual(['c', 'a', 'b', 'neu']);
  });
});

describe('A–Z-Übersicht', () => {
  const named = (...names: string[]) => names.map((Name, i) => ({ Id: String(i), Name }));
  const options = { columns: 2, rowHeight: 100, headerHeight: 40, groupKey: letterOf };

  it('ordnet Umlaute dem Grundbuchstaben zu und Sonstiges dem #', () => {
    expect(letterOf({ Name: 'Ärger' })).toBe('A');
    expect(letterOf({ Name: 'zeit' })).toBe('Z');
    expect(letterOf({ Name: '1984' })).toBe('#');
    expect(letterOf({ Name: '' })).toBe('#');
  });
  it('bevorzugt den Sortiernamen des Servers', () => {
    expect(letterOf({ Name: 'Der Pate', SortName: 'pate, der' })).toBe('P');
  });
  it('merkt sich den ersten Titel je Buchstabe', () => {
    const starts = letterStarts(named('Aal', 'Axt', 'Bär', 'Zoo'));
    expect(starts.get('A')).toBe(0);
    expect(starts.get('B')).toBe(2);
    expect(starts.has('C')).toBe(false);
  });
  it('spart sich Überschriften, wenn fast jeder Titel eine eigene bräuchte', () => {
    expect(worthGrouping(named('Atlas', 'Biene', 'Eis', 'Stadt', 'Zeit'), letterOf)).toBe(false);
    expect(worthGrouping(named('Aal', 'Axt', 'Arm', 'Bär', 'Biene', 'Berg'), letterOf)).toBe(true);
  });
  it('legt Überschriften und Reihen an, ohne Gruppen zu mischen', () => {
    const { rows, height } = layoutRows(named('Aal', 'Axt', 'Arm', 'Bär'), options);
    expect(rows.map((r) => `${r.kind}:${r.start}-${r.end}`)).toEqual(['header:0-0', 'items:0-2', 'items:2-3', 'header:3-3', 'items:3-4']);
    expect(height).toBe(40 + 100 + 100 + 40 + 100);
  });
  it('kommt ohne Gruppierung und ohne Titel zurecht', () => {
    const { rows } = layoutRows(named('Aal', 'Bär', 'Zoo'), { ...options, groupKey: null });
    expect(rows.map((r) => r.end - r.start)).toEqual([2, 1]);
    expect(layoutRows([], options)).toEqual({ rows: [], height: 0 });
  });
  it('findet die sichtbaren Reihen', () => {
    const { rows } = layoutRows(named(...Array.from({ length: 100 }, (_, i) => `A${i}`)), { ...options, groupKey: null });
    expect(visibleRange(rows, 250, 450)).toEqual([2, 4]);
    expect(visibleRange(rows, -500, 50)).toEqual([0, 0]);
    expect(visibleRange([], 0, 100)).toEqual([0, -1]);
  });
  it('findet die Reihe eines Titels, auch direkt nach einer Überschrift', () => {
    const { rows } = layoutRows(named('Aal', 'Axt', 'Arm', 'Bär'), options);
    expect(rows[rowOfItem(rows, 0)].kind).toBe('items');
    expect(rowOfItem(rows, 2)).toBe(2);
    expect(rows[rowOfItem(rows, 3)]).toMatchObject({ kind: 'items', start: 3 });
  });
});
