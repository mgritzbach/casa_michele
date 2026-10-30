import React, { useState } from 'react';
import { EventSession } from '../types';
import { Mutation } from '../services/offlineStore';
import { CasaApi } from '../services/casaApi';
import { Button } from './UI';

export function SyncStatus({ session, connection, pending, savedAt, onSession, onResolve, onRetry, syncError }: {
  syncError?: string; session: EventSession; connection: string; pending: Mutation[]; savedAt: number;
  onSession: (session: EventSession) => void; onResolve: (key: string, keepLocal: boolean) => Promise<void>; onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showReconnect, setShowReconnect] = useState(false);
  const conflict = pending.find(change => change.error);
  const needsAuth = connection === 'expired' || session.offlineOnly;
  return <section aria-label="Sync status" className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/70 space-y-3">
    <div role="status" aria-live="polite" className="text-sm flex flex-wrap gap-2 items-center justify-between">
      <span className={connection === 'online' && !pending.length ? 'text-emerald-300' : 'text-amber-200'}>
        {session.offlineOnly ? 'Local bar on this device' : connection === 'expired' ? 'Sign in again to sync' : connection === 'connecting' ? 'Connecting to the bar' : connection === 'online' ? conflict ? 'Review a saved change' : pending.length ? 'Syncing saved changes' : 'Everything is synced' : 'Offline bartender mode'}
        {pending.length > 0 && ` · ${pending.length} saved change${pending.length === 1 ? '' : 's'}`}
      </span>
      <button className="text-amber-300 min-h-11 px-3 underline" onClick={() => needsAuth ? setShowReconnect(!showReconnect) : onRetry()}>
        {needsAuth ? 'Connect to online event' : 'Sync now'}
      </button>
    </div>
    {connection !== 'online' && <p className="text-xs text-zinc-400">Menu, recipes, stock and saved orders work here. Guests receive updates after sync.{savedAt > 0 ? ` Last synced ${new Date(savedAt).toLocaleString()}.` : ''}</p>}
    {syncError && <p className="text-xs text-zinc-300">Sync unavailable. Your saved changes are safe on this device. {syncError.includes('storage') ? syncError : 'Reconnect and try again.'}</p>}
    {error && !showReconnect && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {needsAuth && showReconnect && <form className="space-y-3 max-w-md" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      const pin = String(new FormData(event.currentTarget).get('pin'));
      try { onSession(await CasaApi.startBartenderSession(session.eventCode, pin)); setShowReconnect(false); }
      catch (cause) { setError((cause as Error).message); }
      finally { setBusy(false); }
    }}>
      <p className="text-sm">Connect event <strong>{session.eventCode}</strong>. Saved changes stay on this device until accepted by the server.</p>
      <label className="block text-sm">Bartender password<input name="pin" type="password" required autoComplete="current-password" className="input-field mt-2 h-12" /></label>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Connecting...' : 'Connect and sync'}</Button>
    </form>}
    {conflict && <div role="alert" className="border border-amber-500/40 bg-amber-500/10 rounded-xl p-4 space-y-3">
      <p className="font-semibold">A change needs your review</p>
      <p className="text-sm text-zinc-300">{conflict.kind === 'stock' ? conflict.ingredient : 'An order'} changed on another device. {conflict.error}</p>
      <div className="flex gap-2">
        <Button disabled={busy || connection !== 'online'} onClick={async () => { setBusy(true); try { await onResolve(conflict.key, false); } catch { setError('Could not save your choice. Please try again.'); } finally { setBusy(false); } }} variant="secondary">Use server version</Button>
        <Button disabled={busy || connection !== 'online'} onClick={async () => { setBusy(true); try { await onResolve(conflict.key, true); } catch { setError('Could not save your choice. Please try again.'); } finally { setBusy(false); } }}>Keep my change</Button>
      </div>
    </div>}
  </section>;
}
