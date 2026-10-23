import { Directory, File, Paths } from 'expo-file-system';

import { candidateUrls, extensionOf, imageId } from './pinimg';

// Images live in the app's private storage: other apps and the phone's Gallery can't see them.
function vaultDir(): Directory {
  const dir = new Directory(Paths.document, 'vault');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export type VaultImage = { uri: string; name: string; savedAt: number };

/** Saved images, newest first. File names are `<savedAt>_<id>.<ext>`. */
export function listImages(): VaultImage[] {
  return vaultDir()
    .list()
    .filter((f): f is File => f instanceof File)
    .map((f) => ({ uri: f.uri, name: f.name, savedAt: parseInt(f.name.split('_')[0], 10) || 0 }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export type SaveResult = 'saved' | 'duplicate';

export async function saveFromUrl(src: string): Promise<SaveResult> {
  const dir = vaultDir();
  const id = imageId(src);
  if (dir.list().some((f) => f.name.includes(`_${id}.`))) return 'duplicate';

  let lastError: unknown = new Error('No image URL');
  for (const url of candidateUrls(src)) {
    const tmp = new File(Paths.cache, `pv-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      const downloaded = await File.downloadFileAsync(url, tmp, {
        headers: { Referer: 'https://www.pinterest.com/' },
      });
      if (!downloaded.exists || downloaded.size < 1024) throw new Error('Empty download');
      downloaded.moveSync(new File(dir, `${Date.now()}_${id}.${extensionOf(url)}`));
      return 'saved';
    } catch (e) {
      lastError = e;
      if (tmp.exists) tmp.delete();
    }
  }
  throw lastError;
}

export function deleteImage(uri: string) {
  const f = new File(uri);
  if (f.exists) f.delete();
}
