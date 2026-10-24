// Pure Vault data helpers (testable without React Native).

export type SourceId = 'pinterest' | 'reddit' | 'instagram' | 'x' | 'tumblr' | 'other';

export type VaultImage = {
  key: string; // file name of the encrypted blobs
  id: string; // image id from its URL, used to skip duplicates
  source: SourceId;
  ext: string;
  savedAt: number;
  album: string | null;
  url: string;
};

export type Album = { id: string; name: string; createdAt: number };

/** Images in an album (null = all images), newest first. */
export function imagesInAlbum(images: VaultImage[], album: string | null): VaultImage[] {
  return images.filter((i) => album === null || i.album === album).sort((a, b) => b.savedAt - a.savedAt);
}

/** v1.0/1.1 stored plain files named `<savedAt>_<id>.<ext>`; guess where they came from. */
export function parseLegacyName(name: string): Omit<VaultImage, 'key' | 'album' | 'url'> | null {
  const m = name.match(/^(\d+)_(.+)\.(\w+)$/);
  if (!m) return null;
  const [, savedAt, id, ext] = m;
  return { id, ext, savedAt: parseInt(savedAt, 10), source: /^[0-9a-f]{32}$/.test(id) ? 'pinterest' : 'reddit' };
}

/** Album name from a page title, e.g. "Cozy rooms | Pinterest" → "Cozy rooms". */
export function albumNameFromTitle(title: string, fallback: string): string {
  const name = title
    .replace(/\s*[|:–—-]\s*(Pinterest|Reddit|Instagram|X|Tumblr)\b.*$/i, '')
    .replace(/\s+on (Pinterest|X|Instagram|Tumblr)\s*$/i, '')
    .replace(/\s*:\s*r\/\w+\s*$/, '')
    .replace(/^\(\d+\)\s*/, '')
    .trim();
  return (name || fallback).slice(0, 40);
}
