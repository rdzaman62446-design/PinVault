import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { imagesInAlbum, type VaultImage } from './vaultFilters';

type Layout = 'tiles' | 'cards' | 'feed';
const LAYOUTS: { id: Layout; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'tiles', label: 'Tiles', icon: 'grid-outline' },
  { id: 'cards', label: 'Cards', icon: 'albums-outline' },
  { id: 'feed', label: 'Feed', icon: 'square-outline' },
];
const LAYOUT_KEY = 'vault-layout';

/** Which album is open: 'all', an album id, or null for the albums page. */
type Open = string | null;
const ALL = 'all';

type SheetState = { title?: string; options: SheetOption[] } | null;
type Prompt = { title: string; initial?: string; confirmLabel?: string; onSubmit: (name: string) => void } | null;

export function VaultScreen() {
  const vault = useVault();
  const [open, setOpen] = useState<Open>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [promptId, setPromptId] = useState(0);

  // Back inside an album returns to the albums page.
  useEffect(() => {
    if (open === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(null);
      return true;
    });
    return () => sub.remove();
  }, [open]);

  function ask(p: NonNullable<Prompt>) {
    setPromptId((n) => n + 1);
    setPrompt(p);
  }

  // An album that was deleted while open falls back to the albums page.
  const openAlbum = open && open !== ALL ? vault.albums.find((a) => a.id === open) : null;
  const showing: Open = open === ALL || openAlbum ? open : null;

  if (vault.error) return <Centered icon="alert-circle-outline" title={vault.error} />;
  if (!vault.ready) return <Centered loading title="Opening your vault…" />;

  return (
    <View style={styles.root}>
      {showing === null ? (
        <AlbumsPage
          onOpen={setOpen}
          onNewAlbum={() => ask({ title: 'New album', confirmLabel: 'Create', onSubmit: (n) => createAlbum(n) })}
          onAlbumMenu={(id, name) =>
            setSheet({
              title: name,
              options: [
                { label: 'Rename', icon: 'create-outline', onPress: () => ask({ title: 'Rename album', initial: name, onSubmit: (n) => renameAlbum(id, n) }) },
                { label: 'Delete album (keeps images)', icon: 'trash-outline', destructive: true, onPress: () => deleteAlbum(id) },
              ],
            })
          }
        />
      ) : (
        <AlbumView
          album={showing === ALL ? null : showing}
          title={openAlbum?.name ?? 'All'}
          onBack={() => setOpen(null)}
          setSheet={setSheet}
          ask={ask}
        />
      )}

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

/** First page of the Vault: "All" followed by every album, as cover cards. */
function AlbumsPage({ onOpen, onNewAlbum, onAlbumMenu }: { onOpen: (id: string) => void; onNewAlbum: () => void; onAlbumMenu: (id: string, name: string) => void }) {
  const vault = useVault();
  const { width } = useWindowDimensions();
  const card = (width - 16 * 2 - 14) / 2;

  const albums = useMemo(() => {
    const newest = imagesInAlbum(vault.images, null);
    const byAlbum = new Map<string, VaultImage[]>();
    for (const img of newest) if (img.album) byAlbum.set(img.album, [...(byAlbum.get(img.album) ?? []), img]);
    return [
      { id: ALL, name: 'All', count: newest.length, cover: newest[0]?.key ?? null },
      ...vault.albums.map((a) => ({ id: a.id, name: a.name, count: byAlbum.get(a.id)?.length ?? 0, cover: byAlbum.get(a.id)?.[0]?.key ?? null })),
    ];
  }, [vault.images, vault.albums]);

  return (
    <ScrollView contentContainerStyle={styles.albumsPage}>
      <Text style={styles.title}>Vault</Text>
      <Text style={styles.sub}>
        {vault.images.length} images · {vault.albums.length} {vault.albums.length === 1 ? 'album' : 'albums'} · encrypted
      </Text>

      {vault.migrating && (
        <View style={styles.banner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.bannerText}>
            Encrypting your images… {vault.migrating.done}/{vault.migrating.total}
          </Text>
        </View>
      )}

      <View style={styles.albumGrid}>
        {albums.map((a) => (
          <AlbumCard
            key={a.id}
            size={card}
            name={a.name}
            count={a.count}
            cover={a.cover}
            isAll={a.id === ALL}
            onPress={() => onOpen(a.id)}
            onLongPress={a.id === ALL ? undefined : () => onAlbumMenu(a.id, a.name)}
          />
        ))}
        <Pressable style={({ pressed }) => [{ width: card }, pressed && styles.pressed]} onPress={onNewAlbum}>
          <View style={[styles.newAlbum, { width: card, height: card }]}>
            <Ionicons name="add" size={36} color={colors.muted} />
          </View>
          <Text style={styles.albumName}>New album</Text>
          <Text style={styles.albumCount}> </Text>
        </Pressable>
      </View>
      {vault.albums.length > 0 && <Text style={styles.hint}>Long-press an album to rename or delete it.</Text>}
    </ScrollView>
  );
}

function AlbumCard({
  size,
  name,
  count,
  cover,
  isAll,
  onPress,
  onLongPress,
}: {
  size: number;
  name: string;
  count: number;
  cover: string | null;
  isAll: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [{ width: size }, pressed && styles.pressed]} onPress={onPress} onLongPress={onLongPress} delayLongPress={300}>
      <View style={[styles.albumCover, { width: size, height: size }]}>
        {cover ? <CoverImage imageKey={cover} /> : <Ionicons name={isAll ? 'images-outline' : 'albums-outline'} size={36} color={colors.dim} />}
        {isAll && (
          <View style={styles.allBadge}>
            <Ionicons name="lock-closed" size={11} color="#fff" />
            <Text style={styles.allBadgeText}>ALL</Text>
          </View>
        )}
      </View>
      <Text style={styles.albumName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.albumCount}>{count === 1 ? '1 image' : `${count} images`}</Text>
    </Pressable>
  );
}

function CoverImage({ imageKey }: { imageKey: string }) {
  const uri = useThumb(imageKey);
  return uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={100} /> : null;
}

/** Images of one album (or all), in the chosen layout, with selection and the full-screen viewer. */
function AlbumView({
  album,
  title,
  onBack,
  setSheet,
  ask,
}: {
  album: string | null;
  title: string;
  onBack: () => void;
  setSheet: (s: SheetState) => void;
  ask: (p: NonNullable<Prompt>) => void;
}) {
  const vault = useVault();
  const { width } = useWindowDimensions();
  const [layout, setLayout] = useState<Layout>('tiles');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const shown = useMemo(() => imagesInAlbum(vault.images, album), [vault.images, album]);

  useEffect(() => {
    AsyncStorage.getItem(LAYOUT_KEY)
      .then((v) => v && LAYOUTS.some((l) => l.id === v) && setLayout(v as Layout))
      .catch(() => {});
  }, []);

  function chooseLayout(l: Layout) {
    setLayout(l);
    AsyncStorage.setItem(LAYOUT_KEY, l).catch(() => {});
  }

  // Back leaves selection mode before leaving the album.
  useEffect(() => {
    if (!selected) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelected(null);
      return true;
    });
    return () => sub.remove();
  }, [selected]);

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

  const selectedKeys = selected ? [...selected] : [];
  const viewerIndex = viewerKey ? shown.findIndex((i) => i.key === viewerKey) : -1;
  const columns = layout === 'tiles' ? 3 : layout === 'cards' ? 2 : 1;
  const gap = layout === 'tiles' ? 2 : 12;
  const pad = layout === 'tiles' ? 0 : 12;
  const itemWidth = (width - pad * 2 - gap * (columns - 1)) / columns;

  return (
    <View style={styles.root}>
      {selected ? (
        <View style={styles.header}>
          <Pressable hitSlop={8} onPress={() => setSelected(null)}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { flex: 1 }]}>{selected.size} selected</Text>
          <Pressable hitSlop={8} onPress={() => setSelected(new Set(shown.map((i) => i.key)))}>
            <Text style={styles.link}>Select all</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable hitSlop={8} onPress={onBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.sub}>{exporting ?? (shown.length === 1 ? '1 image' : `${shown.length} images`)}</Text>
          </View>
          <Pressable
            style={[styles.exportBtn, (exporting || shown.length === 0) && styles.disabled]}
            disabled={!!exporting || shown.length === 0}
            onPress={() => runExport(shown)}
          >
            {exporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
            <Text style={styles.exportText}>Export</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.layouts}>
        {LAYOUTS.map((l) => {
          const active = layout === l.id;
          return (
            <Pressable key={l.id} style={[styles.layoutBtn, active && styles.layoutActive]} onPress={() => chooseLayout(l.id)}>
              <Ionicons name={l.icon} size={15} color={active ? '#fff' : colors.muted} />
              <Text style={[styles.layoutText, { color: active ? '#fff' : colors.muted }]}>{l.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {shown.length === 0 ? (
        <Centered
          icon="images-outline"
          title={album ? 'This album is empty' : 'Your Vault is empty'}
          text={album ? 'Long-press images in “All”, then tap Album to move them here.' : 'Open a site from Home and tap ⬇ on any image, or use “Save all”.'}
        />
      ) : (
        <FlatList
          key={layout}
          data={shown}
          keyExtractor={(i) => i.key}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap } : undefined}
          contentContainerStyle={{ gap, padding: pad, paddingBottom: selected ? 96 : 16 }}
          initialNumToRender={layout === 'feed' ? 4 : 24}
          windowSize={layout === 'feed' ? 5 : 7}
          renderItem={({ item }) => (
            <Item
              item={item}
              layout={layout}
              width={itemWidth}
              selecting={!!selected}
              checked={!!selected?.has(item.key)}
              onPress={() => (selected ? toggle(item.key) : setViewerKey(item.key))}
              onLongPress={() => toggle(item.key)}
            />
          )}
        />
      )}

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
        albumName={(id) => vault.albums.find((a) => a.id === id)?.name}
        onIndex={(i) => setViewerKey(shown[i]?.key ?? null)}
        onClose={() => setViewerKey(null)}
        onAlbum={(img) => chooseAlbum([img.key])}
        onDelete={(img) => {
          const next = shown[viewerIndex + 1] ?? shown[viewerIndex - 1];
          confirmDelete([img.key], () => setViewerKey(next && next.key !== img.key ? next.key : null));
        }}
      />
    </View>
  );
}

const Item = memo(function Item({
  item,
  layout,
  width,
  selecting,
  checked,
  onPress,
  onLongPress,
}: {
  item: VaultImage;
  layout: Layout;
  width: number;
  selecting: boolean;
  checked: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const site = SITES[item.source as SiteId];
  const height = layout === 'tiles' ? width : layout === 'cards' ? width * 1.3 : width * 1.25;
  const radius = layout === 'tiles' ? 0 : 16;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={300}>
      <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.card }}>
        {/* Feed shows the full image; tiles and cards use the small preview. */}
        {layout === 'feed' ? <FullPhoto img={item} /> : <ThumbPhoto imageKey={item.key} />}
        {selecting && (
          <View style={[StyleSheet.absoluteFill, checked && styles.itemChecked]}>
            <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={checked ? colors.accent : '#fff'} style={styles.check} />
          </View>
        )}
      </View>
      {layout !== 'tiles' && (
        <View style={styles.caption}>
          {site && <Ionicons name={site.icon} size={13} color={site.id === 'x' ? colors.text : site.color} />}
          <Text style={styles.captionText} numberOfLines={1}>
            {site?.name ?? 'Saved'} · {new Date(item.savedAt).toLocaleDateString()}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

function ThumbPhoto({ imageKey }: { imageKey: string }) {
  const uri = useThumb(imageKey);
  return uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={100} /> : null;
}

function FullPhoto({ img }: { img: VaultImage }) {
  const thumb = useThumb(img.key);
  const full = useFullImage(img);
  const uri = full ?? thumb;
  return uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={100} /> : null;
}

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
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  // Albums page
  albumsPage: { padding: 16, paddingBottom: 32 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 4 },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 10, borderRadius: 12, backgroundColor: colors.card },
  bannerText: { color: colors.text, fontSize: 13 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 18 },
  albumCover: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  allBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  allBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  albumName: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 8 },
  albumCount: { color: colors.muted, fontSize: 12, marginTop: 1 },
  newAlbum: { borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dim, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.dim, fontSize: 12, textAlign: 'center', marginTop: 20 },
  // Album view
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, minHeight: 60 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  link: { color: colors.accent, fontWeight: '700' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  exportText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  layouts: { flexDirection: 'row', gap: 6, alignSelf: 'flex-start', marginHorizontal: 12, marginBottom: 8, padding: 3, borderRadius: 14, backgroundColor: colors.card },
  layoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 11 },
  layoutActive: { backgroundColor: colors.accent },
  layoutText: { fontSize: 12, fontWeight: '700' },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 6, paddingHorizontal: 2 },
  captionText: { flex: 1, color: colors.muted, fontSize: 12 },
  itemChecked: { backgroundColor: 'rgba(230,0,35,0.25)' },
  check: { position: 'absolute', top: 8, right: 8 },
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
