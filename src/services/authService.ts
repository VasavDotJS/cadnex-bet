/**
 * Accounts, backed by Supabase Auth. Logins live in the cloud, so the same account works
 * on any device. The profile (username, avatar, date of birth) is a row in `profiles`;
 * wallet, bets and history sync through src/cloud/sync.ts.
 */
import type { AuthError as SbAuthError, User } from '@supabase/supabase-js';
import { cloud, setRemember } from '../cloud/client';
import { db, SettingsRow } from '../db/db';
import { currency, isCurrency } from '../lib/currencies';
import { convertMinor, pow10 } from '../lib/money';
import { stamp } from '../lib/time';

export class AuthError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  avatarSeed: number;
  createdAt: number;
  dob: string;
  /** currency chosen at sign-up, used to open the wallet on first login */
  currency: string;
}

export function ageOn(dob: string, now = new Date()): number {
  const d = new Date(dob + 'T00:00:00');
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function defaultSettings(userId: string): SettingsRow {
  return {
    userId, theme: 'dark', oddsFormat: 'decimal', oddsChange: 'higher', reducedMotion: 'system', hideBalance: false,
    notifyGoals: true, notifySettled: true, favourites: [], followed: [],
  };
}

/** A friendly starting balance worth about 1,000 USD, rounded to two significant figures. */
export function startingBalance(code: string): bigint {
  const raw = convertMinor(100_000n, 'USD', code); // 1,000.00 USD
  const unitsWhole = Number(raw / pow10(currency(code).decimals));
  if (unitsWhole < 1) return raw; // crypto: keep exact
  const mag = Math.pow(10, Math.floor(Math.log10(unitsWhole)) - 1);
  const nice = Math.round(unitsWhole / mag) * mag;
  return BigInt(nice) * pow10(currency(code).decimals);
}

const USERNAME = /^[A-Za-z0-9_.]{3,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NETWORK = "Couldn't reach CADNEX. Check your connection and try again.";

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);

function fail(e: SbAuthError | Error | null | undefined, fallbackField = 'form'): never {
  const code = (e as { code?: string } | null)?.code ?? '';
  const status = (e as { status?: number } | null)?.status ?? 0;
  const msg = e?.message ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) throw new AuthError('password', 'Email or password is incorrect.');
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) throw new AuthError('identifier', 'Confirm your email first. The link is in your inbox.');
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) throw new AuthError('email', 'An account with this email already exists. Log in instead.');
  if (code === 'weak_password') throw new AuthError('password', 'Choose a stronger password.');
  if (code === 'email_address_invalid') throw new AuthError('email', 'Enter a valid email address.');
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) throw new AuthError('form', 'Too many attempts. Wait a minute and try again.');
  if (code === 'same_password') throw new AuthError('next', 'Choose a password you have not used here before.');
  if (/18\+/.test(msg)) throw new AuthError('dob', 'You must be 18 or older to use CADNEX.');
  if (/failed to fetch|network|load failed/i.test(msg) || status === 0) throw new AuthError('form', NETWORK);
  throw new AuthError(fallbackField, msg || 'Something went wrong. Try again.');
}

const profileCacheKey = (id: string) => `cdnx-profile:${id}`;

function cacheProfile(u: PublicUser) {
  try {
    localStorage.setItem(profileCacheKey(u.id), JSON.stringify(u));
  } catch {
    /* fine: it is only an offline fallback */
  }
}

function cachedProfile(id: string): PublicUser | null {
  try {
    const raw = localStorage.getItem(profileCacheKey(id));
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

/** Profile row + login email → the user object the app works with. */
async function loadUser(user: User): Promise<PublicUser> {
  const { data, error } = await cloud().from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error || !data) {
    const cached = cachedProfile(user.id);
    if (cached) return { ...cached, email: user.email ?? cached.email };
    if (error) fail(error);
    // no profile row yet (should not happen: a trigger creates it); build one from sign-up data
    const meta = user.user_metadata ?? {};
    return { id: user.id, username: String(meta.username ?? 'player'), email: user.email ?? '', avatarSeed: Number(meta.avatar_seed ?? 0), createdAt: Date.parse(user.created_at), dob: String(meta.dob ?? ''), currency: String(meta.currency ?? 'USD') };
  }
  const u: PublicUser = {
    id: user.id, username: data.username, email: user.email ?? '', avatarSeed: data.avatar_seed ?? 0,
    createdAt: Date.parse(data.created_at), dob: data.dob, currency: data.currency ?? 'USD',
  };
  cacheProfile(u);
  return u;
}

async function usernameFree(name: string): Promise<boolean> {
  const { data, error } = await cloud().rpc('username_available', { name });
  return error ? true : data !== false; // if the check itself fails, the database still enforces it
}

export type SignUpResult = { user: PublicUser } | { confirmEmail: string };

export const authService = {
  async signUp(input: { username: string; email: string; password: string; dob: string; currency: string }): Promise<SignUpResult> {
    const username = input.username.trim();
    const email = input.email.trim();
    if (!USERNAME.test(username)) throw new AuthError('username', 'Use 3–20 letters, numbers, dots or underscores.');
    if (!EMAIL.test(email)) throw new AuthError('email', 'Enter a valid email address.');
    if (input.password.length < 8) throw new AuthError('password', 'Use at least 8 characters.');
    if (!input.dob || ageOn(input.dob) < 18) throw new AuthError('dob', 'You must be 18 or older to use CADNEX.');
    if (!isCurrency(input.currency)) throw new AuthError('currency', 'Choose a currency.');
    if (!(await usernameFree(username).catch(() => true))) throw new AuthError('username', 'That username is taken.');
    setRemember(true);
    const { data, error } = await cloud().auth.signUp({
      email,
      password: input.password,
      options: {
        emailRedirectTo: `${origin()}/`,
        data: { username, dob: input.dob, currency: input.currency, avatar_seed: Math.floor(Math.random() * 360) },
      },
    });
    if (error) {
      if (/database error/i.test(error.message)) throw new AuthError('username', 'That username is taken.');
      fail(error);
    }
    if (!data.session || !data.user) return { confirmEmail: email };
    return { user: await loadUser(data.user) };
  },

  async logIn(identifier: string, password: string, remember: boolean): Promise<PublicUser> {
    const email = identifier.trim();
    if (!email.includes('@')) throw new AuthError('identifier', 'Log in with the email address on your account.');
    if (!password) throw new AuthError('password', 'Enter your password.');
    setRemember(remember);
    const { data, error } = await cloud().auth.signInWithPassword({ email, password });
    if (error || !data.user) fail(error);
    return loadUser(data.user);
  },

  /** The signed-in user on this device, if any. */
  async getSession(): Promise<PublicUser | null> {
    const { data } = await cloud().auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    try {
      return await loadUser(user);
    } catch {
      return null;
    }
  },

  async logOut(): Promise<void> {
    await cloud().auth.signOut({ scope: 'local' }).catch(() => {});
  },

  async updateProfile(userId: string, patch: { username?: string; email?: string; avatarSeed?: number }, current?: PublicUser): Promise<{ user: PublicUser; emailPending: boolean }> {
    const row: Record<string, unknown> = {};
    if (patch.username !== undefined && patch.username.trim() !== current?.username) {
      const username = patch.username.trim();
      if (!USERNAME.test(username)) throw new AuthError('username', 'Use 3–20 letters, numbers, dots or underscores.');
      if (username.toLowerCase() !== current?.username.toLowerCase() && !(await usernameFree(username))) throw new AuthError('username', 'That username is taken.');
      row.username = username;
    }
    if (patch.avatarSeed !== undefined) row.avatar_seed = patch.avatarSeed;
    if (Object.keys(row).length) {
      const { error } = await cloud().from('profiles').update(row).eq('id', userId);
      if (error) {
        if (error.code === '23505') throw new AuthError('username', 'That username is taken.');
        fail(error);
      }
    }
    let emailPending = false;
    if (patch.email !== undefined && patch.email.trim().toLowerCase() !== current?.email.toLowerCase()) {
      const email = patch.email.trim();
      if (!EMAIL.test(email)) throw new AuthError('email', 'Enter a valid email address.');
      const { data, error } = await cloud().auth.updateUser({ email }, { emailRedirectTo: `${origin()}/` });
      if (error) fail(error, 'email');
      emailPending = (data.user?.email ?? '').toLowerCase() !== email.toLowerCase();
    }
    const { data } = await cloud().auth.getUser();
    if (!data.user) throw new AuthError('form', 'You are signed out. Log in again.');
    return { user: await loadUser(data.user), emailPending };
  },

  async changePassword(email: string, currentPw: string, next: string): Promise<void> {
    if (next.length < 8) throw new AuthError('next', 'Use at least 8 characters.');
    // confirm it's really you before changing it
    const check = await cloud().auth.signInWithPassword({ email, password: currentPw });
    if (check.error) {
      if ((check.error as { code?: string }).code === 'invalid_credentials' || /invalid login/i.test(check.error.message)) throw new AuthError('current', 'Your current password is incorrect.');
      fail(check.error, 'current');
    }
    const { error } = await cloud().auth.updateUser({ password: next });
    if (error) fail(error, 'next');
  },

  /** Emails a reset link. It opens CADNEX on the "set a new password" screen. */
  async requestReset(identifier: string): Promise<void> {
    const email = identifier.trim();
    if (!EMAIL.test(email)) throw new AuthError('identifier', 'Enter the email address on your account.');
    const { error } = await cloud().auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/` });
    if (error) fail(error, 'identifier');
  },

  /** After following a reset link: the user is signed in for recovery and picks a new password. */
  async setNewPassword(next: string): Promise<void> {
    if (next.length < 8) throw new AuthError('password', 'Use at least 8 characters.');
    const { error } = await cloud().auth.updateUser({ password: next });
    if (error) fail(error, 'password');
  },

  /** Deletes the login and every row of the account in the cloud. */
  async deleteAccount(): Promise<void> {
    const { error } = await cloud().rpc('delete_my_account');
    if (error) fail(error);
    await cloud().auth.signOut({ scope: 'local' }).catch(() => {});
  },

  /**
   * First login of a brand-new account: open the wallet with the starting balance and
   * default settings. Only runs when the cloud has no wallet for this user.
   */
  async openAccount(user: PublicUser): Promise<void> {
    const cur = isCurrency(user.currency) ? user.currency : 'USD';
    if (!(await db.wallets.get(user.id))) {
      const start = startingBalance(cur);
      await db.transaction('rw', [db.wallets, db.ledger], async () => {
        await db.wallets.put({ userId: user.id, currency: cur, balanceMinor: start.toString(), updatedAt: Date.now() });
        await db.ledger.put({
          id: `l_start_${user.id}`, userId: user.id, type: 'DEMO_ADJUST', amountMinor: start.toString(), balanceAfterMinor: start.toString(),
          currency: cur, note: 'Starting demo balance', createdAt: stamp(),
        });
      });
    }
    if (!(await db.settings.get(user.id))) await db.settings.put(defaultSettings(user.id));
  },
};

/** Old builds kept accounts and password hashes on the device. Remove them. */
export async function purgeLegacyAccounts(): Promise<void> {
  try {
    const legacy = (id: string) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    await db.transaction('rw', [db.users, db.sessions, db.resets, db.wallets, db.ledger, db.bets, db.settings, db.notifications], async () => {
      await db.users.clear();
      await db.sessions.clear();
      await db.resets.clear();
      await db.wallets.filter((w) => legacy(w.userId)).delete();
      await db.settings.filter((s) => legacy(s.userId)).delete();
      await db.ledger.filter((l) => legacy(l.userId)).delete();
      await db.bets.filter((b) => legacy(b.userId)).delete();
      await db.notifications.filter((n) => legacy(n.userId)).delete();
    });
  } catch {
    /* nothing to clean */
  }
}

