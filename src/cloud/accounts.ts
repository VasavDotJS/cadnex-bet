/**
 * Accounts saved on this device, for switching without logging in again (like Instagram).
 *
 * Supabase keeps one session at a time. Every account signed in here keeps its own session
 * (the same tokens Supabase stores for the active account) in the same storage as the login
 * itself: localStorage, or this browser session only when "Remember me" is off. The active
 * account's entry is updated whenever its tokens refresh, so a saved refresh token is never
 * one that has already been used. Removing an account revokes its session on the server.
 */
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { authStorage, SUPABASE_KEY, SUPABASE_URL } from './client';

export interface SavedAccount {
  id: string;
  username: string;
  email: string;
  avatarSeed: number;
  access: string;
  refresh: string;
  /** when the access token expires (ms) */
  expiresAt: number;
  /** last time this account was the active one (ms), for ordering */
  usedAt: number;
}

const KEY = 'cdnx-accounts';
export const MAX_ACCOUNTS = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(): SavedAccount[] {
  try {
    const raw = JSON.parse(authStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is SavedAccount =>
      !!a && typeof a === 'object' && UUID.test(String((a as SavedAccount).id)) &&
      typeof (a as SavedAccount).refresh === 'string' && typeof (a as SavedAccount).access === 'string');
  } catch {
    return [];
  }
}

function write(list: SavedAccount[]): void {
  const sorted = [...list].sort((a, b) => b.usedAt - a.usedAt).slice(0, MAX_ACCOUNTS);
  if (sorted.length) authStorage.setItem(KEY, JSON.stringify(sorted));
  else authStorage.removeItem(KEY);
  useAccounts.setState({ list: sorted.map(publicView) });
}

/** What screens may see: no tokens. */
export type AccountCard = Pick<SavedAccount, 'id' | 'username' | 'email' | 'avatarSeed' | 'usedAt'>;
const publicView = (a: SavedAccount): AccountCard => ({ id: a.id, username: a.username, email: a.email, avatarSeed: a.avatarSeed, usedAt: a.usedAt });

export const useAccounts = create<{ list: AccountCard[] }>(() => ({ list: [] }));

/** Load the saved list into the store (on start-up). */
export function loadAccounts(): void {
  useAccounts.setState({ list: read().sort((a, b) => b.usedAt - a.usedAt).map(publicView) });
}

/** Keep the active account's latest tokens (call on every sign-in and token refresh). */
export function rememberSession(s: Session, profile?: { username?: string; email?: string; avatarSeed?: number }): void {
  if (!s?.user?.id || !s.refresh_token || !s.access_token) return;
  const list = read();
  const prev = list.find((a) => a.id === s.user.id);
  const meta = s.user.user_metadata ?? {};
  const next: SavedAccount = {
    id: s.user.id,
    username: profile?.username ?? prev?.username ?? String(meta.username ?? 'player'),
    email: profile?.email ?? s.user.email ?? prev?.email ?? '',
    avatarSeed: profile?.avatarSeed ?? prev?.avatarSeed ?? Number(meta.avatar_seed ?? 0),
    access: s.access_token,
    refresh: s.refresh_token,
    expiresAt: (s.expires_at ?? 0) * 1000,
    usedAt: Date.now(),
  };
  write([next, ...list.filter((a) => a.id !== next.id)]);
}

/** Update the name and avatar shown for an account (after a profile edit). */
export function updateAccountCard(id: string, patch: { username?: string; email?: string; avatarSeed?: number }): void {
  const list = read();
  const a = list.find((x) => x.id === id);
  if (!a) return;
  Object.assign(a, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  write(list);
}

/** The saved session for an account (tokens included): only the session store uses this. */
export function savedSession(id: string): SavedAccount | null {
  return read().find((a) => a.id === id) ?? null;
}

/** Drop an account from this device without touching the server. */
export function dropAccount(id: string): void {
  write(read().filter((a) => a.id !== id));
}

/**
 * Remove an account from this device and end its session on the server (best effort: if the
 * device is offline the tokens are still deleted here and expire on their own).
 */
export async function forgetAccount(id: string): Promise<void> {
  const a = read().find((x) => x.id === id);
  dropAccount(id);
  if (!a) return;
  try {
    let access = a.access;
    if (a.expiresAt < Date.now() + 30_000) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: a.refresh }),
      });
      if (!r.ok) return; // already expired or revoked
      access = ((await r.json()) as { access_token?: string }).access_token ?? '';
      if (!access) return;
    }
    await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${access}` },
    });
  } catch {
    /* offline: nothing more to do */
  }
}
