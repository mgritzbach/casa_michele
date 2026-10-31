import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { registerSW } from 'virtual:pwa-register';
import { Download } from 'lucide-react';
import { BottomSheet, Button } from './UI';
import { APP_VERSION, AppRelease, checkGithubRelease, compareVersions, NativeUpdater, openUpdates, RELEASES_URL } from '../services/updates';

export function UpdateButton({ compact = false }: { compact?: boolean }) {
  return <button onClick={openUpdates} aria-label="Check for updates" className={compact ? 'w-11 h-11 flex shrink-0 items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-300' : 'min-h-11 inline-flex items-center gap-2 text-amber-300'}><Download size={17} />{!compact && 'Check for updates'}</button>;
}
export function AppUpdate() {
  const native = Capacitor.isNativePlatform();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [installedVersion, setInstalledVersion] = useState(APP_VERSION);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const apply = useRef<((reload?: boolean) => Promise<void>) | undefined>(undefined);
  const checking = useRef(false);
  useEffect(() => {
    if (native) return;
    apply.current = registerSW({
      onOfflineReady: () => setNotice('Menu and photos are ready for offline bartender use.'),
      onNeedRefresh: () => { setAvailable(true); setDismissed(false); },
      onRegistered: value => { registration.current = value; },
      onRegisterError: () => setNotice('Offline download did not finish. Reopen while connected to try again.'),
    });
  }, [native]);
  const check = async () => {
    if (checking.current) return;
    checking.current = true; setBusy(true); setError(''); setMessage(''); setRelease(null);
    try {
      const info = native ? await App.getInfo() : null;
      if (info) setInstalledVersion(info.version);
      if (!native) {
        const worker = registration.current || await navigator.serviceWorker?.getRegistration();
        if (worker) { await worker.update(); if (worker.waiting) setAvailable(true); }
      }
      const latest = await checkGithubRelease(info?.id);
      setRelease(latest);
      if (!latest) setMessage('No compatible APK release is published yet. You can view releases on GitHub.');
      else if (compareVersions(latest.version, info?.version || APP_VERSION) <= 0) setMessage('You are up to date.');
      else if (!native) setMessage(`Version ${latest.version} is on GitHub. The web update will be offered here after it is deployed to this website.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); checking.current = false; }
  };
  const checkRef = useRef(check); checkRef.current = check;
  useEffect(() => {
    const show = () => { setOpen(true); setNotice(''); void checkRef.current(); };
    window.addEventListener('casa:updates', show);
    return () => window.removeEventListener('casa:updates', show);
  }, []);
  useEffect(() => {
    const back = (event: Event) => { if (open) { event.preventDefault(); if (!installing) setOpen(false); } };
    window.addEventListener('casa:back', back);
    return () => window.removeEventListener('casa:back', back);
  }, [open, installing]);
  const install = async () => {
    if (installing) return;
    setInstalling(true); setError(''); setMessage('');
    try {
      if (native && release) {
        const result = await NativeUpdater.install({ url: release.downloadUrl, sha256: release.sha256 });
        setMessage(result.status === 'permission' ? 'Allow Casa Michele to install updates in Android settings, then return here and tap Download and install again.' : 'Confirm the update in Android. If you cancelled, you can tap Download and install again.');
      } else if (apply.current) await apply.current(true);
    } catch (e) { setError((e as Error).message || 'The update could not be installed. Please try again.'); }
    finally { setInstalling(false); }
  };
  const newer = release && compareVersions(release.version, installedVersion) > 0;
  return <>
    {!open && !dismissed && (available || notice) && <aside className="fixed bottom-[calc(84px+var(--casa-safe-bottom))] inset-x-3 z-[110] rounded-xl border border-zinc-600 bg-zinc-800 text-zinc-100 p-4 shadow-xl max-w-md mx-auto" role="status">
      <p className="text-sm">{available ? 'A web update is ready.' : notice}</p>
      <div className="flex gap-4">{available && <button className="min-h-11 text-amber-300" onClick={() => setOpen(true)}>View update</button>}<button className="min-h-11 text-amber-300" onClick={() => { setNotice(''); setDismissed(true); }}>Dismiss</button></div>
    </aside>}
    <BottomSheet isOpen={open} onClose={() => { if (!installing) setOpen(false); }} title="App updates" footer={<div className="space-y-2">
      {(native ? newer : available) && <Button onClick={() => void install()} disabled={busy || installing}>{installing ? (native ? 'Downloading and verifying...' : 'Installing update...') : native ? 'Download and install' : 'Install web update'}</Button>}
      <Button variant="secondary" onClick={() => void check()} disabled={busy || installing}>{busy ? 'Checking GitHub...' : 'Check again'}</Button>
    </div>}>
      <div className="space-y-4 text-sm text-zinc-300">
        <p>Installed version <strong className="text-white">{installedVersion}</strong></p>
        {busy && <p role="status">Checking published releases...</p>}
        {release && <p>Latest {native ? 'compatible release' : 'Android release'}: <strong className="text-white">{release.version}</strong>{newer && ` (${(release.size / 1048576).toFixed(1)} MB)`}</p>}
        {available && !native && <p className="text-emerald-300">A deployed web update is ready to install.</p>}
        {message && !(available && !native) && <p role="status">{message}</p>}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <p>{native ? 'Android asks you to confirm installation. Your saved bar data stays on this device.' : 'Install when convenient. Saved bar changes stay on this device.'}</p>
        <a className="inline-flex min-h-11 items-center text-amber-300 underline" href={release?.url || RELEASES_URL} target="_blank" rel="noopener noreferrer">View releases on GitHub</a>
      </div>
    </BottomSheet>
  </>;
}
