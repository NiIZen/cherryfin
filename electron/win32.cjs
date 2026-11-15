/*
 * Chromium creates its own child window ("Intermediate D3D Window") in every window, even without
 * web content. It sits above mpv's window and would cover the video. So the app explicitly
 * raises the mpv window, which needs the Windows API.
 */
let api = null;

try {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  api = {
    findChild: user32.func('intptr_t __stdcall FindWindowExW(intptr_t parent, intptr_t after, const char16_t *className, const char16_t *title)'),
    setPosition: user32.func('bool __stdcall SetWindowPos(intptr_t window, intptr_t insertAfter, int x, int y, int cx, int cy, uint32_t flags)'),
  };
} catch (error) {
  console.error('Windows API not available:', error);
}

const HWND_TOP = 0;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;

const available = () => api !== null;

/** Raises the child window of the class without changing size, position or focus. */
function raiseChild(parent, className) {
  if (!api) return false;
  const child = api.findChild(parent, 0, className, null);
  if (!child) return false;
  return api.setPosition(child, HWND_TOP, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
}

module.exports = { available, raiseChild };
