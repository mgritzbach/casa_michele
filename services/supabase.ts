import { createClient } from '@supabase/supabase-js';

const env: Record<string, string | undefined> = import.meta.env || {};
const SUPABASE_URL = env.VITE_SUPABASE_URL
  || 'https://cbtroatixvydpwoviezf.supabase.co';

// Publishable keys are safe for public clients. Authorization is enforced by
// RLS and Casa session RPCs; no secret or service-role key ships.
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_iFF5ToqeVnGyu_37Z6-KlA_kc8FMK8b';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(12000) }) },
});
