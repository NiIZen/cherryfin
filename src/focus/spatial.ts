export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Scores a possible focus move; smaller is better. null means unreachable.
 * Sideways, the focus stays in its own line. At the end of a row it does not jump into
 * another row but triggers the small "bump" effect.
 */
export function scoreMove(from: Box, to: Box, dir: Dir): number | null {
  const fromX = (from.left + from.right) / 2;
  const fromY = (from.top + from.bottom) / 2;
  const toX = (to.left + to.right) / 2;
  const toY = (to.top + to.bottom) / 2;

  if (dir === 'left' || dir === 'right') {
    const forward = dir === 'right' ? toX - fromX : fromX - toX;
    if (forward <= 1) return null;
    const overlap = Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);
    if (overlap <= 0) return null;
    const gap = dir === 'right' ? to.left - from.right : from.left - to.right;
    return Math.max(gap, 0) + Math.abs(toY - fromY) * 0.5;
  }

  const forward = dir === 'down' ? toY - fromY : fromY - toY;
  if (forward <= 1) return null;
  const gap = dir === 'down' ? to.top - from.bottom : from.top - to.bottom;
  const overlap = Math.min(from.right, to.right) - Math.max(from.left, to.left);
  const sideways = overlap > 0 ? 0 : -overlap;
  return Math.max(gap, 0) * 2 + sideways * 2 + Math.abs(toX - fromX) * 0.25;
}

/** Index of the best candidate, or -1. */
export function pickBest(from: Box, boxes: Box[], dir: Dir): number {
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((box, index) => {
    const score = scoreMove(from, box, dir);
    if (score !== null && score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/** Scroll target so an element is fully visible with a peek at the next one. */
export function revealOffset(current: number, viewSize: number, start: number, end: number, padding: number, peek: number, maxScroll: number): number {
  let target = current;
  if (start - padding < current) target = start - padding;
  else if (end + padding + peek > current + viewSize) target = end + padding + peek - viewSize;
  return Math.max(0, Math.min(target, maxScroll));
}
