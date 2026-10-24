import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type Site, SITE_LIST, type SiteId } from './sites';
import { colors } from './theme';
import { useThumb } from './useThumb';
import { useVault } from './vault';

type Props = { openSite: (id: SiteId) => void; openVault: () => void };

function greeting(hour: number) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen({ openSite, openVault }: Props) {
  const [hour] = useState(() => new Date().getHours());
  const vault = useVault();
  const recent = useMemo(() => [...vault.images].sort((a, b) => b.savedAt - a.savedAt).slice(0, 4), [vault.images]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="lock-closed" size={26} color="#fff" />
        </View>
        <View>
          <Text style={styles.greeting}>{greeting(hour)}</Text>
          <Text style={styles.title}>PinVault</Text>
        </View>
      </View>

      <Text style={styles.section}>Browse</Text>
      <View style={styles.grid}>
        {SITE_LIST.map((site, i) => (
          // An odd last card spans the full width.
          <SiteCard key={site.id} site={site} wide={i === SITE_LIST.length - 1 && SITE_LIST.length % 2 === 1} onPress={() => openSite(site.id)} />
        ))}
      </View>

      <Text style={styles.section}>Your Vault</Text>
      <Pressable style={({ pressed }) => [styles.vault, pressed && styles.pressed]} onPress={openVault}>
        <View style={styles.vaultTop}>
          <View>
            <Text style={styles.vaultCount}>{vault.images.length}</Text>
            <Text style={styles.vaultLabel}>
              {vault.images.length === 1 ? 'saved image' : 'saved images'} · {vault.albums.length} {vault.albums.length === 1 ? 'album' : 'albums'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </View>
        {recent.length > 0 ? (
          <View style={styles.thumbs}>
            {recent.map((img) => (
              <Thumb key={img.key} imageKey={img.key} />
            ))}
          </View>
        ) : (
          <Text style={styles.vaultEmpty}>Tap ⬇ on any image in a site to save it here.</Text>
        )}
      </Pressable>

      <View style={styles.footer}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.dim} />
        <Text style={styles.footerText}>Encrypted · biometric lock · screenshots blocked</Text>
      </View>
    </ScrollView>
  );
}

function Thumb({ imageKey }: { imageKey: string }) {
  const uri = useThumb(imageKey);
  return <View style={styles.thumb}>{uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}</View>;
}

function SiteCard({ site, wide, onPress }: { site: Site; wide: boolean; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, wide && styles.cardWide, { backgroundColor: site.color }, pressed && styles.pressed]} onPress={onPress}>
      {/* Large faded logo in the corner for depth. */}
      <Ionicons name={site.icon} size={120} color="rgba(255,255,255,0.12)" style={styles.cardBg} />
      <View style={styles.cardIcon}>
        <Ionicons name={site.icon} size={24} color={site.color} />
      </View>
      <View style={{ flex: wide ? 1 : undefined }}>
        <Text style={styles.cardName}>{site.name}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {site.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, marginBottom: 26 },
  logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  greeting: { color: colors.muted, fontSize: 14 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: 0.3 },
  section: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 22 },
  card: { width: '47.8%', borderRadius: 22, padding: 16, minHeight: 128, justifyContent: 'space-between', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  cardWide: { width: '100%', minHeight: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14 },
  cardBg: { position: 'absolute', right: -22, bottom: -28 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cardName: { color: '#fff', fontSize: 19, fontWeight: '800' },
  cardSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  vault: { backgroundColor: colors.card, borderRadius: 24, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 24 },
  vaultTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vaultCount: { color: colors.text, fontSize: 32, fontWeight: '800' },
  vaultLabel: { color: colors.muted, fontSize: 13 },
  vaultEmpty: { color: colors.muted, marginTop: 12, lineHeight: 19 },
  thumbs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  thumb: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.border },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText: { color: colors.dim, fontSize: 12 },
});
