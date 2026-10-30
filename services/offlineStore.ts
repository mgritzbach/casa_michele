import { openDB } from 'idb';
import { IngredientAvailability, Order, OrderStatus } from '../types';

export interface Snapshot {
  orders: Order[];
  availability: IngredientAvailability;
  revisions: Record<string, number>;
  savedAt: number;
}
export type Mutation = {
  id: string;
  kind: 'stock' | 'status' | 'order';
  key: string;
  expectedRevision: number;
  ingredient?: string;
  isAvailable?: boolean;
  orderId?: string;
  status?: OrderStatus;
  order?: Order;
  error?: string;
};
export interface EventCache { snapshot: Snapshot; outbox: Mutation[] }
export const emptySnapshot = (): Snapshot => ({ orders: [], availability: {}, revisions: {}, savedAt: 0 });
const db = () => openDB('casa-michele-v5', 1, {
  upgrade(database) { database.createObjectStore('events'); },
});

// One IndexedDB transaction commits the local change and its retry record together.
// Read/write transactions also serialize changes from multiple browser tabs.
export async function editEvent(code: string, edit: (cache: EventCache) => void): Promise<EventCache> {
  const database = await db();
  const tx = database.transaction('events', 'readwrite');
  const cache: EventCache = await tx.store.get(code) || { snapshot: emptySnapshot(), outbox: [] };
  edit(cache);
  await tx.store.put(cache, code);
  await tx.done;
  database.close();
  return cache;
}
export async function readEvent(code: string): Promise<EventCache> {
  const database = await db();
  const cache = await database.get('events', code);
  database.close();
  return cache || { snapshot: emptySnapshot(), outbox: [] };
}
export function projectEvent(cache: EventCache): Snapshot {
  const snapshot = structuredClone(cache.snapshot);
  for (const mutation of cache.outbox) applyMutation(snapshot, mutation, mutation.expectedRevision + 1, true);
  return snapshot;
}
export function applyMutation(snapshot: Snapshot, mutation: Mutation, revision = mutation.expectedRevision + 1, projectLocal = false) {
  if (!projectLocal && (snapshot.revisions[mutation.key] || 0) > revision) return;
  if (mutation.kind === 'stock') snapshot.availability[mutation.ingredient!] = !mutation.isAvailable;
  if (mutation.kind === 'status') snapshot.orders = snapshot.orders.map(order => order.id === mutation.orderId
    ? { ...order, status: mutation.status!, revision } : order);
  if (mutation.kind === 'order' && !snapshot.orders.some(order => order.id === mutation.order!.id)) {
    snapshot.orders.push({ ...mutation.order!, revision });
  }
  snapshot.revisions[mutation.key] = revision;
}
export function mergeSnapshot(current: Snapshot, incoming: Snapshot): Snapshot {
  const merged = structuredClone(incoming);
  // A response started before a mutation was acknowledged can arrive afterwards.
  // Keep the highest server revision rather than briefly reverting the UI.
  for (const [key, revision] of Object.entries(current.revisions)) {
    if (revision <= (incoming.revisions[key] || 0)) continue;
    merged.revisions[key] = revision;
    if (key.startsWith('stock:')) merged.availability[key.slice(6)] = current.availability[key.slice(6)];
    else {
      const order = current.orders.find(item => `order:${item.id}` === key);
      if (order) merged.orders = [...merged.orders.filter(item => item.id !== order.id), order];
    }
  }
  return merged;
}
export async function enqueue(code: string, input: Omit<Mutation, 'id' | 'expectedRevision'>) {
  return editEvent(code, cache => {
    const projected = projectEvent(cache);
    cache.outbox.push({ ...input, id: crypto.randomUUID(), expectedRevision: projected.revisions[input.key] || 0 });
  });
}
export async function resolveConflict(code: string, key: string, keepLocal: boolean) {
  return editEvent(code, cache => {
    if (!keepLocal) cache.outbox = cache.outbox.filter(change => change.key !== key);
    else {
      let revision = cache.snapshot.revisions[key] || 0;
      for (const change of cache.outbox.filter(change => change.key === key)) {
        change.expectedRevision = revision++;
        change.id = crypto.randomUUID();
        delete change.error;
      }
    }
  });
}
