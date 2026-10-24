import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentType, type Ref, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';

import { buildInjectedJs, SAVE_VISIBLE_JS } from './inject';
import { resolveNavigation } from './navigation';
import { colors } from './theme';
import { saveFromUrl } from './vault';

// Sites like Pinterest serve a broken page to Android's in-app browser, so present as normal mobile Chrome.
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';


// The library's typings drop `ref` under React 19; the component still forwards it.
type WebViewHandle = { goBack(): void; reload(): void; injectJavaScript(js: string): void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

type Props = { home: string; imageHosts: string[]; active: boolean; onSaved: () => void };

/** A logged-in website (Pinterest, Reddit) with download buttons on its images. */
export function BrowserScreen({ home, imageHosts, active, onSaved }: Props) {
  const web = useRef<WebViewHandle>(null);
  const injectedJs = useMemo(() => buildInjectedJs(imageHosts), [imageHosts]);
  const [canGoBack, setCanGoBack] = useState(false);
  const [saving, setSaving] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [active, canGoBack]);

  async function onMessage(e: WebViewMessageEvent) {
    let msg: { type?: string; url?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'none') {
      showToast('No image on screen. Open a post first.');
      return;
    }
    if (msg.type !== 'save' || !msg.url) return;
    setSaving((n) => n + 1);
    try {
      const result = await saveFromUrl(msg.url);
      showToast(result === 'saved' ? 'Saved to Vault' : 'Already in Vault');
      if (result === 'saved') onSaved();
    } catch {
      showToast('Download failed. Try again.');
    } finally {
      setSaving((n) => n - 1);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <BarButton icon="arrow-back" disabled={!canGoBack} onPress={() => web.current?.goBack()} />
        <BarButton icon="home-outline" onPress={() => web.current?.injectJavaScript(`location.href=${JSON.stringify(home)};true;`)} />
        <BarButton icon="refresh" onPress={() => web.current?.reload()} />
        <View style={{ flex: 1 }} />
        {saving > 0 && <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} />}
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
        userAgent={USER_AGENT}
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
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barBtn: { padding: 8 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18 },
  saveText: { color: '#fff', fontWeight: '600' },
  web: { flex: 1, backgroundColor: colors.bg },
  error: { ...StyleSheet.absoluteFill, top: 48, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  errorText: { color: colors.muted, textAlign: 'center' },
  toast: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: 'rgba(30,30,36,0.95)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  toastText: { color: colors.text },
});
