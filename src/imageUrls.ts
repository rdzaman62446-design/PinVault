// Pure helpers for image URLs from the supported sites (testable without React Native).

const PINIMG = /^(https?:\/\/i\.pinimg\.com)\/[^/]+\/(.+?)(\?.*)?$/;
const REDDIT_PREVIEW = /^https?:\/\/preview\.redd\.it\/([^/?#]+)/;
const X_MEDIA = /^https?:\/\/pbs\.twimg\.com\/media\/([A-Za-z0-9_-]+)(?:\.(\w+))?/;
const TUMBLR_SIZE = /^(https?:\/\/[^/]*media\.tumblr\.com\/.+)\/s\d+x\d+\/(.+)$/;

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
  const x = src.match(X_MEDIA);
  if (x) {
    // X serves the full-size upload with name=orig.
    const format = src.match(/[?&]format=(\w+)/)?.[1] ?? x[2] ?? 'jpg';
    const base = `https://pbs.twimg.com/media/${x[1]}?format=${format}`;
    return unique([`${base}&name=orig`, `${base}&name=4096x4096`, `${base}&name=large`, src]);
  }
  const tumblr = src.match(TUMBLR_SIZE);
  if (tumblr) return unique([`${tumblr[1]}/s2048x3072/${tumblr[2]}`, src]);
  return [src.replace(/&amp;/g, '&')];
}

/** Stable id for an image, used to skip duplicates. */
export function imageId(src: string): string {
  let name = fileName(src);
  if (REDDIT_PREVIEW.test(src)) name = redditOriginalName(name);
  const x = src.match(X_MEDIA);
  if (x) name = x[1];
  return name.replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9_-]/g, '') || 'image';
}

export function extensionOf(url: string): string {
  const m = url.split('?')[0].match(/\.(jpe?g|png|gif|webp)$/i) ?? url.match(/[?&]format=(jpe?g|png|gif|webp)\b/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

export function mimeOf(ext: string): string {
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
}

function unique(urls: string[]): string[] {
  return [...new Set(urls)];
}
