import { Zip, ZipPassThrough } from 'fflate';

export type ZipSource = { name: string; read: () => Promise<Uint8Array> };

/**
 * Streams files into a ZIP one at a time, so only one image is in memory at once.
 * Images are already compressed, so entries are stored without compression.
 */
export async function writeZip(
  files: ZipSource[],
  write: (chunk: Uint8Array) => Promise<void>,
  onProgress: (done: number, total: number) => void = () => {},
) {
  let pending: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, data) => {
    if (err) failure = err;
    else pending.push(data);
  });
  const flush = async () => {
    const chunks = pending;
    pending = [];
    for (const c of chunks) await write(c);
    if (failure) throw failure;
  };

  for (let i = 0; i < files.length; i++) {
    const entry = new ZipPassThrough(files[i].name);
    zip.add(entry);
    entry.push(await files[i].read(), true);
    await flush();
    onProgress(i + 1, files.length);
  }
  zip.end();
  await flush();
}
