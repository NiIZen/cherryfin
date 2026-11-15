/** Läuft die App auf einem Fernseher? Der webOS-Build setzt das fest, ?tv schaltet es zum Testen ein. */
export const isTV: boolean =
  import.meta.env?.MODE === 'webos' ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).has('tv'));
