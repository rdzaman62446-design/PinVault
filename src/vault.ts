import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { strFromU8, strToU8 } from 'fflate';
import { useSyncExternalStore } from 'react';

import { decrypt, decryptBase64, encrypt, getKey } from './crypto';
import { candidateUrls, extensionOf, imageId, mimeOf } from './imageUrls';
import { type Album, parseLegacyName, type SourceId, type VaultImage } from './vaultFilters';

// Layout (app-private storage, invisible to other apps and the Gallery). Everything is AES-256-GCM encrypted:
//   vault/index.bin     JSON list of images and albums
//   vault/img/<key>     original image
//   vault/thumb/<key>   small JPEG preview for the grid

function dir(...parts: (Directory | string)[]): Directory {
  const d = new Directory(...parts);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}
const rootDir = () => dir(Paths.document, 'vault');
const imgDir = () => dir(rootDir(), 'img');
const thumbDir = () => dir(rootDir(), 'thumb');
const tempDir = () => dir(Paths.cache, 'pv-temp');

export type VaultState = {
  ready: boolean;
  error: string | null;
  images: VaultImage[];
  albums: Album[];
  /** Progress while v1.1 plain images are being encrypted. */
  migrating: { done: number; total: number } | null;
};

let state: VaultState = { ready: false, error: null, images: [], albums: [], migrating: null };
const listeners = new Set<() => void>();

function set(patch: Partial<VaultState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useVault(): VaultState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

async function writeEncrypted(file: File, plain: Uint8Array) {
  const sealed = await encrypt(plain);
  file.create({ overwrite: true });
  await file.write(sealed);
}

// Index writes run one after another, each with the state at the time it was queued.
let writeQueue: Promise<void> = Promise.resolve();
function persist(): Promise<void> {
  const snapshot = JSON.stringify({ v: 1, images: state.images, albums: state.albums });
  writeQueue = writeQueue
    .then(async () => {
      const tmp = new File(rootDir(), 'index.tmp');
      await writeEncrypted(tmp, strToU8(snapshot));
      tmp.moveSync(new File(rootDir(), 'index.bin'), { overwrite: true });
    })
    .catch(() => {});
  return writeQueue;
}

let initPromise: Promise<void> | null = null;

/** Loads the encrypted index (after unlock). Safe to call many times. */
export function initVault(): Promise<void> {
  initPromise ??= (async () => {
    try {
      const index = new File(rootDir(), 'index.bin');
      await getKey(!index.exists);
      if (index.exists) {
        const data = JSON.parse(strFromU8(await decrypt(await index.bytes())));
        set({ images: data.images ?? [], albums: data.albums ?? [] });
      }
      set({ ready: true });
      // Leftover shared/exported plain files from an earlier session.
      tempDir().delete();
      for (const f of Paths.cache.list()) if (f instanceof File && f.name.startsWith('PinVault-export-')) f.delete();
      await migrateLegacy();
    } catch {
      set({ error: "Couldn't open the vault. Please restart the app." });
      initPromise = null;
    }
  })();
  return initPromise;
}

/** v1.0/1.1 kept plain images directly in vault/. Encrypt them into the new layout. */
async function migrateLegacy() {
  const legacy = rootDir()
    .list()
    .filter((f): f is File => f instanceof File && parseLegacyName(f.name) !== null);
  if (legacy.length === 0) return;
  set({ migrating: { done: 0, total: legacy.length } });
  for (let i = 0; i < legacy.length; i++) {
    const f = legacy[i];
    const meta = parseLegacyName(f.name)!;
    try {
      if (!state.images.some((x) => x.id === meta.id)) await store(f, { ...meta, album: null, url: '' });
      f.delete();
    } catch {
      // Leave the file; it's retried next launch.
    }
    set({ migrating: { done: i + 1, total: legacy.length } });
  }
  set({ migrating: null });
}

async function makeThumb(uri: string): Promise<Uint8Array | null> {
  try {
    const ref = await ImageManipulator.manipulate(uri).resize({ width: 360 }).renderAsync();
    const out = await ref.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
    const f = new File(out.uri);
    const bytes = await f.bytes();
    f.delete();
    return bytes;
  } catch {
    return null;
  }
}

async function store(plain: File, meta: Omit<VaultImage, 'key'>) {
  const key = randomUUID();
  const bytes = await plain.bytes();
  const thumb = (await makeThumb(plain.uri)) ?? bytes;
  await writeEncrypted(new File(imgDir(), key), bytes);
  await writeEncrypted(new File(thumbDir(), key), thumb);
  set({ images: [{ key, ...meta }, ...state.images] });
  await persist();
}

export type SaveResult = 'saved' | 'duplicate';

export async function saveFromUrl(src: string, source: SourceId, referer: string, album: string | null = null): Promise<SaveResult> {
  await initVault();
  const id = imageId(src);
  if (state.images.some((i) => i.id === id)) return 'duplicate';

  let lastError: unknown = new Error('No image URL');
  for (const url of candidateUrls(src)) {
    const tmp = new File(tempDir(), `dl-${randomUUID()}`);
    try {
      const downloaded = await File.downloadFileAsync(url, tmp, { headers: { Referer: referer } });
      if (!downloaded.exists || downloaded.size < 1024) throw new Error('Empty download');
      await store(downloaded, { id, source, ext: extensionOf(url), savedAt: Date.now(), album, url: src });
      return 'saved';
    } catch (e) {
      lastError = e;
    } finally {
      if (tmp.exists) tmp.delete();
    }
  }
  throw lastError;
}

// Decrypted grid previews, kept in memory only.
const thumbCache = new Map<string, string>();

export function cachedThumb(key: string): string | undefined {
  return thumbCache.get(key);
}

export async function loadThumb(key: string): Promise<string> {
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const uri = `data:image/jpeg;base64,${await decryptBase64(await new File(thumbDir(), key).bytes())}`;
  if (thumbCache.size > 400) thumbCache.delete(thumbCache.keys().next().value!);
  thumbCache.set(key, uri);
  return uri;
}

export async function loadFull(img: VaultImage): Promise<string> {
  return `data:${mimeOf(img.ext)};base64,${await decryptBase64(await new File(imgDir(), img.key).bytes())}`;
}

export async function readImageBytes(img: VaultImage): Promise<Uint8Array> {
  return decrypt(await new File(imgDir(), img.key).bytes());
}

export function exportName(img: VaultImage): string {
  return `${img.source}_${new Date(img.savedAt).toISOString().slice(0, 10)}_${img.id}.${img.ext}`;
}

/** Writes a decrypted copy for sharing; it's removed the next time the app starts. */
export async function decryptToTempFile(img: VaultImage): Promise<File> {
  const f = new File(tempDir(), exportName(img));
  f.create({ overwrite: true });
  await f.write(await readImageBytes(img));
  return f;
}

export async function deleteImages(keys: string[]) {
  const gone = new Set(keys);
  for (const key of keys) {
    for (const d of [imgDir(), thumbDir()]) {
      const f = new File(d, key);
      if (f.exists) f.delete();
    }
    thumbCache.delete(key);
  }
  set({ images: state.images.filter((i) => !gone.has(i.key)) });
  await persist();
}

export async function createAlbum(name: string): Promise<string> {
  const album: Album = { id: randomUUID(), name: name.trim() || 'Album', createdAt: Date.now() };
  set({ albums: [...state.albums, album] });
  await persist();
  return album.id;
}

export async function renameAlbum(id: string, name: string) {
  set({ albums: state.albums.map((a) => (a.id === id ? { ...a, name: name.trim() || a.name } : a)) });
  await persist();
}

/** Deletes the album only; its images stay in the Vault. */
export async function deleteAlbum(id: string) {
  set({
    albums: state.albums.filter((a) => a.id !== id),
    images: state.images.map((i) => (i.album === id ? { ...i, album: null } : i)),
  });
  await persist();
}

export async function moveToAlbum(keys: string[], album: string | null) {
  const moving = new Set(keys);
  set({ images: state.images.map((i) => (moving.has(i.key) ? { ...i, album } : i)) });
  await persist();
}
