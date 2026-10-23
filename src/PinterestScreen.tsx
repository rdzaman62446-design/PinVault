import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentType, type Ref, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';

import { INJECTED_JS, SAVE_VISIBLE_JS } from './inject';
import { colors } from './theme';
import { saveFromUrl } from './vault';

const HOME = 'https://www.pinterest.com/';

// The library's typings drop `ref` under React 19; the component still forwards it.
type WebViewHandle = { goBack(): void; reload(): void; injectJavaScript(js: string): void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

type Props = { active: boolean; onSaved: () => void };

export function PinterestScreen({ active, onSaved }: Props) {
  const web = useRef<WebViewHandle>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [saving, setSaving] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
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
      showToast('No image on screen. Open a pin first.');
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
        <BarButton icon="home-outline" onPress={() => web.current?.injectJavaScript(`location.href=${JSON.stringify(HOME)};true;`)} />
        <BarButton icon="refresh" onPress={() => web.current?.reload()} />
        <View style={{ flex: 1 }} />
        {saving > 0 && <ActivityIndicator color={colors.accent} style={{ marginRight: 8 }} />}
        <Pressable style={styles.saveBtn} onPress={() => web.current?.injectJavaScript(SAVE_VISIBLE_JS)}>
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={styles.saveText}>Save pin</Text>
        </Pressable>
      </View>
      <WebView
        ref={web}
        source={{ uri: HOME }}
        style={styles.web}
        injectedJavaScript={INJECTED_JS}
        onMessage={onMessage}
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        onLoadEnd={() => web.current?.injectJavaScript(INJECTED_JS)}
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        onRenderProcessGone={() => web.current?.reload()}
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
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barBtn: { padding: 8 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18 },
  saveText: { color: '#fff', fontWeight: '600' },
  web: { flex: 1, backgroundColor: colors.bg },
  toast: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: 'rgba(30,30,36,0.95)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  toastText: { color: colors.text },
});
