import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkGithubRelease, compareVersions, RELEASES_URL, selectRelease } from '../services/updates';
const hash = 'a'.repeat(64);
const release = (version: string, suffix = '-preview') => ({
  tag_name: `v${version}${suffix}`, draft: false, published_at: '2026-10-31', assets: [{
    name: `CasaMichele-v${version}${suffix}.apk`, state: 'uploaded', size: 6000000, digest: `sha256:${hash}`,
    browser_download_url: `${RELEASES_URL}/download/v${version}${suffix}/CasaMichele-v${version}${suffix}.apk`,
  }],
});
afterEach(() => vi.unstubAllGlobals());
describe('GitHub app updates', () => {
  it('chooses the newest numeric version in the installation channel, including prereleases', () => {
    expect(selectRelease([release('5.9.0'), release('5.10.0'), release('9.0.0', '')])?.version).toBe('5.10.0');
    expect(selectRelease([release('5.9.0'), release('9.0.0', '')], 'com.casamichele.app')?.version).toBe('9.0.0');
    expect(compareVersions('5.2.0', '5.2.0')).toBe(0);
    expect(compareVersions('5.2.0', '5.10.0')).toBe(-1);
  });
  it('ignores drafts, unfinished uploads, missing hashes and foreign downloads', () => {
    const draft = { ...release('8.0.0'), draft: true };
    const incomplete = release('8.1.0'); incomplete.assets[0].state = 'new';
    const unhashed = release('8.2.0'); unhashed.assets[0].digest = '';
    const foreign = release('8.3.0'); foreign.assets[0].browser_download_url = 'https://example.com/update.apk';
    expect(selectRelease([draft, incomplete, unhashed, foreign, release('5.2.0')])?.version).toBe('5.2.0');
    expect(selectRelease([draft, incomplete, unhashed, foreign])).toBeNull();
    expect(() => selectRelease({})).toThrow('invalid release list');
  });
  it('reports offline and rate limits without a false up-to-date result', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(checkGithubRelease()).rejects.toThrow('Connect to the internet');
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', { onLine: true });
    fetch.mockResolvedValue(new Response('', { status: 403 }));
    await expect(checkGithubRelease()).rejects.toThrow('limiting update checks');
  });
});
