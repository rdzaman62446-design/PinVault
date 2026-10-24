import Ionicons from '@expo/vector-icons/Ionicons';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BrowserScreen } from './BrowserScreen';
import { HomeScreen } from './HomeScreen';
import { shouldLockOnBackground, unlock } from './lock';
import { SITE_LIST, type SiteId } from './sites';
import { colors } from './theme';
import { useUpdateCheck } from './updates';
import { cleanupTemp, initVault } from './vault';
import { VaultScreen } from './VaultScreen';

type Screen = 'home' | 'vault' | SiteId;

export default function App() {
  // Blocks screenshots and hides the app's content in the recent-apps screen.
  usePreventScreenCapture();
  useUpdateCheck();

  const [locked, setLocked] = useState(true);
  const [everUnlocked, setEverUnlocked] = useState(false);
  const [screen, setScreen] = useState<Screen>('home');
  // Each site loads the first time it's opened, then stays mounted to keep its place.
  const [opened, setOpened] = useState<Partial<Record<SiteId, boolean>>>({});
  // Where the Vault was opened from, so Back returns there (e.g. the site you were browsing).
  const [vaultFrom, setVaultFrom] = useState<Screen>('home');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && shouldLockOnBackground()) {
        setLocked(true);
        // Remove decrypted copies (videos being played, shared images) while locked.
        cleanupTemp();
      }
    });
    return () => sub.remove();
  }, []);

  const onUnlocked = useCallback(() => {
    setLocked(false);
    setEverUnlocked(true);
    // Opens the encrypted index (and encrypts images from older versions) after the first unlock.
    initVault();
  }, []);

  const goHome = useCallback(() => setScreen('home'), []);

  // Android back from the Vault returns to where you came from. (Sites handle their own back button.)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'vault') return false;
      setScreen(vaultFrom);
      return true;
    });
    return () => sub.remove();
  }, [screen, vaultFrom]);

  function open(next: Screen) {
    if (next === 'vault' && screen !== 'vault') setVaultFrom(screen);
    if (next !== 'home' && next !== 'vault') setOpened((o) => ({ ...o, [next]: true }));
    setScreen(next);
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {everUnlocked && (
          <>
            <View style={styles.content}>
              <View style={[styles.fill, screen !== 'home' && styles.hidden]}>
                <HomeScreen openSite={open} openVault={() => open('vault')} />
              </View>
              {SITE_LIST.map(
                (site) =>
                  opened[site.id] && (
                    <View key={site.id} style={[styles.fill, screen !== site.id && styles.hidden]}>
                      <BrowserScreen site={site} active={screen === site.id && !locked} onExit={goHome} />
                    </View>
                  ),
              )}
              <View style={[styles.fill, screen !== 'vault' && styles.hidden]}>
                <VaultScreen />
              </View>
            </View>
            <View style={styles.tabs}>
              <TabButton icon="home" label="Home" active={screen !== 'vault'} onPress={() => open('home')} />
              <TabButton icon="lock-closed" label="Vault" active={screen === 'vault'} onPress={() => open('vault')} />
            </View>
          </>
        )}
        {locked && <LockScreen onUnlocked={onUnlocked} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tryUnlock = () =>
      unlock()
        .then((r) => {
          if (cancelled) return;
          if (r.ok) onUnlocked();
          else setMessage(r.message);
        })
        .catch(() => !cancelled && setMessage('Locked'));
    // When locking happens in the background, wait for the 'active' event below instead.
    if (AppState.currentState === 'active') tryUnlock();
    // Prompt again whenever the app comes back to the front while locked.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryUnlock();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [onUnlocked]);

  return (
    <View style={styles.lock}>
      <Ionicons name="lock-closed" size={64} color={colors.accent} />
      <Text style={styles.lockTitle}>PinVault is locked</Text>
      {message && <Text style={styles.lockText}>{message}</Text>}
      <Pressable
        style={styles.unlockBtn}
        onPress={() =>
          unlock()
            .then((r) => (r.ok ? onUnlocked() : setMessage(r.message)))
            .catch(() => setMessage('Locked'))
        }
      >
        <Ionicons name="finger-print" size={22} color="#fff" />
        <Text style={styles.unlockText}>Unlock</Text>
      </Pressable>
    </View>
  );
}

function TabButton({ icon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  const color = active ? colors.accent : colors.muted;
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  fill: { ...StyleSheet.absoluteFill },
  hidden: { display: 'none' },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  lock: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  lockTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  lockText: { color: colors.muted, textAlign: 'center' },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  unlockText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
