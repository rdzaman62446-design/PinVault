import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { exportAllToShare } from './export';
import { whileUnlocked } from './lock';
import { extensionOf, mimeOf } from './imageUrls';
import { colors } from './theme';
import { deleteImage, listImages, type VaultImage } from './vault';

const COLUMNS = 3;
const GAP = 2;

type Props = { version: number; onChanged: () => void };

export function VaultScreen({ version, onChanged }: Props) {
  const { width, height } = useWindowDimensions();
  // `version` changes whenever an image is saved or deleted, so the list is re-read.
  const images = useMemo(() => (version >= 0 ? listImages() : []), [version]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [exporting, setExporting] = useState<string | null>(null);
  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  function open(index: number) {
    setCurrent(index);
    setOpenIndex(index);
  }

  async function share(img: VaultImage) {
    await whileUnlocked(() => Sharing.shareAsync(img.uri, { mimeType: mimeOf(extensionOf(img.name)) })).catch(() => {});
  }

  async function exportAll() {
    setExporting('Preparing…');
    try {
      await exportAllToShare((done, total) => setExporting(`Packing ${done}/${total}…`));
    } catch {
      Alert.alert('Export failed', 'Could not create the ZIP file. Check that your phone has free space.');
    } finally {
      setExporting(null);
    }
  }

  function remove(img: VaultImage) {
    Alert.alert('Delete image?', 'It will be removed from your Vault for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteImage(img.uri);
          if (images.length <= 1) setOpenIndex(null);
          else setCurrent((c) => Math.min(c, images.length - 2));
          onChanged();
        },
      },
    ]);
  }

  if (images.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="images-outline" size={56} color={colors.dim} />
        <Text style={styles.emptyTitle}>Your Vault is empty</Text>
        <Text style={styles.emptyText}>In the Pinterest or Reddit tab, tap ⬇ on any image, or open a post and tap “Save”.</Text>
      </View>
    );
  }

  const shown = images[Math.min(current, images.length - 1)];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.count}>{exporting ?? `${images.length} ${images.length === 1 ? 'image' : 'images'}`}</Text>
        <Pressable style={[styles.exportBtn, exporting && styles.disabled]} onPress={exportAll} disabled={!!exporting}>
          {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
          <Text style={styles.exportText}>Export all</Text>
        </Pressable>
      </View>
      <FlatList
        data={images}
        keyExtractor={(i) => i.uri}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: 16 }}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => open(index)}>
            <Image source={{ uri: item.uri }} style={{ width: tile, height: tile }} contentFit="cover" recyclingKey={item.uri} transition={120} />
          </Pressable>
        )}
      />

      <Modal visible={openIndex !== null} animationType="fade" onRequestClose={() => setOpenIndex(null)} statusBarTranslucent>
        <SafeAreaView style={styles.viewer}>
          <FlatList
            data={images}
            keyExtractor={(i) => i.uri}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={openIndex ?? 0}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Image source={{ uri: item.uri }} style={{ width, height: height - 140 }} contentFit="contain" />
            )}
          />
          <View style={styles.viewerBar}>
            <ViewerButton icon="close" label="Close" onPress={() => setOpenIndex(null)} />
            <ViewerButton icon="share-social-outline" label="Share" onPress={() => shown && share(shown)} />
            <ViewerButton icon="trash-outline" label="Delete" color={colors.danger} onPress={() => shown && remove(shown)} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function ViewerButton({ icon, label, onPress, color = colors.text }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.viewerBtn} hitSlop={8}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.viewerLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  count: { color: colors.muted },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18 },
  exportText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, backgroundColor: colors.bg },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between' },
  viewerBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 },
  viewerBtn: { alignItems: 'center', gap: 4, minWidth: 70 },
  viewerLabel: { fontSize: 12 },
});
