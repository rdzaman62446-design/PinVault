import { AESEncryptionKey, AESKeySize, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// One AES-256 key for the whole vault, kept in Android's hardware-backed keystore (via SecureStore).
const KEY_NAME = 'pinvault-vault-key-v1';
const SEALED = { ivLength: 12, tagLength: 16 } as const;

let keyPromise: Promise<AESEncryptionKey> | null = null;

/**
 * Loads the vault key. Creates one only when `allowCreate` is true (a brand-new vault);
 * otherwise a missing key is an error, so existing encrypted data is never orphaned silently.
 */
export function getKey(allowCreate: boolean): Promise<AESEncryptionKey> {
  keyPromise ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY_NAME);
    if (stored) return AESEncryptionKey.import(stored, 'base64');
    if (!allowCreate) throw new Error('Vault key missing');
    const key = await AESEncryptionKey.generate(AESKeySize.AES256);
    await SecureStore.setItemAsync(KEY_NAME, await key.encoded('base64'));
    return key;
  })();
  keyPromise.catch(() => {
    keyPromise = null;
  });
  return keyPromise;
}

export async function encrypt(plain: Uint8Array): Promise<Uint8Array> {
  const sealed = await aesEncryptAsync(plain, await getKey(false), { nonce: { length: SEALED.ivLength }, tagLength: SEALED.tagLength });
  return sealed.combined();
}

export async function decrypt(combined: Uint8Array): Promise<Uint8Array> {
  return aesDecryptAsync(AESSealedData.fromCombined(combined, SEALED), await getKey(false));
}

export async function decryptBase64(combined: Uint8Array): Promise<string> {
  return aesDecryptAsync(AESSealedData.fromCombined(combined, SEALED), await getKey(false), { output: 'base64' });
}
