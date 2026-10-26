/**
 * The Supabase client. The project URL and publishable key are public by design: every
 * table is protected by row level security, so the key alone can only reach a signed-in
 * user's own rows. Environment variables override them (for another project or tests).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ahgwdlcrerxpgdybzwsh.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ZNtnAY8T6hHvLHcvswdhEA_y_QRUzXH';

const REMEMBER_KEY = 'cdnx-remember';

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

/** "Remember me" off: keep the login in this browser session only (gone when it closes). */
export function setRemember(remember: boolean): void {
  safe(() => localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'), undefined);
}

const ephemeral = () => safe(() => localStorage.getItem(REMEMBER_KEY) === '0', false);

export const authStorage = {
  getItem: (k: string) => safe(() => sessionStorage.getItem(k) ?? localStorage.getItem(k), null),
  setItem: (k: string, v: string) =>
    safe(() => {
      if (ephemeral()) {
        sessionStorage.setItem(k, v);
        localStorage.removeItem(k);
      } else {
        localStorage.setItem(k, v);
        sessionStorage.removeItem(k);
      }
    }, undefined),
  removeItem: (k: string) =>
    safe(() => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }, undefined),
};

let client: SupabaseClient | null = null;

export function cloud(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'cdnx-auth',
        storage: authStorage,
      },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}

/** Tests swap in a fake. */
export function setCloudClient(c: SupabaseClient | null): void {
  client = c;
}
