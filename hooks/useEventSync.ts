import { useCallback, useEffect, useRef, useState } from 'react';
import { EventSession } from '../types';
import { CasaApi, CasaApiError } from '../services/casaApi';
import { applyMutation, editEvent, emptySnapshot, enqueue, EventCache, Mutation, projectEvent, readEvent, resolveConflict, mergeSnapshot } from '../services/offlineStore';

export function useEventSync(session: EventSession | null) {
  const [cache, setCache] = useState<EventCache>({ snapshot: emptySnapshot(), outbox: [] });
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline' | 'expired'>('connecting');
  const [error, setError] = useState('');
  const wake = useRef<() => void>(() => {});
  const activeKey = useRef('');
  activeKey.current = session?.token || session?.eventCode || '';

  useEffect(() => {
    let active = true;
    let running = false;
    let rerun = false;
    setCache({ snapshot: emptySnapshot(), outbox: [] });
    setError('');
    if (!session) return;
    const { eventCode, token, isBartender } = session;
    const update = (value: EventCache) => { if (active) setCache(value); };
    const sync = async () => {
      if (!active) return;
      if (running) { rerun = true; return; }
      running = true;
      rerun = false;
      try {
        if (isBartender) update(await readEvent(eventCode));
        if (!navigator.onLine || session.offlineOnly) { setConnection('offline'); return; }
        if (!token || new Date(session.expiresAt).getTime() <= Date.now()) { setConnection('expired'); return; }
        if (isBartender) {
          // Always replay before fetching: a snapshot must never erase unsent edits.
          for (let count = 0; count < 100 && active; count++) {
            const state = await readEvent(eventCode);
            const blockedKeys = new Set(state.outbox.filter(item => item.error).map(item => item.key));
            const next = state.outbox.find(item => !item.error && !blockedKeys.has(item.key));
            if (!next) break;
            const result = await CasaApi.applyMutation(token, next);
            if (!active) return;
            update(await editEvent(eventCode, current => {
              if (result.conflict) {
                const change = current.outbox.find(item => item.id === next.id);
                if (change) change.error = result.error || 'This item was changed on another device.';
              } else {
                applyMutation(current.snapshot, next, result.revision);
                current.outbox = current.outbox.filter(item => item.id !== next.id);
              }
            }));
          }
        }
        const snapshot = await CasaApi.getSnapshot(token);
        if (!active) return;
        if (isBartender) update(await editEvent(eventCode, current => { current.snapshot = mergeSnapshot(current.snapshot, snapshot); }));
        else update({ snapshot, outbox: [] });
        setConnection('online');
        setError('');
      } catch (cause) {
        if (!active) return;
        setConnection(cause instanceof CasaApiError && cause.isSessionExpired ? 'expired' : 'offline');
        setError((cause as Error).message);
      } finally {
        running = false;
        if (rerun && active) queueMicrotask(sync);
      }
    };
    wake.current = () => void sync();
    const offline = () => { if (active) setConnection('offline'); };
    const visible = () => { if (document.visibilityState === 'visible') void sync(); };
    const interval = window.setInterval(() => { if (document.visibilityState !== 'hidden') void sync(); }, 4000);
    window.addEventListener('online', sync);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    void sync();
    return () => {
      active = false;
      wake.current = () => {};
      window.clearInterval(interval);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [session?.token, session?.eventCode, session?.isBartender, session?.offlineOnly]);

  const queue = useCallback(async (input: Omit<Mutation, 'id' | 'expectedRevision'>) => {
    if (!session?.isBartender) throw new Error('Bartender access is required.');
    const key = activeKey.current;
    const next = await enqueue(session.eventCode, input);
    if (activeKey.current === key) setCache(next);
    wake.current();
  }, [session]);
  const resolve = useCallback(async (key: string, keepLocal: boolean) => {
    if (!session?.isBartender) return;
    setCache(await resolveConflict(session.eventCode, key, keepLocal));
    wake.current();
  }, [session]);
  const snapshot = projectEvent(cache);
  return { ...snapshot, orders: snapshot.orders.filter(order => order.status !== 'deleted'), pending: cache.outbox,
    connection, error, queue, resolve, retry: () => wake.current() };
}
