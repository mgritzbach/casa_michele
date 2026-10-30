import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

export function useConnectivity() {
  const [online, setOnline] = useState(false);
  const [checked, setChecked] = useState(false);
  const check = useCallback(async () => {
    if (!navigator.onLine) { setOnline(false); setChecked(true); return; }
    try {
      const { data, error } = await supabase.rpc('casa_ping');
      setOnline(!error && data === true && navigator.onLine);
    } catch { setOnline(false); }
    finally { setChecked(true); }
  }, []);
  useEffect(() => {
    let active = true;
    const offline = () => setOnline(false);
    const visible = () => { if (active && document.visibilityState === 'visible') void check(); };
    void check();
    const timer = window.setInterval(visible, 10000);
    window.addEventListener('online', check);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', check); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
  }, [check]);
  return { online, checked, check };
}
