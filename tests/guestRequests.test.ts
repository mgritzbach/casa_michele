import { describe, expect, it } from 'vitest';
import { acknowledgeGuestRequest, guestRequestKey } from '../services/guestRequests';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) };
}
describe('guest order retry identity', () => {
  it('reuses the request after a lost response and reload, but creates a new one after acknowledgement', () => {
    const storage = memoryStorage();
    const id = guestRequestKey(storage, 'session', 'negroni');
    expect(guestRequestKey(storage, 'session', 'negroni')).toBe(id);
    acknowledgeGuestRequest(storage, 'session', 'negroni', id);
    expect(guestRequestKey(storage, 'session', 'negroni')).not.toBe(id);
  });
  it('isolates guests and cocktails without discarding another unresolved request', () => {
    const storage = memoryStorage();
    const id = guestRequestKey(storage, 'one', 'negroni');
    expect(guestRequestKey(storage, 'one', 'mojito')).not.toBe(id);
    expect(guestRequestKey(storage, 'one', 'negroni')).toBe(id);
    expect(guestRequestKey(storage, 'two', 'negroni')).not.toBe(id);
  });
});
