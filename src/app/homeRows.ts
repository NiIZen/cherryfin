import type { Item } from '../api/types';

/** Resuming takes priority over "Next up", and each show appears only once. */
export function mergeContinue(resume: Item[], nextUp: Item[]): Item[] {
  const seenSeries = new Set(resume.map((item) => item.SeriesId).filter(Boolean));
  return [...resume, ...nextUp.filter((item) => !item.SeriesId || !seenSeries.has(item.SeriesId))];
}
