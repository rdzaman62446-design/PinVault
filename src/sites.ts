import { MOBILE_CHROME_UA, type Site } from './BrowserScreen';
import { IMAGE_HOSTS } from './imageUrls';
import { REDDIT_CLEANUP_JS } from './inject';

// Reddit doesn't push its app on desktop browsers; its site still fits a phone screen.
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export const SITES = {
  pinterest: { home: 'https://www.pinterest.com/', imageHosts: IMAGE_HOSTS.pinterest, userAgent: MOBILE_CHROME_UA },
  reddit: { home: 'https://www.reddit.com/', imageHosts: IMAGE_HOSTS.reddit, userAgent: DESKTOP_CHROME_UA, extraJs: REDDIT_CLEANUP_JS },
} satisfies Record<string, Site>;
