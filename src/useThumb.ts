import { useEffect, useState } from 'react';

import { cachedThumb, loadFull, loadThumb } from './vault';
import type { VaultImage } from './vaultFilters';

/** Decrypted preview for a grid tile (null while it loads). */
export function useThumb(key: string): string | null {
  const [loaded, setLoaded] = useState<{ key: string; uri: string } | null>(null);
  useEffect(() => {
    let alive = true;
    loadThumb(key)
      .then((uri) => alive && setLoaded({ key, uri }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return loaded?.key === key ? loaded.uri : (cachedThumb(key) ?? null);
}

/** Decrypted full image for the viewer (null while it loads). */
export function useFullImage(img: VaultImage | null): string | null {
  const [loaded, setLoaded] = useState<{ key: string; uri: string } | null>(null);
  useEffect(() => {
    if (!img) return;
    let alive = true;
    loadFull(img)
      .then((uri) => alive && setLoaded({ key: img.key, uri }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [img]);
  return img && loaded?.key === img.key ? loaded.uri : null;
}
