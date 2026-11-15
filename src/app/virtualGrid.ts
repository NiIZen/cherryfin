import type { Item } from '../api/types';
import type { SortKey } from './settings';

export const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** Buchstabe für die A–Z-Einordnung: Umlaute zählen zum Grundbuchstaben, alles andere zu "#". */
export function letterOf(item: Item): string {
  const name = (item.SortName || item.Name || '').trim();
  const first = name.normalize('NFD').replace(/\p{M}/gu, '').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

export function groupKeyFor(sort: SortKey): ((item: Item) => string) | null {
  if (sort === 'SortName') return letterOf;
  if (sort === 'ProductionYear') return (item) => (item.ProductionYear ? String(item.ProductionYear) : 'Ohne Jahr');
  return null;
}

/** Überschriften lohnen sich erst, wenn jede im Schnitt mindestens drei Titel gliedert. */
export function worthGrouping(items: Item[], groupKey: (item: Item) => string): boolean {
  return new Set(items.map(groupKey)).size * 3 <= items.length;
}

/** Index des ersten Titels je Buchstabe. */
export function letterStarts(items: Item[]): Map<string, number> {
  const starts = new Map<string, number>();
  items.forEach((item, index) => {
    const letter = letterOf(item);
    if (!starts.has(letter)) starts.set(letter, index);
  });
  return starts;
}

export interface VRow {
  kind: 'header' | 'items';
  key: string;
  label?: string;
  top: number;
  height: number;
  /** Titel-Indizes [start, end). Bei Überschriften der erste Titel der Gruppe. */
  start: number;
  end: number;
}

export interface LayoutOptions {
  columns: number;
  rowHeight: number;
  headerHeight: number;
  groupKey: ((item: Item) => string) | null;
}

export function layoutRows(items: Item[], options: LayoutOptions): { rows: VRow[]; height: number } {
  const { columns, rowHeight, headerHeight, groupKey } = options;
  const rows: VRow[] = [];
  let top = 0;
  let index = 0;
  while (index < items.length) {
    const group = groupKey ? groupKey(items[index]) : null;
    if (group !== null) {
      rows.push({ kind: 'header', key: `h-${index}`, label: group, top, height: headerHeight, start: index, end: index });
      top += headerHeight;
    }
    let groupEnd = index;
    if (group === null) groupEnd = items.length;
    else while (groupEnd < items.length && groupKey!(items[groupEnd]) === group) groupEnd++;

    while (index < groupEnd) {
      const end = Math.min(index + columns, groupEnd);
      rows.push({ kind: 'items', key: `r-${index}`, top, height: rowHeight, start: index, end });
      top += rowHeight;
      index = end;
    }
  }
  return { rows, height: top };
}

/** Index der ersten Reihe, deren Unterkante unter y liegt. */
function firstAtOrAfter(rows: VRow[], y: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (rows[mid].top + rows[mid].height <= y) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Bereich der Reihen [from, to], die den Ausschnitt [top, bottom] berühren. */
export function visibleRange(rows: VRow[], top: number, bottom: number): [number, number] {
  if (!rows.length) return [0, -1];
  const from = Math.min(firstAtOrAfter(rows, top), rows.length - 1);
  let to = from;
  while (to + 1 < rows.length && rows[to + 1].top < bottom) to++;
  return [from, to];
}

export function rowOfItem(rows: VRow[], index: number): number {
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (rows[mid].start <= index) low = mid;
    else high = mid - 1;
  }
  // Überschrift und erste Titelreihe haben denselben Startindex: Gemeint ist die Titelreihe.
  return low;
}
