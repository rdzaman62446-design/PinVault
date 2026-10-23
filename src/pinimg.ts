// Pure helpers for Pinterest image URLs (testable without React Native).

const PINIMG = /^(https?:\/\/i\.pinimg\.com)\/[^/]+\/(.+?)(\?.*)?$/;

/** URLs to try, best quality first. Pinterest serves full-size images under /originals/. */
export function candidateUrls(src: string): string[] {
  const m = src.match(PINIMG);
  if (!m) return [src];
  const [, host, rest] = m;
  const base = rest.replace(/\.\w+$/, '');
  const urls = [
    `${host}/originals/${rest}`,
    ...['jpg', 'png', 'gif', 'webp'].map((ext) => `${host}/originals/${base}.${ext}`),
    `${host}/736x/${rest}`,
    src,
  ];
  return [...new Set(urls)];
}

/** Stable id for an image (Pinterest's file hash), used to skip duplicates. */
export function imageId(src: string): string {
  const name = src.split('?')[0].split('/').pop() ?? '';
  return name.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9_-]/g, '') || 'image';
}

export function extensionOf(url: string): string {
  const m = url.split('?')[0].match(/\.(jpe?g|png|gif|webp)$/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

export function mimeOf(ext: string): string {
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
}
