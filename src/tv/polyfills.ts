/*
 * Ergänzt, was ältere webOS-Engines (ab Chromium 68) nicht kennen. Moderne Syntax übersetzt der Build,
 * fehlende Funktionen müssen hier nachgerüstet werden. Bereits vorhandene bleiben unangetastet.
 */
/* eslint-disable no-extend-native */

const define = (target: object, name: string, value: unknown) => {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true });
};

const at = function at<T>(this: ArrayLike<T>, index: number): T | undefined {
  const i = Math.trunc(index) || 0;
  return this[i < 0 ? this.length + i : i];
};
define(Array.prototype, 'at', at);
define(String.prototype, 'at', at);

define(Array.prototype, 'flat', function flat(this: unknown[], depth = 1): unknown[] {
  return this.reduce<unknown[]>((all, value) => all.concat(depth > 0 && Array.isArray(value) ? (value as unknown[] & { flat(d: number): unknown[] }).flat(depth - 1) : [value]), []);
});
define(Array.prototype, 'flatMap', function flatMap(this: unknown[], fn: (value: unknown, index: number, list: unknown[]) => unknown): unknown[] {
  return this.map(fn).reduce<unknown[]>((all, value) => all.concat(value), []);
});

define(Object, 'fromEntries', (entries: Iterable<[string, unknown]>) => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of entries) result[key] = value;
  return result;
});

define(String.prototype, 'replaceAll', function replaceAll(this: string, search: string | RegExp, replacement: string): string {
  return search instanceof RegExp ? this.replace(search, replacement) : this.split(search).join(replacement);
});

define(Promise, 'allSettled', (promises: Array<Promise<unknown>>) =>
  Promise.all(promises.map((promise) => Promise.resolve(promise).then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason }),
  ))));

if (typeof globalThis === 'undefined') {
  (window as unknown as { globalThis: Window }).globalThis = window;
}

define(window, 'queueMicrotask', (callback: () => void) => {
  void Promise.resolve().then(callback);
});

if (typeof crypto !== 'undefined') {
  // file:// gilt nicht als sicherer Kontext. Für eine Geräte-ID reicht das hier: Sie ist kein Geheimnis.
  define(crypto, 'randomUUID', () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
    const value = Number(c);
    return (value ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (value / 4)))).toString(16);
  }));
}

define(Element.prototype, 'checkVisibility', function checkVisibility(this: Element, options?: { visibilityProperty?: boolean }): boolean {
  if (this.getClientRects().length === 0) return false;
  return !options?.visibilityProperty || getComputedStyle(this).visibility === 'visible';
});

define(AbortSignal, 'timeout', (ms: number) => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
});

define(AbortSignal, 'any', (signals: AbortSignal[]) => {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
});

/** Abstände in Flex-Containern kann Chromium erst ab Version 84. Die Stylesheet-Regel braucht dafür ein Signal. */
export function markMissingFeatures() {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  box.appendChild(document.createElement('div'));
  box.appendChild(document.createElement('div'));
  document.documentElement.appendChild(box);
  if (box.scrollHeight !== 1) document.documentElement.classList.add('no-flex-gap');
  box.remove();
}
