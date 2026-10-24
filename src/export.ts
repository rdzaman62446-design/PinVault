import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { whileUnlocked } from './lock';
import { exportName, readImageBytes } from './vault';
import type { VaultImage } from './vaultFilters';
import { writeZip } from './zip';

/**
 * Decrypts the given images into one ZIP and opens the share sheet (pick Drive to choose an account).
 * The plain ZIP is deleted the next time the app starts.
 */
export async function exportToShare(images: VaultImage[], onProgress: (done: number, total: number) => void) {
  if (images.length === 0) return;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = new File(Paths.cache, `PinVault-export-${stamp}.zip`);
  out.create({ overwrite: true });

  await writeZip(
    images.map((img) => ({ name: exportName(img), read: () => readImageBytes(img) })),
    (chunk) => out.write(chunk, { append: true }),
    onProgress,
  );

  await whileUnlocked(() =>
    Sharing.shareAsync(out.uri, { mimeType: 'application/zip', dialogTitle: 'Save to Google Drive' }),
  );
}
