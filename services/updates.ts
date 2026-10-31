import { registerPlugin } from '@capacitor/core';
import metadata from '../package.json';
export const APP_VERSION = metadata.version;
export const RELEASES_URL = 'https://github.com/mgritzbach/casa_michele/releases';
export const RELEASES_API = 'https://api.github.com/repos/mgritzbach/casa_michele/releases?per_page=100';
export interface AppRelease { version: string; url: string; downloadUrl: string; sha256: string; size: number }
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
export function selectRelease(data: unknown, packageName = 'com.casamichele.app.preview'): AppRelease | null {
  if (!Array.isArray(data)) throw new Error('GitHub returned an invalid release list. Please try again.');
  const suffix = packageName === 'com.casamichele.app.preview' ? '-preview' : packageName === 'com.casamichele.app' ? '' : null;
  if (suffix === null) throw new Error('This installation uses an unsupported update channel.');
  const candidates: AppRelease[] = [];
  for (const item of data) {
    if (!item || item.draft || !item.published_at || typeof item.tag_name !== 'string') continue;
    const match = item.tag_name.match(/^v(\d+\.\d+\.\d+)(-preview)?$/);
    if (!match || (match[2] || '') !== suffix) continue;
    const name = `CasaMichele-v${match[1]}${suffix}.apk`;
    const url = `${RELEASES_URL}/tag/${item.tag_name}`;
    const downloadUrl = `${RELEASES_URL}/download/${item.tag_name}/${name}`;
    const asset = Array.isArray(item.assets) && item.assets.find(a => a.name === name && a.state === 'uploaded' && a.browser_download_url === downloadUrl);
    if (!asset || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '') || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 100 * 1024 * 1024) continue;
    candidates.push({ version: match[1], url, downloadUrl, sha256: asset.digest.slice(7).toLowerCase(), size: asset.size });
  }
  return candidates.sort((a, b) => compareVersions(b.version, a.version))[0] || null;
}
export async function checkGithubRelease(packageName?: string): Promise<AppRelease | null> {
  if (!navigator.onLine) throw new Error('Connect to the internet to check for updates. Your bar still works offline.');
  let response: Response;
  try { response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('Could not reach GitHub. Check your connection and try again.'); }
  if (response.status === 403 || response.status === 429) throw new Error('GitHub is limiting update checks. Please try again later.');
  if (!response.ok) throw new Error('Could not check GitHub releases. Please try again.');
  return selectRelease(await response.json(), packageName);
}
export const NativeUpdater = registerPlugin<{
  install(options: { url: string; sha256: string }): Promise<{ status: 'permission' | 'installer' }>;
}>('CasaUpdater');
export function openUpdates() { window.dispatchEvent(new Event('casa:updates')); }
