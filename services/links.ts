export const PUBLIC_APP_URL = 'https://casa-michele.mic-gritzbach.workers.dev';
export function normalizeEventCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new Error('Use an event code with 4 to 12 letters or numbers.');
  return code;
}
export function eventJoinUrl(code: string): string {
  const url = new URL(PUBLIC_APP_URL);
  url.searchParams.set('code', normalizeEventCode(code));
  return url.toString();
}
export function eventCodeFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!(url.origin === PUBLIC_APP_URL || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      || (url.protocol === 'casamichele:' && url.hostname === 'join'))) return null;
    const code = url.searchParams.get('code');
    return code ? normalizeEventCode(code) : null;
  } catch { return null; }
}
