import type { Item } from '../api/types';
import type { SortKey } from './settings';
import { t } from '../i18n';

export const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** Letter for the A–Z grouping: umlauts count as their base letter, everything else as "#". */
export function letterOf(item: Item): string {
  const name = (item.SortName || item.Name || '').trim();
  const first = name.normalize('NFD').replace(/\p{M}/gu, '').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

export function groupKeyFor(sort: SortKey): ((item: Item) => string) | null {
  if (sort === 'SortName') return letterOf;
  if (sort === 'ProductionYear') return (item) => (item.ProductionYear ? String(item.ProductionYear) : t('No year'));
  return null;
}

/** Headings are only worth it when each one groups at least three titles on average. */
export function worthGrouping(items: Item[], groupKey: (item: Item) => string): boolean {
  return new Set(items.map(groupKey)).size * 3 <= items.length;
}

/** Index of the first title per letter. */
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
  /** Title indices [start, end). For headings, the first title of the group. */
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

/** Index of the first row whose bottom edge is below y. */
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

/** Range of rows [from, to] that touch the viewport [top, bottom]. */
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
  // A heading and the first title row share a start index: the title row is meant.
  return low;
}
