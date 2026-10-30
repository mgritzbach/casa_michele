import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';

export function AppUpdate() {
  const [ready, setReady] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const apply = registerSW({
      onOfflineReady: () => setReady(true),
      onNeedRefresh: () => setUpdate(() => () => apply(true)),
      onRegisterError: () => setError(true),
    });
  }, []);
  if (update) return <aside className="fixed bottom-3 inset-x-3 z-[110] rounded-2xl bg-zinc-800 border border-zinc-600 p-4 shadow-xl max-w-md mx-auto" aria-live="polite">
    <p className="font-semibold">An update is ready</p><p className="text-sm text-zinc-300">Install when convenient. Saved bar changes stay on this device.</p>
    <div className="flex gap-3 mt-3"><button className="min-h-11 px-4 bg-amber-500 text-black rounded-xl" onClick={() => void update()}>Install update</button><button className="min-h-11 px-4" onClick={() => setUpdate(null)}>Later</button></div>
  </aside>;
  if (!ready && !error) return null;
  return <aside className="fixed bottom-3 inset-x-3 z-[110] rounded-2xl bg-zinc-800 text-zinc-100 p-4 shadow-xl max-w-md mx-auto" role="status">
    <p className="text-sm">{error ? 'Offline download did not finish. Reopen while connected to try again.' : 'Menu and photos are ready for offline bartender use.'}</p>
    <button className="min-h-11 text-amber-300" onClick={() => { setReady(false); setError(false); }}>Dismiss</button>
  </aside>;
}
