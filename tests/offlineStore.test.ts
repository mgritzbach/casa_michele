import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyMutation, editEvent, enqueue, projectEvent, readEvent, resolveConflict, mergeSnapshot, emptySnapshot } from '../services/offlineStore';
import { eventCodeFromUrl, eventJoinUrl } from '../services/links';

const eventCode = () => crypto.randomUUID();
describe('durable bartender workspace', () => {
  it('retains a guest ordering setting across restart and replays rapid toggles in order', async () => {
    const code = eventCode();
    await enqueue(code, { kind: 'settings', key: 'settings:guestOrdering', allowOutOfStockOrders: true });
    expect(projectEvent(await readEvent(code)).allowOutOfStockOrders).toBe(true);
    await enqueue(code, { kind: 'settings', key: 'settings:guestOrdering', allowOutOfStockOrders: false });
    const cache = await readEvent(code);
    expect(cache.outbox.map(item => item.expectedRevision)).toEqual([0, 1]);
    expect(projectEvent(cache).allowOutOfStockOrders).toBe(false);
  });
  it('keeps a saved policy over remote snapshots and accepts the server after conflict resolution', async () => {
    const code = eventCode();
    await enqueue(code, { kind: 'settings', key: 'settings:guestOrdering', allowOutOfStockOrders: true });
    await editEvent(code, cache => { cache.snapshot.allowOutOfStockOrders = false; cache.snapshot.revisions['settings:guestOrdering'] = 3; });
    expect(projectEvent(await readEvent(code)).allowOutOfStockOrders).toBe(true);
    const resolved = await resolveConflict(code, 'settings:guestOrdering', false);
    expect(projectEvent(resolved).allowOutOfStockOrders).toBe(false);
    const current = emptySnapshot(); current.allowOutOfStockOrders = true; current.revisions['settings:guestOrdering'] = 4;
    expect(mergeSnapshot(current, resolved.snapshot).allowOutOfStockOrders).toBe(true);
  });
  it('keeps a conflicting local edit visible even when the server has a newer revision', async () => {
    const code = eventCode();
    await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false });
    await editEvent(code, cache => { cache.snapshot.availability.Gin = false; cache.snapshot.revisions['stock:Gin'] = 7; });
    expect(projectEvent(await readEvent(code)).availability.Gin).toBe(true);
    expect((await readEvent(code)).snapshot.revisions['stock:Gin']).toBe(7);
  });
  it('does not revert acknowledged data when an older network response arrives late', () => {
    const current = emptySnapshot(); current.availability.Gin = true; current.revisions['stock:Gin'] = 4;
    const incoming = emptySnapshot(); incoming.availability.Gin = false; incoming.revisions['stock:Gin'] = 3;
    const merged = mergeSnapshot(current, incoming);
    expect(merged.availability.Gin).toBe(true);
    expect(merged.revisions['stock:Gin']).toBe(4);
  });
  it('restores an unsent stock change from a new database connection', async () => {
    const code = eventCode();
    await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false });
    const restored = await readEvent(code);
    expect(restored.outbox).toHaveLength(1);
    expect(projectEvent(restored).availability.Gin).toBe(true);
  });
  it('keeps all edits when two tabs write concurrently', async () => {
    const code = eventCode();
    await Promise.all([
      enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false }),
      enqueue(code, { kind: 'stock', key: 'stock:Rum', ingredient: 'Rum', isAvailable: false }),
    ]);
    expect((await readEvent(code)).outbox).toHaveLength(2);
  });
  it('never loses pending changes when a remote snapshot arrives', async () => {
    const code = eventCode();
    await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false });
    await editEvent(code, cache => { cache.snapshot.availability = { Gin: false, Rum: true }; });
    const merged = projectEvent(await readEvent(code));
    expect(merged.availability).toEqual({ Gin: true, Rum: true });
  });
  it('chains local versions so rapid toggles sync in order', async () => {
    const code = eventCode();
    await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false });
    await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: true });
    const cache = await readEvent(code);
    expect(cache.outbox.map(item => item.expectedRevision)).toEqual([0, 1]);
    expect(projectEvent(cache).availability.Gin).toBe(false);
  });
  it('acknowledges only the sent edit while retaining edits made during a request', async () => {
    const code = eventCode();
    const first = (await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false })).outbox[0];
    await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: true });
    await editEvent(code, cache => {
      applyMutation(cache.snapshot, first, 1);
      cache.outbox = cache.outbox.filter(item => item.id !== first.id);
    });
    expect((await readEvent(code)).outbox).toHaveLength(1);
    expect(projectEvent(await readEvent(code)).availability.Gin).toBe(false);
  });
  it('preserves unrelated edits when accepting a conflicting server version', async () => {
    const code = eventCode();
    await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false });
    await enqueue(code, { kind: 'stock', key: 'stock:Rum', ingredient: 'Rum', isAvailable: false });
    const cache = await resolveConflict(code, 'stock:Gin', false);
    expect(cache.outbox.map(item => item.key)).toEqual(['stock:Rum']);
  });
  it('requires a new mutation identity and rebases after choosing a local conflict', async () => {
    const code = eventCode();
    const first = (await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false })).outbox[0];
    await editEvent(code, cache => { cache.snapshot.revisions['stock:Gin'] = 7; cache.outbox[0].error = 'Changed remotely'; });
    const cache = await resolveConflict(code, 'stock:Gin', true);
    expect(cache.outbox[0].expectedRevision).toBe(7);
    expect(cache.outbox[0].id).not.toBe(first.id);
    expect(cache.outbox[0].error).toBeUndefined();
  });
  it('keeps offline walk-in orders and status changes together across restart', async () => {
    const code = eventCode(); const id = crypto.randomUUID();
    const order = { id, eventCode: code, guestName: 'Alex', cocktailId: 'gin-fizz', cocktailName: 'Gin Fizz', status: 'pending' as const, timestamp: Date.now() };
    await enqueue(code, { kind: 'order', key: `order:${id}`, order });
    await enqueue(code, { kind: 'status', key: `order:${id}`, orderId: id, status: 'completed' });
    const cache = await readEvent(code);
    expect(projectEvent(cache).orders).toHaveLength(1);
    expect(projectEvent(cache).orders[0].status).toBe('completed');
    expect(cache.outbox[1].expectedRevision).toBe(1);
  });
  it('isolates event caches', async () => {
    const code = eventCode();
    await enqueue(code, { kind: 'stock', key: 'stock:Gin', ingredient: 'Gin', isAvailable: false });
    expect((await readEvent(eventCode())).outbox).toHaveLength(0);
  });
});
describe('cross-platform join links', () => {
  it('always generates a public HTTPS link instead of a WebView origin', () => {
    expect(eventJoinUrl(' party123 ')).toBe('https://casa-michele.mic-gritzbach.workers.dev/?code=PARTY123');
  });
  it('accepts public links and explicit Android app links', () => {
    expect(eventCodeFromUrl(eventJoinUrl('PARTY123'))).toBe('PARTY123');
    expect(eventCodeFromUrl('casamichele://join?code=party123')).toBe('PARTY123');
  });
  it('rejects lookalike hosts and malformed codes', () => {
    expect(eventCodeFromUrl('https://casa-michele.mic-gritzbach.workers.dev.evil.test/?code=PARTY123')).toBeNull();
    expect(eventCodeFromUrl('casamichele://join?code=../../')).toBeNull();
    expect(() => eventJoinUrl('BAD CODE')).toThrow();
  });
});
