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

/** 'all', an automatic per-app album ('site:pinterest'), or one of the user's album ids. */
export type AlbumRef = string;
export const ALL: AlbumRef = 'all';
export const siteAlbum = (source: SourceId): AlbumRef => `site:${source}`;

/** Images in an album, newest first. */
export function imagesIn(images: VaultImage[], ref: AlbumRef): VaultImage[] {
  const keep =
    ref === ALL ? () => true : ref.startsWith('site:') ? (i: VaultImage) => i.source === ref.slice(5) : (i: VaultImage) => i.album === ref;
  return images.filter(keep).sort((a, b) => b.savedAt - a.savedAt);
}

/** v1.0/1.1 stored plain files named `<savedAt>_<id>.<ext>`; guess where they came from. */
export function parseLegacyName(name: string): Omit<VaultImage, 'key' | 'album' | 'url'> | null {
  const m = name.match(/^(\d+)_(.+)\.(\w+)$/);
  if (!m) return null;
  const [, savedAt, id, ext] = m;
  return { id, ext, savedAt: parseInt(savedAt, 10), source: /^[0-9a-f]{32}$/.test(id) ? 'pinterest' : 'reddit' };
}
