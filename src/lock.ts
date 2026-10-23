import * as LocalAuthentication from 'expo-local-authentication';

// While true, leaving the app (e.g. for the share sheet) doesn't re-lock it.
let keepUnlocked = false;

export function shouldLockOnBackground() {
  return !keepUnlocked;
}

export async function whileUnlocked<T>(fn: () => Promise<T>): Promise<T> {
  keepUnlocked = true;
  try {
    return await fn();
  } finally {
    // The share sheet may resolve before we're back in front; wait a moment.
    setTimeout(() => {
      keepUnlocked = false;
    }, 1500);
  }
}

export type UnlockResult = { ok: true } | { ok: false; message: string };

export async function unlock(): Promise<UnlockResult> {
  const [hasHardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  const biometricsReady = hasHardware && enrolled;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock PinVault',
    cancelLabel: 'Cancel',
    // Biometrics only. If the phone has no fingerprint/face set up, fall back to the screen lock.
    disableDeviceFallback: biometricsReady,
  });
  if (result.success) return { ok: true };
  if (result.error === 'not_enrolled' || result.error === 'passcode_not_set') {
    return { ok: false, message: 'Set up a fingerprint or face unlock in your phone settings first.' };
  }
  if (result.error === 'lockout') {
    return { ok: false, message: 'Too many tries. Wait a little, then try again.' };
  }
  return { ok: false, message: 'Locked' };
}
