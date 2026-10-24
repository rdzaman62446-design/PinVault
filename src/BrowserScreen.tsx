import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentType, type Ref, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';

import { imageId } from './imageUrls';
import { buildInjectedJs, COLLECT_ALL_JS, SAVE_VISIBLE_JS, STOP_COLLECT_JS } from './inject';
import { resolveNavigation } from './navigation';
import { Sheet } from './Sheet';
import type { Site } from './sites';
import { colors } from './theme';
import { createAlbum, saveFromUrl } from './vault';
import { albumNameFromTitle } from './vaultFilters';

// The library's typings drop `ref` under React 19; the component still forwards it.
type WebViewHandle = { goBack(): void; reload(): void; injectJavaScript(js: string): void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

type Props = { site: Site; active: boolean; onExit: () => void };

type Bulk =
  | { phase: 'collecting'; count: number }
  | { phase: 'confirm'; urls: string[]; title: string }
  | { phase: 'saving'; done: number; total: number };

/** A logged-in website with download buttons on its images. */
export function BrowserScreen({ site, active, onExit }: Props) {
  const { home } = site;
  const web = useRef<WebViewHandle>(null);
  const injectedJs = useMemo(() => buildInjectedJs(site.imageHosts, site.extraJs), [site]);
  const [canGoBack, setCanGoBack] = useState(false);
  const [saving, setSaving] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulk, setBulk] = useState<Bulk | null>(null);
  const stopSaving = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Back goes to the previous page, or leaves the site when there is none.
      if (canGoBack) web.current?.goBack();
      else onExit();
      return true;
    });
    return () => sub.remove();
  }, [active, canGoBack, onExit]);

  async function saveOne(url: string) {
    setSaving((n) => n + 1);
    try {
      const result = await saveFromUrl(url, site.id, home);
      showToast(result === 'saved' ? 'Saved to Vault' : 'Already in Vault');
    } catch {
      showToast('Download failed. Try again.');
    } finally {
      setSaving((n) => n - 1);
    }
  }

  async function saveMany(urls: string[], albumName: string | null) {
    stopSaving.current = false;
    const album = albumName ? await createAlbum(albumName) : null;
    let saved = 0;
    let dupes = 0;
    let failed = 0;
    setBulk({ phase: 'saving', done: 0, total: urls.length });
    for (let i = 0; i < urls.length && !stopSaving.current; i++) {
      try {
        if ((await saveFromUrl(urls[i], site.id, home, album)) === 'saved') saved++;
        else dupes++;
      } catch {
        failed++;
      }
      setBulk({ phase: 'saving', done: i + 1, total: urls.length });
    }
    setBulk(null);
    showToast([`Saved ${saved}`, dupes && `${dupes} already in Vault`, failed && `${failed} failed`].filter(Boolean).join(' · '));
  }

  function onMessage(e: WebViewMessageEvent) {
    let msg: { type?: string; url?: string; urls?: string[]; count?: number; title?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'none') showToast('No image on screen. Open a post first.');
    else if (msg.type === 'save' && msg.url) saveOne(msg.url);
    else if (msg.type === 'collecting') setBulk((b) => (b?.phase === 'collecting' ? { phase: 'collecting', count: msg.count ?? 0 } : b));
    else if (msg.type === 'collected') {
      // The same picture can appear in several sizes; keep one URL per image.
      const byId = new Map<string, string>();
      for (const u of msg.urls ?? []) if (!byId.has(imageId(u))) byId.set(imageId(u), u);
      const urls = [...byId.values()];
      if (urls.length === 0) {
        setBulk(null);
        showToast('No images found on this page.');
      } else {
        setBulk({ phase: 'confirm', urls, title: msg.title ?? '' });
      }
    }
  }

  function startSaveAll() {
    setBulk({ phase: 'collecting', count: 0 });
    web.current?.injectJavaScript(COLLECT_ALL_JS);
  }

  const confirm = bulk?.phase === 'confirm' ? bulk : null;
  const albumName = confirm ? albumNameFromTitle(confirm.title, site.name) : '';

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <BarButton icon="arrow-back" disabled={!canGoBack} onPress={() => web.current?.goBack()} />
        <BarButton icon="home-outline" onPress={() => web.current?.injectJavaScript(`location.href=${JSON.stringify(home)};true;`)} />
        <BarButton icon="refresh" onPress={() => web.current?.reload()} />
        <View style={{ flex: 1 }} />
        {saving > 0 && <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} />}
        <Pressable style={[styles.saveBtn, styles.saveAllBtn]} onPress={startSaveAll} disabled={!!bulk}>
          <Ionicons name="albums-outline" size={17} color={colors.text} />
          <Text style={styles.saveAllText}>Save all</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={() => web.current?.injectJavaScript(SAVE_VISIBLE_JS)}>
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>
      <WebView
        ref={web}
        source={{ uri: home }}
        style={styles.web}
        injectedJavaScript={injectedJs}
        onMessage={onMessage}
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        onLoadStart={() => setLoadError(null)}
        onLoadEnd={() => web.current?.injectJavaScript(injectedJs)}
        onError={(e) => setLoadError(e.nativeEvent.description || 'Page failed to load')}
        onShouldStartLoadWithRequest={(req) => {
          const nav = resolveNavigation(req.url);
          if (!nav.allow && nav.redirect) web.current?.injectJavaScript(`location.href=${JSON.stringify(nav.redirect)};true;`);
          return nav.allow;
        }}
        userAgent={site.userAgent}
        originWhitelist={['*']}
        domStorageEnabled
        javaScriptEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        onRenderProcessGone={() => web.current?.reload()}
      />
      {loadError && (
        <View style={styles.error}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.dim} />
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable style={styles.saveBtn} onPress={() => web.current?.reload()}>
            <Text style={styles.saveText}>Retry</Text>
          </Pressable>
        </View>
      )}
      {(bulk?.phase === 'collecting' || bulk?.phase === 'saving') && (
        <View style={styles.progress}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.progressText}>
            {bulk.phase === 'collecting' ? `Scrolling the page… ${bulk.count} images found` : `Saving ${bulk.done} of ${bulk.total}…`}
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => {
              if (bulk.phase === 'collecting') web.current?.injectJavaScript(STOP_COLLECT_JS);
              else stopSaving.current = true;
            }}
          >
            <Text style={styles.stop}>{bulk.phase === 'collecting' ? 'Done' : 'Stop'}</Text>
          </Pressable>
        </View>
      )}
      <Sheet
        visible={!!confirm}
        title={confirm ? `Found ${confirm.urls.length} images` : ''}
        onClose={() => setBulk((b) => (b?.phase === 'confirm' ? null : b))}
        options={
          confirm
            ? [
                { label: `Save into new album “${albumName}”`, icon: 'albums-outline', onPress: () => saveMany(confirm.urls, albumName) },
                { label: 'Save without an album', icon: 'download-outline', onPress: () => saveMany(confirm.urls, null) },
              ]
            : []
        }
      />
      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

function BarButton({ icon, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={styles.barBtn}>
      <Ionicons name={icon} size={22} color={disabled ? colors.dim : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, height: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barBtn: { padding: 7 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18 },
  saveText: { color: '#fff', fontWeight: '600' },
  saveAllBtn: { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: 6 },
  saveAllText: { color: colors.text, fontWeight: '600' },
  web: { flex: 1, backgroundColor: colors.bg },
  error: { ...StyleSheet.absoluteFill, top: 48, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText: { color: colors.muted, textAlign: 'center' },
  progress: { position: 'absolute', left: 12, right: 12, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(26,26,32,0.97)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  progressText: { flex: 1, color: colors.text },
  stop: { color: colors.accent, fontWeight: '700' },
  toast: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: 'rgba(30,30,36,0.95)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  toastText: { color: colors.text },
});
