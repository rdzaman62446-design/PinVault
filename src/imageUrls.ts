// Pure helpers for image URLs from Pinterest and Reddit (testable without React Native).

const PINIMG = /^(https?:\/\/i\.pinimg\.com)\/[^/]+\/(.+?)(\?.*)?$/;
const REDDIT_PREVIEW = /^https?:\/\/preview\.redd\.it\/([^/?#]+)/;

/** Image hosts whose pictures get a download button, per site. */
export const IMAGE_HOSTS = {
  pinterest: ['i.pinimg.com'],
  reddit: ['i.redd.it', 'preview.redd.it', 'external-preview.redd.it'],
};

function fileName(src: string): string {
  return src.split(/[?#]/)[0].split('/').pop() ?? '';
}

/** Reddit preview names look like "post-title-v0-<id>.jpeg"; the original is i.redd.it/<id>.jpeg. */
function redditOriginalName(name: string): string {
  const i = name.lastIndexOf('-v0-');
  return i >= 0 ? name.slice(i + 4) : name;
}

/** URLs to try, best quality first. */
export function candidateUrls(src: string): string[] {
  const pin = src.match(PINIMG);
  if (pin) {
    // Pinterest serves full-size images under /originals/.
    const [, host, rest] = pin;
    const base = rest.replace(/\.\w+$/, '');
    return unique([
      `${host}/originals/${rest}`,
      ...['jpg', 'png', 'gif', 'webp'].map((ext) => `${host}/originals/${base}.${ext}`),
      `${host}/736x/${rest}`,
      src,
    ]);
  }
  const preview = src.match(REDDIT_PREVIEW);
  if (preview) {
    // Previews are resized; the uploaded original lives on i.redd.it.
    return unique([`https://i.redd.it/${redditOriginalName(preview[1])}`, src.replace(/&amp;/g, '&')]);
  }
  return [src.replace(/&amp;/g, '&')];
}

/** Stable id for an image, used to skip duplicates. */
export function imageId(src: string): string {
  let name = fileName(src);
  if (REDDIT_PREVIEW.test(src)) name = redditOriginalName(name);
  return name.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9_-]/g, '') || 'image';
}

/** Referer header the image host expects. */
export function refererFor(src: string): string {
  return /redd\.it|reddit/.test(src) ? 'https://www.reddit.com/' : 'https://www.pinterest.com/';
}

export function extensionOf(url: string): string {
  const m = url.split('?')[0].match(/\.(jpe?g|png|gif|webp)$/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

export function mimeOf(ext: string): string {
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
}

function unique(urls: string[]): string[] {
  return [...new Set(urls)];
}
