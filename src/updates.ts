import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';

const GITHUB_REPO = 'rdzaman62446-design/PinVault';

export function compareVersions(a: string, b: string) {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Small updates (JS only): download in the background, then offer a restart.
async function checkOverTheAirUpdate() {
  if (__DEV__ || !Updates.isEnabled) return;
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return;
  const fetched = await Updates.fetchUpdateAsync();
  if (!fetched.isNew) return;
  Alert.alert('Update ready', 'A new version was downloaded.', [
    { text: 'Later', style: 'cancel' },
    { text: 'Restart now', onPress: () => Updates.reloadAsync() },
  ]);
}

// Big updates (native changes): a newer GitHub Release means a new APK to install.
async function checkNewApkRelease(): Promise<boolean> {
  const current = Application.nativeApplicationVersion;
  if (!current) return false;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return false;
  const release: { tag_name: string; html_url: string; assets?: { name: string; browser_download_url: string }[] } = await res.json();
  if (compareVersions(release.tag_name, current) <= 0) return false;
  const apk = release.assets?.find((a) => a.name.endsWith('.apk'));
  Alert.alert('New app version', `Version ${release.tag_name.replace(/^v/, '')} is available (you have ${current}). Your saved images are kept.`, [
    { text: 'Later', style: 'cancel' },
    { text: 'Download', onPress: () => Linking.openURL(apk?.browser_download_url ?? release.html_url) },
  ]);
  return true;
}

export function useUpdateCheck() {
  useEffect(() => {
    checkNewApkRelease()
      .catch(() => false)
      .then((shown) => (shown ? undefined : checkOverTheAirUpdate()))
      .catch(() => {});
  }, []);
}
