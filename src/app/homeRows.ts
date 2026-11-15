import type { Item } from '../api/types';

/** Fortsetzen hat Vorrang vor "Nächste Folge", und jede Serie erscheint nur einmal. */
export function mergeContinue(resume: Item[], nextUp: Item[]): Item[] {
  const seenSeries = new Set(resume.map((item) => item.SeriesId).filter(Boolean));
  return [...resume, ...nextUp.filter((item) => !item.SeriesId || !seenSeries.has(item.SeriesId))];
}
