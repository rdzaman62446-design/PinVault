import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { whileUnlocked } from './lock';
import { listImages } from './vault';
import { writeZip } from './zip';

/** Packs every Vault image into one ZIP and opens the share sheet (pick Drive to choose an account). */
export async function exportAllToShare(onProgress: (done: number, total: number) => void) {
  const images = listImages();
  if (images.length === 0) return;

  // Remove earlier exports; they're only needed until the receiving app has copied them.
  for (const f of Paths.cache.list()) {
    if (f instanceof File && f.name.startsWith('PinVault-export-')) f.delete();
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = new File(Paths.cache, `PinVault-export-${stamp}.zip`);
  out.create();

  await writeZip(
    images.map((img) => ({ name: img.name, read: () => new File(img.uri).bytes() })),
    (chunk) => out.write(chunk, { append: true }),
    onProgress,
  );

  await whileUnlocked(() =>
    Sharing.shareAsync(out.uri, { mimeType: 'application/zip', dialogTitle: 'Save to Google Drive' }),
  );
}
