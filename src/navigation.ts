/** Where to send a navigation, or null to block it (e.g. "open in the Pinterest app" links). */
export function resolveNavigation(url: string): { allow: true } | { allow: false; redirect?: string } {
  if (/^https?:/i.test(url) || url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return { allow: true };
  if (url.startsWith('intent:')) {
    const m = url.match(/;S\.browser_fallback_url=([^;]+)/);
    const fallback = m ? decodeURIComponent(m[1]) : null;
    return { allow: false, redirect: fallback && /^https?:/i.test(fallback) ? fallback : undefined };
  }
  return { allow: false };
}
