import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';
import { listImages } from './vault';

type Props = {
  version: number;
  openPinterest: () => void;
  openReddit: () => void;
  openVault: () => void;
};

function greeting(hour: number) {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen({ version, openPinterest, openReddit, openVault }: Props) {
  const [hour] = useState(() => new Date().getHours());
  // `version` changes whenever an image is saved or deleted, so the list is re-read.
  const images = useMemo(() => (version >= 0 ? listImages() : []), [version]);
  const recent = images.slice(0, 4);

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
      <SiteCard
        color={colors.pinterest}
        icon="logo-pinterest"
        name="Pinterest"
        subtitle="Your home feed, boards and pins"
        onPress={openPinterest}
      />
      <SiteCard
        color={colors.reddit}
        icon="logo-reddit"
        name="Reddit"
        subtitle="Your communities and posts"
        onPress={openReddit}
      />

      <Text style={styles.section}>Your Vault</Text>
      <Pressable style={({ pressed }) => [styles.vault, pressed && styles.pressed]} onPress={openVault}>
        <View style={styles.vaultTop}>
          <View>
            <Text style={styles.vaultCount}>{images.length}</Text>
            <Text style={styles.vaultLabel}>{images.length === 1 ? 'saved image' : 'saved images'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </View>
        {recent.length > 0 ? (
          <View style={styles.thumbs}>
            {recent.map((img) => (
              <Image key={img.uri} source={{ uri: img.uri }} style={styles.thumb} contentFit="cover" recyclingKey={img.uri} />
            ))}
          </View>
        ) : (
          <Text style={styles.vaultEmpty}>Tap ⬇ on any image in Pinterest or Reddit to save it here.</Text>
        )}
      </Pressable>

      <View style={styles.footer}>
        <Ionicons name="finger-print" size={16} color={colors.dim} />
        <Text style={styles.footerText}>Locked with your biometrics · screenshots blocked</Text>
      </View>
    </ScrollView>
  );
}

function SiteCard({ color, icon, name, subtitle, onPress }: { color: string; icon: keyof typeof Ionicons.glyphMap; name: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, { backgroundColor: color }, pressed && styles.pressed]} onPress={onPress}>
      {/* Large faded logo in the corner for depth. */}
      <Ionicons name={icon} size={150} color="rgba(255,255,255,0.12)" style={styles.cardBg} />
      <View style={styles.cardIcon}>
        <Ionicons name={icon} size={30} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{name}</Text>
        <Text style={styles.cardSub}>{subtitle}</Text>
      </View>
      <Ionicons name="arrow-forward-circle" size={34} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, marginBottom: 28 },
  logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  greeting: { color: colors.muted, fontSize: 14 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: 0.3 },
  section: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 24, padding: 20, minHeight: 112, marginBottom: 14, overflow: 'hidden' },
  cardBg: { position: 'absolute', right: -24, bottom: -36 },
  cardIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cardName: { color: '#fff', fontSize: 22, fontWeight: '800' },
  cardSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  vault: { backgroundColor: colors.card, borderRadius: 24, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 24 },
  vaultTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vaultCount: { color: colors.text, fontSize: 32, fontWeight: '800' },
  vaultLabel: { color: colors.muted, fontSize: 13 },
  vaultEmpty: { color: colors.muted, marginTop: 12, lineHeight: 19 },
  thumbs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  thumb: { flex: 1, aspectRatio: 1, borderRadius: 12, backgroundColor: colors.border },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText: { color: colors.dim, fontSize: 12 },
});
