/** Is the app running on a TV? The webOS build fixes this; ?tv turns it on for testing. */
export const isTV: boolean =
  import.meta.env?.MODE === 'webos' ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).has('tv'));
