import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventCodeFromUrl } from '../services/links';

afterEach(() => vi.unstubAllGlobals());

describe('Android join links', () => {
  it('accepts the custom route without relying on a WebView URL parser for non-HTTP schemes', () => {
    const BrowserURL = URL;
    vi.stubGlobal('URL', class extends BrowserURL {
      constructor(value: string, base?: string | URL) {
        if (value.startsWith('casamichele:')) throw new Error('Non-HTTP parser unavailable');
        super(value, base);
      }
    });
    expect(eventCodeFromUrl('casamichele://join?code=NATIVEQA')).toBe('NATIVEQA');
    expect(eventCodeFromUrl('casamichele://join/?code=party42#menu')).toBe('PARTY42');
  });

  it('rejects lookalike authorities, paths and non-HTTP localhost links', () => {
    for (const value of [
      'casamichele://join.evil?code=PARTY42',
      'casamichele://user@join?code=PARTY42',
      'casamichele://join/other?code=PARTY42',
      'casamichele://join?code=bad%20code',
      'javascript://localhost?code=PARTY42',
    ]) expect(eventCodeFromUrl(value)).toBeNull();
  });
});
