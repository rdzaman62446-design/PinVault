import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { exportToShare } from './export';
import { mimeOf } from './imageUrls';
import { whileUnlocked } from './lock';
import { NamePrompt, Sheet, type SheetOption } from './Sheet';
import { SITES, type SiteId } from './sites';
import { colors } from './theme';
import { useFullImage, useThumb } from './useThumb';
import { createAlbum, decryptToTempFile, deleteAlbum, deleteImages, moveToAlbum, renameAlbum, useVault } from './vault';
import { DEFAULT_FILTERS, type DateRange, filterImages, type Filters, RANGE_LABELS, type VaultImage } from './vaultFilters';

const COLUMNS = 3;
const GAP = 2;

type SheetState = { title?: string; options: SheetOption[] } | null;
type Prompt = { title: string; initial?: string; confirmLabel?: string; onSubmit: (name: string) => void } | null;

export function VaultScreen() {
  const vault = useVault();
  const { width } = useWindowDimensions();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [now] = useState(() => Date.now());
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [promptId, setPromptId] = useState(0);
  const [exporting, setExporting] = useState<string | null>(null);

  // Back leaves selection mode before leaving the Vault.
  useEffect(() => {
    if (!selected) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelected(null);
      return true;
    });
    return () => sub.remove();
  }, [selected]);

  const shown = useMemo(() => filterImages(vault.images, filters, now), [vault.images, filters, now]);
  const sources = useMemo(() => [...new Set(vault.images.map((i) => i.source))], [vault.images]);
  const albumCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of vault.images) if (i.album) counts.set(i.album, (counts.get(i.album) ?? 0) + 1);
    return counts;
  }, [vault.images]);
  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const albumName = (id: string | null) => vault.albums.find((a) => a.id === id)?.name;

  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  function ask(p: NonNullable<Prompt>) {
    setPromptId((n) => n + 1);
    setPrompt(p);
  }

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size ? next : null;
    });
  }

  function chooseAlbum(keys: string[], done?: () => void) {
    const current = keys.length === 1 ? vault.images.find((i) => i.key === keys[0])?.album : undefined;
    setSheet({
      title: keys.length === 1 ? 'Move to album' : `Move ${keys.length} images to`,
      options: [
        ...vault.albums.map((a) => ({
          label: a.name,
          icon: 'albums-outline' as const,
          selected: current === a.id,
          onPress: () => moveToAlbum(keys, a.id).then(done),
        })),
        {
          label: 'New album…',
          icon: 'add-circle-outline',
          onPress: () =>
            ask({ title: 'New album', confirmLabel: 'Create', onSubmit: (name) => createAlbum(name).then((id) => moveToAlbum(keys, id)).then(done) }),
        },
        ...(keys.some((k) => vault.images.find((i) => i.key === k)?.album)
          ? [{ label: 'Remove from album', icon: 'remove-circle-outline' as const, onPress: () => moveToAlbum(keys, null).then(done) }]
          : []),
      ],
    });
  }

  function confirmDelete(keys: string[], done?: () => void) {
    Alert.alert(keys.length === 1 ? 'Delete image?' : `Delete ${keys.length} images?`, 'They will be removed from your Vault for good.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteImages(keys).then(done) },
    ]);
  }

  async function runExport(images: VaultImage[]) {
    setExporting('Preparing…');
    try {
      await exportToShare(images, (done, total) => setExporting(`Packing ${done}/${total}…`));
    } catch {
      Alert.alert('Export failed', 'Could not create the ZIP file. Check that your phone has free space.');
    } finally {
      setExporting(null);
    }
  }

  function albumMenu(id: string, name: string) {
    setSheet({
      title: name,
      options: [
        { label: 'Rename', icon: 'create-outline', onPress: () => ask({ title: 'Rename album', initial: name, onSubmit: (n) => renameAlbum(id, n) }) },
        {
          label: 'Delete album (keeps images)',
          icon: 'trash-outline',
          destructive: true,
          onPress: () => {
            deleteAlbum(id);
            if (filters.album === id) update({ album: null });
          },
        },
      ],
    });
  }

  function dateMenu() {
    setSheet({
      title: 'Saved',
      options: (Object.keys(RANGE_LABELS) as DateRange[]).map((r) => ({
        label: RANGE_LABELS[r],
        selected: filters.range === r,
        onPress: () => update({ range: r }),
      })),
    });
  }

  const selectedKeys = selected ? [...selected] : [];
  const viewerIndex = viewerKey ? shown.findIndex((i) => i.key === viewerKey) : -1;

  if (vault.error) return <Centered icon="alert-circle-outline" title={vault.error} />;
  if (!vault.ready) return <Centered loading title="Opening your vault…" />;

  return (
    <View style={styles.root}>
      {/* Header */}
      {selected ? (
        <View style={styles.header}>
          <Pressable hitSlop={8} onPress={() => setSelected(null)}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{selected.size} selected</Text>
          <Pressable hitSlop={8} onPress={() => setSelected(new Set(shown.map((i) => i.key)))}>
            <Text style={styles.link}>Select all</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Vault</Text>
            <Text style={styles.sub}>{exporting ?? `${shown.length} of ${vault.images.length} · encrypted`}</Text>
          </View>
          <Pressable
            style={[styles.exportBtn, (exporting || shown.length === 0) && styles.disabled]}
            disabled={!!exporting || shown.length === 0}
            onPress={() => runExport(shown)}
          >
            {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
            <Text style={styles.exportText}>{shown.length === vault.images.length ? 'Export all' : `Export ${shown.length}`}</Text>
          </Pressable>
        </View>
      )}

      {vault.migrating && (
        <View style={styles.banner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.bannerText}>
            Encrypting your images… {vault.migrating.done}/{vault.migrating.total}
          </Text>
        </View>
      )}

      {/* Albums */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
        <Chip label={`All · ${vault.images.length}`} icon="images-outline" active={filters.album === null} onPress={() => update({ album: null })} />
        {vault.albums.map((a) => (
          <Chip
            key={a.id}
            label={`${a.name} · ${albumCounts.get(a.id) ?? 0}`}
            icon="albums-outline"
            active={filters.album === a.id}
            onPress={() => update({ album: a.id })}
            onLongPress={() => albumMenu(a.id, a.name)}
          />
        ))}
        <Chip label="New album" icon="add" onPress={() => ask({ title: 'New album', confirmLabel: 'Create', onSubmit: (n) => createAlbum(n) })} />
      </ScrollView>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
        <Chip
          small
          label={filters.sort === 'newest' ? 'Newest' : 'Oldest'}
          icon="swap-vertical"
          onPress={() => update({ sort: filters.sort === 'newest' ? 'oldest' : 'newest' })}
        />
        <Chip small label={RANGE_LABELS[filters.range]} icon="calendar-outline" active={filters.range !== 'any'} onPress={dateMenu} />
        {sources.length > 1 &&
          sources.map((s) => {
            const site = s === 'other' ? null : SITES[s as SiteId];
            return (
              <Chip
                small
                key={s}
                label={site?.name ?? 'Other'}
                icon={site?.icon ?? 'globe-outline'}
                active={filters.source === s}
                onPress={() => update({ source: filters.source === s ? null : s })}
              />
            );
          })}
      </ScrollView>

      {shown.length === 0 ? (
        <Centered
          icon="images-outline"
          title={vault.images.length === 0 ? 'Your Vault is empty' : 'Nothing matches these filters'}
          text={vault.images.length === 0 ? 'Open a site from Home and tap ⬇ on any image, or use “Save all”.' : undefined}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.key}
          numColumns={COLUMNS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP, paddingBottom: selected ? 90 : 16 }}
          initialNumToRender={24}
          windowSize={7}
          renderItem={({ item }) => (
            <Tile
              item={item}
              size={tile}
              selecting={!!selected}
              checked={!!selected?.has(item.key)}
              onPress={() => (selected ? toggle(item.key) : setViewerKey(item.key))}
              onLongPress={() => toggle(item.key)}
            />
          )}
        />
      )}

      {/* Actions for the selection */}
      {selected && (
        <View style={styles.actionBar}>
          <Action icon="albums-outline" label="Album" onPress={() => chooseAlbum(selectedKeys, () => setSelected(null))} />
          <Action
            icon="cloud-upload-outline"
            label="Export"
            onPress={() => {
              const keys = new Set(selectedKeys);
              setSelected(null);
              runExport(shown.filter((i) => keys.has(i.key)));
            }}
          />
          <Action icon="trash-outline" label="Delete" color={colors.danger} onPress={() => confirmDelete(selectedKeys, () => setSelected(null))} />
        </View>
      )}

      <Viewer
        images={shown}
        index={viewerIndex}
        albumName={albumName}
        onIndex={(i) => setViewerKey(shown[i]?.key ?? null)}
        onClose={() => setViewerKey(null)}
        onAlbum={(img) => chooseAlbum([img.key])}
        onDelete={(img) => {
          const next = shown[viewerIndex + 1] ?? shown[viewerIndex - 1];
          confirmDelete([img.key], () => setViewerKey(next && next.key !== img.key ? next.key : null));
        }}
      />

      <Sheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
      {prompt && (
        <NamePrompt
          key={promptId}
          visible
          title={prompt.title}
          initial={prompt.initial}
          confirmLabel={prompt.confirmLabel}
          onClose={() => setPrompt(null)}
          onSubmit={(name) => {
            setPrompt(null);
            prompt.onSubmit(name);
          }}
        />
      )}
    </View>
  );
}

const Tile = memo(function Tile({
  item,
  size,
  selecting,
  checked,
  onPress,
  onLongPress,
}: {
  item: VaultImage;
  size: number;
  selecting: boolean;
  checked: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const uri = useThumb(item.key);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={300}>
      <View style={{ width: size, height: size, backgroundColor: colors.card }}>
        {uri && <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={100} />}
        {selecting && (
          <View style={[StyleSheet.absoluteFill, checked && styles.tileChecked]}>
            <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={checked ? colors.accent : '#fff'} style={styles.check} />
          </View>
        )}
      </View>
    </Pressable>
  );
});

function Viewer({
  images,
  index,
  albumName,
  onIndex,
  onClose,
  onAlbum,
  onDelete,
}: {
  images: VaultImage[];
  index: number;
  albumName: (id: string | null) => string | undefined;
  onIndex: (i: number) => void;
  onClose: () => void;
  onAlbum: (img: VaultImage) => void;
  onDelete: (img: VaultImage) => void;
}) {
  const { width, height } = useWindowDimensions();
  const img = index >= 0 ? images[index] : null;

  async function share(i: VaultImage) {
    try {
      const file = await decryptToTempFile(i);
      await whileUnlocked(() => Sharing.shareAsync(file.uri, { mimeType: mimeOf(i.ext) }));
    } catch {
      // Share sheet closed or failed; nothing to do.
    }
  }

  return (
    <Modal visible={!!img} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.viewer}>
        {img && (
          <FlatList
            data={images}
            keyExtractor={(i) => i.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => onIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            windowSize={3}
            extraData={index}
            renderItem={({ item, index: i }) => (
              // Only decrypt the image on screen and its neighbours.
              <FullImage img={Math.abs(i - index) <= 1 ? item : null} width={width} height={height - 170} />
            )}
          />
        )}
        {img && (
          <Text style={styles.info} numberOfLines={1}>
            {SITES[img.source as SiteId]?.name ?? 'Saved'} · {new Date(img.savedAt).toLocaleDateString()}
            {img.album ? ` · ${albumName(img.album) ?? ''}` : ''}
          </Text>
        )}
        <View style={styles.viewerBar}>
          <Action icon="close" label="Close" onPress={onClose} />
          <Action icon="albums-outline" label="Album" onPress={() => img && onAlbum(img)} />
          <Action icon="share-social-outline" label="Share" onPress={() => img && share(img)} />
          <Action icon="trash-outline" label="Delete" color={colors.danger} onPress={() => img && onDelete(img)} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function FullImage({ img, width, height }: { img: VaultImage | null; width: number; height: number }) {
  const uri = useFullImage(img);
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={{ width, height }} contentFit="contain" /> : <ActivityIndicator color={colors.muted} />}
    </View>
  );
}

function Chip({
  label,
  icon,
  active,
  small,
  onPress,
  onLongPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  small?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const color = active ? '#fff' : colors.text;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}>
      {icon && <Ionicons name={icon} size={small ? 14 : 16} color={color} />}
      <Text style={[styles.chipText, small && { fontSize: 12 }, { color }]}>{label}</Text>
    </Pressable>
  );
}

function Action({ icon, label, onPress, color = colors.text }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.action} hitSlop={8}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function Centered({ icon, title, text, loading }: { icon?: keyof typeof Ionicons.glyphMap; title: string; text?: string; loading?: boolean }) {
  return (
    <View style={styles.empty}>
      {loading ? <ActivityIndicator color={colors.accent} /> : icon && <Ionicons name={icon} size={52} color={colors.dim} />}
      <Text style={styles.emptyTitle}>{title}</Text>
      {text && <Text style={styles.emptyText}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, minHeight: 60 },
  title: { flex: 1, color: colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 1 },
  link: { color: colors.accent, fontWeight: '700' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  exportText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 12, backgroundColor: colors.card },
  bannerText: { color: colors.text, fontSize: 13 },
  chipRow: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 12, paddingVertical: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 5 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '600' },
  tileChecked: { backgroundColor: 'rgba(230,0,35,0.25)' },
  check: { position: 'absolute', top: 6, right: 6 },
  actionBar: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderRadius: 18, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  action: { alignItems: 'center', gap: 4, minWidth: 64 },
  actionLabel: { fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, backgroundColor: colors.bg },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between' },
  info: { color: colors.muted, textAlign: 'center', fontSize: 12, paddingHorizontal: 16 },
  viewerBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 },
});
