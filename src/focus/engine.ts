import { pickBest, revealOffset, type Box, type Dir } from './spatial';

export type Command = Dir | 'select' | 'back' | 'playpause' | 'play' | 'pause' | 'stop' | 'forward' | 'rewind';
export type Interceptor = (command: Command) => boolean;

const FOCUSABLE = '[data-focusable]';
const interceptors: Interceptor[] = [];
const groupMemory = new WeakMap<Element, HTMLElement>();

/** Der zuletzt registrierte Interceptor bekommt jedes Kommando zuerst. */
export function pushInterceptor(fn: Interceptor): () => void {
  interceptors.push(fn);
  return () => {
    const index = interceptors.lastIndexOf(fn);
    if (index >= 0) interceptors.splice(index, 1);
  };
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && el.checkVisibility({ visibilityProperty: true });
}

function activeScope(): ParentNode {
  const scopes = [...document.querySelectorAll<HTMLElement>('[data-focus-scope]')].filter(isVisible);
  return scopes.at(-1) ?? document;
}

function candidates(): HTMLElement[] {
  return [...activeScope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

function rememberFocus(el: HTMLElement) {
  const group = el.closest('[data-focus-group]');
  if (group) groupMemory.set(group, el);
}

export function focusElement(el: HTMLElement, reveal = true) {
  el.focus({ preventScroll: true });
  rememberFocus(el);
  if (reveal) revealElement(el);
}

/** Fokussiert data-autofocus oder das erste fokussierbare Element im Container. */
export function focusFirstIn(container: ParentNode, reveal = false): boolean {
  const list = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
  const target = list.find((el) => el.hasAttribute('data-autofocus')) ?? list[0];
  if (!target) return false;
  focusElement(target, reveal);
  return true;
}

/**
 * Wie focusFirstIn, versucht es aber erneut, solange noch nichts fokussierbar ist
 * (z. B. kurz nach dem Start, wenn das Fenster noch nicht angezeigt wird).
 * Gibt eine Funktion zum Abbrechen zurück.
 */
export function focusWhenReady(container: ParentNode): () => void {
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = () => {
    // Hat inzwischen jemand anderes den Fokus gesetzt, bleibt er dort.
    const active = document.activeElement;
    if (active && active !== document.body && container.contains(active)) return;
    const scope = activeScope();
    const blocked = scope !== document && !scope.contains(container as Node) && !container.contains(scope as Node);
    if (!blocked && focusFirstIn(container) && document.activeElement !== document.body) return;
    if (++tries < 40) timer = setTimeout(attempt, 100);
  };
  attempt();
  return () => clearTimeout(timer);
}

function bump(el: HTMLElement, dir: Dir) {
  const className = `bump-${dir}`;
  el.classList.remove(className);
  void el.offsetWidth; // Startet die Animation bei wiederholtem Anstoßen neu.
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), 260);
}

function move(dir: Dir) {
  const current = document.activeElement as HTMLElement | null;
  const list = candidates();
  if (!current || !current.matches(FOCUSABLE) || !isVisible(current)) {
    const first = list.find((el) => el.hasAttribute('data-autofocus')) ?? list[0];
    if (first) focusElement(first);
    return;
  }

  const others = list.filter((el) => el !== current);
  // Elemente wie die feste Tab-Leiste sind nur Ausweichziel, sonst überspringen sie die Reihen darüber.
  const regular = others.filter((el) => !el.hasAttribute('data-focus-fallback'));
  const from = current.getBoundingClientRect() as Box;

  let next: HTMLElement | undefined;
  for (const pool of [regular, others]) {
    const best = pickBest(from, pool.map((el) => el.getBoundingClientRect()), dir);
    if (best >= 0) {
      next = pool[best];
      break;
    }
  }

  if (!next) {
    const edge = new CustomEvent('focus-edge', { bubbles: true, cancelable: true, detail: dir });
    if (current.dispatchEvent(edge)) bump(current, dir);
    return;
  }

  // Beim Wechsel in eine andere Reihe landet man dort, wo man sie zuletzt verlassen hat.
  const nextGroup = next.closest('[data-focus-group]');
  if (nextGroup && nextGroup !== current.closest('[data-focus-group]') && (dir === 'up' || dir === 'down')) {
    const remembered = groupMemory.get(nextGroup);
    if (remembered?.isConnected && isVisible(remembered)) next = remembered;
  }
  focusElement(next);
}

let rootBack: (() => void) | null = null;

/** Was passiert, wenn "Zurück" nirgends mehr gebraucht wird: Auf dem Fernseher schließt das die App. */
export function setRootBack(handler: (() => void) | null) {
  rootBack = handler;
}

export function dispatchCommand(command: Command) {
  setInputMode('keyboard');
  for (let i = interceptors.length - 1; i >= 0; i--) {
    if (interceptors[i](command)) return;
  }
  if (command === 'back') rootBack?.();
  if (command === 'up' || command === 'down' || command === 'left' || command === 'right') {
    move(command);
  } else if (command === 'select' || command === 'playpause') {
    const el = document.activeElement as HTMLElement | null;
    if (el?.matches(FOCUSABLE)) {
      el.classList.add('pressed');
      setTimeout(() => el.classList.remove('pressed'), 140);
      el.click();
    }
  }
}

/* ---------- Sanftes Scrollen, das auch schnelle Tastenwiederholung mitgeht ---------- */

interface Animation {
  top: number;
  left: number;
  frame: number;
}
const animations = new WeakMap<HTMLElement, Animation>();
const reducedMotion = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

export function animateScroll(el: HTMLElement, target: { top?: number; left?: number }) {
  const running = animations.get(el);
  const state: Animation = running ?? { top: el.scrollTop, left: el.scrollLeft, frame: 0 };
  if (target.top !== undefined) state.top = target.top;
  if (target.left !== undefined) state.left = target.left;
  if (running) return;

  if (reducedMotion()) {
    el.scrollTo({ top: state.top, left: state.left });
    return;
  }

  animations.set(el, state);
  let last = performance.now();
  const stop = () => {
    cancelAnimationFrame(state.frame);
    animations.delete(el);
    el.removeEventListener('wheel', stop);
  };
  el.addEventListener('wheel', stop, { passive: true });

  const step = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;
    const k = 1 - Math.exp(-dt / 90);
    const dTop = state.top - el.scrollTop;
    const dLeft = state.left - el.scrollLeft;
    if (Math.abs(dTop) < 0.75 && Math.abs(dLeft) < 0.75) {
      el.scrollTo({ top: state.top, left: state.left });
      stop();
      return;
    }
    el.scrollTo({ top: el.scrollTop + dTop * k, left: el.scrollLeft + dLeft * k });
    state.frame = requestAnimationFrame(step);
  };
  state.frame = requestAnimationFrame(step);
}

export function revealElement(el: HTMLElement) {
  const rect = el.getBoundingClientRect();

  const row = el.closest<HTMLElement>('[data-hscroll]');
  if (row) {
    const view = row.getBoundingClientRect();
    const padding = parseFloat(getComputedStyle(row).paddingLeft) || 0;
    const start = rect.left - view.left + row.scrollLeft;
    const current = animations.get(row)?.left ?? row.scrollLeft;
    const left = revealOffset(current, view.width, start, start + rect.width, padding, rect.width * 0.35, row.scrollWidth - view.width);
    animateScroll(row, { left });
  }

  const page = el.closest<HTMLElement>('[data-vscroll]');
  if (page) {
    const view = page.getBoundingClientRect();
    const maxTop = page.scrollHeight - view.height;
    const section = el.closest<HTMLElement>('[data-section]');
    if (section?.dataset.section === 'top') {
      animateScroll(page, { top: 0 });
    } else if (section) {
      const top = section.getBoundingClientRect().top - view.top + page.scrollTop;
      animateScroll(page, { top: Math.max(0, Math.min(top - view.height * 0.14, maxTop)) });
    } else {
      const start = rect.top - view.top + page.scrollTop;
      const current = animations.get(page)?.top ?? page.scrollTop;
      const margin = view.height * 0.16;
      const top = revealOffset(current, view.height, start, start + rect.height, margin, 0, maxTop);
      animateScroll(page, { top });
    }
  }
}

/* ---------- Eingabe: Tastatur, Maus und Gamepad ---------- */

export function setInputMode(mode: 'keyboard' | 'mouse') {
  if (document.documentElement.dataset.input !== mode) document.documentElement.dataset.input = mode;
}

export const inputMode = () => document.documentElement.dataset.input ?? 'mouse';

const KEY_COMMANDS: Record<string, Command> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  Escape: 'back',
  Backspace: 'back',
  ' ': 'playpause',
  MediaPlayPause: 'playpause',
  GoBack: 'back',
};

/** Die Tasten der webOS-Fernbedienung melden je nach Modell nur einen Tastencode. */
const KEYCODE_COMMANDS: Record<number, Command> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'select',
  461: 'back',
  415: 'play',
  19: 'pause',
  413: 'stop',
  417: 'forward',
  412: 'rewind',
};

export function commandForKey(event: { key: string; keyCode: number }): Command | undefined {
  return KEY_COMMANDS[event.key] ?? KEYCODE_COMMANDS[event.keyCode];
}

function keyHandler(event: KeyboardEvent) {
  const command = commandForKey(event);
  if (!command || event.altKey || event.ctrlKey || event.metaKey) return;

  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (input) {
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length;
    const editing =
      event.key === ' ' ||
      event.key === 'Enter' ||
      (event.key === 'Backspace' && input.value.length > 0) ||
      (event.key === 'ArrowLeft' && !atStart) ||
      (event.key === 'ArrowRight' && !atEnd);
    if (editing) return;
  }

  event.preventDefault();
  dispatchCommand(command);
}

let lastPointer = { x: -1, y: -1 };

function pointerHandler(event: PointerEvent) {
  // Chromium meldet auch nach Scrollen und Layoutänderungen eine Mausbewegung, obwohl die Maus
  // stillsteht. Das darf den Fokus nicht verschieben, sonst springt er beim Navigieren per Taste.
  const moved = Math.abs(event.screenX - lastPointer.x) + Math.abs(event.screenY - lastPointer.y);
  if (moved < 2) return;
  lastPointer = { x: event.screenX, y: event.screenY };

  setInputMode('mouse');
  const target = (event.target as Element | null)?.closest?.<HTMLElement>(FOCUSABLE);
  if (target && target !== document.activeElement && !(document.activeElement instanceof HTMLInputElement)) {
    focusElement(target, false);
  }
}

function mouseButtonHandler(event: MouseEvent) {
  if (event.button === 3) {
    event.preventDefault();
    dispatchCommand('back');
  }
}

/** Ältere Engines liefern eine GamepadList ohne Array-Methoden. */
const connectedPads = () => Array.from(navigator.getGamepads?.() ?? []);

/** Standard-Mapping: A wählt aus, B geht zurück, Start ist Play/Pause, Steuerkreuz und linker Stick navigieren. */
function startGamepadLoop(): () => void {
  const buttons: Array<[number, Command]> = [[0, 'select'], [1, 'back'], [9, 'playpause'], [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']];
  const pressedAt = new Map<Command, number>();
  let frame = 0;

  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const pad = connectedPads().find((p) => p?.connected);
    if (!pad) return;

    const active = new Set<Command>();
    for (const [index, command] of buttons) if (pad.buttons[index]?.pressed) active.add(command);
    const [x = 0, y = 0] = pad.axes;
    if (x < -0.55) active.add('left');
    if (x > 0.55) active.add('right');
    if (y < -0.55) active.add('up');
    if (y > 0.55) active.add('down');

    for (const command of [...pressedAt.keys()]) if (!active.has(command)) pressedAt.delete(command);
    for (const command of active) {
      const since = pressedAt.get(command);
      const repeats = command === 'up' || command === 'down' || command === 'left' || command === 'right';
      if (since === undefined) {
        pressedAt.set(command, now + 340);
        dispatchCommand(command);
      } else if (repeats && now >= since) {
        pressedAt.set(command, now + 120);
        dispatchCommand(command);
      }
    }
  };
  frame = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(frame);
}

export function initFocusEngine(): () => void {
  let stopGamepad: (() => void) | null = null;
  const onPad = () => {
    if (!stopGamepad) stopGamepad = startGamepadLoop();
  };
  window.addEventListener('keydown', keyHandler);
  window.addEventListener('pointermove', pointerHandler, { passive: true });
  window.addEventListener('mouseup', mouseButtonHandler);
  window.addEventListener('gamepadconnected', onPad);
  if (connectedPads().some(Boolean)) onPad();
  return () => {
    window.removeEventListener('keydown', keyHandler);
    window.removeEventListener('pointermove', pointerHandler);
    window.removeEventListener('mouseup', mouseButtonHandler);
    window.removeEventListener('gamepadconnected', onPad);
    stopGamepad?.();
  };
}
