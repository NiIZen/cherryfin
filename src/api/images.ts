import type { ImageRef, Item } from './types';

/** The item’s own image, or the one inherited from the season or show. */
export function backdropRef(item: Item): ImageRef | null {
  if (item.BackdropImageTags?.length) return { itemId: item.Id!, type: 'Backdrop', tag: item.BackdropImageTags[0], index: 0 };
  if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) {
    return { itemId: item.ParentBackdropItemId, type: 'Backdrop', tag: item.ParentBackdropImageTags[0], index: 0 };
  }
  return null;
}

export function logoRef(item: Item): ImageRef | null {
  if (item.ImageTags?.Logo) return { itemId: item.Id!, type: 'Logo', tag: item.ImageTags.Logo };
  if (item.ParentLogoItemId && item.ParentLogoImageTag) return { itemId: item.ParentLogoItemId, type: 'Logo', tag: item.ParentLogoImageTag };
  return null;
}

/** Portrait; for episodes the show’s poster. */
export function posterRef(item: Item): ImageRef | null {
  if (item.Type === 'Episode' && item.SeriesId && item.SeriesPrimaryImageTag) {
    return { itemId: item.SeriesId, type: 'Primary', tag: item.SeriesPrimaryImageTag };
  }
  if (item.ImageTags?.Primary) return { itemId: item.Id!, type: 'Primary', tag: item.ImageTags.Primary };
  return backdropRef(item);
}

/** Landscape: episode image, thumb or backdrop, finally the primary image. */
export function landscapeRef(item: Item): ImageRef | null {
  if (item.Type === 'Episode' && item.ImageTags?.Primary) return { itemId: item.Id!, type: 'Primary', tag: item.ImageTags.Primary };
  if (item.ImageTags?.Thumb) return { itemId: item.Id!, type: 'Thumb', tag: item.ImageTags.Thumb };
  if (item.ParentThumbItemId && item.ParentThumbImageTag) return { itemId: item.ParentThumbItemId, type: 'Thumb', tag: item.ParentThumbImageTag };
  return backdropRef(item) ?? (item.ImageTags?.Primary ? { itemId: item.Id!, type: 'Primary', tag: item.ImageTags.Primary } : null);
}
