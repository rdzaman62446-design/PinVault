// Pure filtering/sorting for the Vault grid (testable without React Native).

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

export type DateRange = 'any' | 'today' | 'week' | 'month';
export type Sort = 'newest' | 'oldest';

export type Filters = {
  album: string | null; // null = all images
  source: SourceId | null; // null = all sources
  range: DateRange;
  sort: Sort;
};

export const DEFAULT_FILTERS: Filters = { album: null, source: null, range: 'any', sort: 'newest' };

export const RANGE_LABELS: Record<DateRange, string> = {
  any: 'Any time',
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
};

const DAY = 24 * 60 * 60 * 1000;

export function rangeStart(range: DateRange, now: number): number {
  if (range === 'any') return 0;
  if (range === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return now - (range === 'week' ? 7 : 30) * DAY;
}

export function filterImages(images: VaultImage[], f: Filters, now: number): VaultImage[] {
  const from = rangeStart(f.range, now);
  const out = images.filter(
    (i) => (f.album === null || i.album === f.album) && (f.source === null || i.source === f.source) && i.savedAt >= from,
  );
  return out.sort((a, b) => (f.sort === 'newest' ? b.savedAt - a.savedAt : a.savedAt - b.savedAt));
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
