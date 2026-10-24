import type Ionicons from '@expo/vector-icons/Ionicons';

import { INSTAGRAM_JS, REDDIT_CLEANUP_JS } from './inject';

// Sites like Pinterest serve a broken page to Android's in-app browser, so present as normal mobile Chrome.
const MOBILE_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
// Reddit doesn't push its app on desktop browsers; its site still fits a phone screen.
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export type SiteId = 'pinterest' | 'reddit' | 'instagram' | 'x' | 'tumblr';

export type Site = {
  id: SiteId;
  name: string;
  subtitle: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  home: string;
  /** Image hosts (and their subdomains) whose pictures get a download button. */
  imageHosts: string[];
  userAgent: string;
  extraJs?: string;
};

export const SITE_LIST: Site[] = [
  {
    id: 'pinterest',
    name: 'Pinterest',
    subtitle: 'Feed, boards and pins',
    color: '#e60023',
    icon: 'logo-pinterest',
    home: 'https://www.pinterest.com/',
    imageHosts: ['i.pinimg.com'],
    userAgent: MOBILE_CHROME_UA,
  },
  {
    id: 'reddit',
    name: 'Reddit',
    subtitle: 'Communities and posts',
    color: '#ff4500',
    icon: 'logo-reddit',
    home: 'https://www.reddit.com/',
    imageHosts: ['i.redd.it', 'preview.redd.it', 'external-preview.redd.it'],
    userAgent: DESKTOP_CHROME_UA,
    extraJs: REDDIT_CLEANUP_JS,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    subtitle: 'Feed and profiles',
    color: '#c13584',
    icon: 'logo-instagram',
    home: 'https://www.instagram.com/',
    imageHosts: ['cdninstagram.com', 'fbcdn.net'],
    userAgent: MOBILE_CHROME_UA,
    extraJs: INSTAGRAM_JS,
  },
  {
    id: 'x',
    name: 'X',
    subtitle: 'Timeline and media',
    color: '#26262c',
    icon: 'logo-x',
    home: 'https://x.com/',
    imageHosts: ['pbs.twimg.com'],
    userAgent: MOBILE_CHROME_UA,
  },
  {
    id: 'tumblr',
    name: 'Tumblr',
    subtitle: 'Dashboard and blogs',
    color: '#36465d',
    icon: 'logo-tumblr',
    home: 'https://www.tumblr.com/',
    imageHosts: ['media.tumblr.com'],
    userAgent: MOBILE_CHROME_UA,
  },
];

export const SITES = Object.fromEntries(SITE_LIST.map((s) => [s.id, s])) as Record<SiteId, Site>;
