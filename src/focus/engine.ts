import { pickBest, revealOffset, type Box, type Dir } from './spatial';

export type Command = Dir | 'select' | 'back' | 'playpause' | 'play' | 'pause' | 'stop' | 'forward' | 'rewind';
export type Interceptor = (command: Command) => boolean;

const FOCUSABLE = '[data-focusable]';
const interceptors: Interceptor[] = [];
const groupMemory = new WeakMap<Element, HTMLElement>();

/** The most recently registered interceptor gets every command first. */
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

/** Focuses data-autofocus or the first focusable element in the container. */
export function focusFirstIn(container: ParentNode, reveal = false): boolean {
  const list = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
  const target = list.find((el) => el.hasAttribute('data-autofocus')) ?? list[0];
  if (!target) return false;
  focusElement(target, reveal);
  return true;
}

/**
 * Like focusFirstIn, but retries while nothing is focusable yet
 * (e.g. right after start, before the window is shown).
 * Returns a function that cancels it.
 */
export function focusWhenReady(container: ParentNode): () => void {
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = () => {
    // If someone else has set the focus meanwhile, it stays there.
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
  void el.offsetWidth; // Restarts the animation on repeated bumps.
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
  // Elements like the fixed tab bar are only a fallback target; otherwise they would skip the rows above.
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

  // When moving into another row, you land where you last left it.
  const nextGroup = next.closest('[data-focus-group]');
  if (nextGroup && nextGroup !== current.closest('[data-focus-group]') && (dir === 'up' || dir === 'down')) {
    const remembered = groupMemory.get(nextGroup);
    if (remembered?.isConnected && isVisible(remembered)) next = remembered;
  }
  focusElement(next);
}

let rootBack: (() => void) | null = null;

/** What happens when "Back" is not needed anywhere: on the TV this closes the app. */
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

/* ---------- Smooth scrolling that keeps up with fast key repeat ---------- */

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

/* ---------- Input: keyboard, mouse and gamepad ---------- */

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

/** Depending on the model, the webOS remote keys only report a key code. */
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
  // Chromium also reports a mouse move after scrolling and layout changes, although the mouse
  // stands still. That must not move the focus, or it would jump while navigating by key.
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

/** Older engines return a GamepadList without array methods. */
const connectedPads = () => Array.from(navigator.getGamepads?.() ?? []);

/** Standard mapping: A selects, B goes back, Start is play/pause, D-pad and left stick navigate. */
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
