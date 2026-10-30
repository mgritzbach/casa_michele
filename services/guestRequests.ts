// A response can be lost after the server accepts an order. Keep its retry key
// across reloads until that request is acknowledged, independently per cocktail.
export function guestRequestKey(storage: Pick<Storage, 'getItem' | 'setItem'>, sessionToken: string, cocktailId: string): string {
  const name = 'casa-guest-requests-v5';
  let saved: { session: string; requests: Record<string, string> };
  try { saved = JSON.parse(storage.getItem(name) || 'null'); } catch { saved = null; }
  if (!saved || saved.session !== sessionToken || !saved.requests) saved = { session: sessionToken, requests: {} };
  const id = saved.requests[cocktailId] || crypto.randomUUID();
  saved.requests[cocktailId] = id;
  storage.setItem(name, JSON.stringify(saved));
  return id;
}
export function acknowledgeGuestRequest(storage: Pick<Storage, 'getItem' | 'setItem'>, sessionToken: string, cocktailId: string, id: string) {
  const name = 'casa-guest-requests-v5';
  const saved = JSON.parse(storage.getItem(name) || 'null');
  if (saved?.session === sessionToken && saved.requests?.[cocktailId] === id) {
    delete saved.requests[cocktailId];
    storage.setItem(name, JSON.stringify(saved));
  }
}
