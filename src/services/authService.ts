/** Accounts and sessions. Every account on the device is fully isolated by userId. */
import { db, SettingsRow, uid, UserRow } from '../db/db';
import { hashPassword, newSalt, safeEqual } from '../lib/crypto';
import { isCurrency } from '../lib/currencies';
import { convertMinor, pow10 } from '../lib/money';
import { currency } from '../lib/currencies';
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
}

const strip = (u: UserRow): PublicUser => ({ id: u.id, username: u.username, email: u.email, avatarSeed: u.avatarSeed, createdAt: u.createdAt, dob: u.dob });

const SESSION_SHORT = 12 * 3600_000;
const SESSION_LONG = 30 * 86_400_000;

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

export const authService = {
  async signUp(input: { username: string; email: string; password: string; dob: string; currency: string }): Promise<PublicUser> {
    const username = input.username.trim();
    const email = input.email.trim();
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) throw new AuthError('username', 'Use 3–20 letters, numbers, dots or underscores.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AuthError('email', 'Enter a valid email address.');
    if (input.password.length < 8) throw new AuthError('password', 'Use at least 8 characters.');
    if (!input.dob || ageOn(input.dob) < 18) throw new AuthError('dob', 'You must be 18 or older to use CADNEX.');
    if (!isCurrency(input.currency)) throw new AuthError('currency', 'Choose a currency.');
    if (await db.users.where('usernameLower').equals(username.toLowerCase()).count()) throw new AuthError('username', 'That username is taken on this device.');
    if (await db.users.where('emailLower').equals(email.toLowerCase()).count()) throw new AuthError('email', 'An account with this email already exists on this device.');
    const salt = newSalt();
    const user: UserRow = {
      id: uid('u_'), username, usernameLower: username.toLowerCase(), email, emailLower: email.toLowerCase(),
      passwordHash: await hashPassword(input.password, salt), salt, iterations: 150_000,
      avatarSeed: Math.floor(Math.random() * 360), createdAt: Date.now(), dob: input.dob,
    };
    const start = startingBalance(input.currency);
    await db.transaction('rw', [db.users, db.wallets, db.ledger, db.settings], async () => {
      await db.users.add(user);
      await db.wallets.add({ userId: user.id, currency: input.currency, balanceMinor: start.toString(), updatedAt: Date.now() });
      await db.ledger.add({
        id: uid('l_'), userId: user.id, type: 'DEMO_ADJUST', amountMinor: start.toString(), balanceAfterMinor: start.toString(),
        currency: input.currency, note: 'Starting demo balance', createdAt: stamp(),
      });
      await db.settings.add(defaultSettings(user.id));
    });
    await this.startSession(user.id, true);
    return strip(user);
  },

  async logIn(identifier: string, password: string, remember: boolean): Promise<PublicUser> {
    const id = identifier.trim().toLowerCase();
    const user = id.includes('@') ? await db.users.where('emailLower').equals(id).first() : await db.users.where('usernameLower').equals(id).first();
    if (!user) throw new AuthError('identifier', 'No account with that username or email on this device.');
    const h = await hashPassword(password, user.salt, user.iterations);
    if (!safeEqual(h, user.passwordHash)) throw new AuthError('password', 'That password is incorrect.');
    await this.startSession(user.id, remember);
    return strip(user);
  },

  async startSession(userId: string, remember: boolean): Promise<void> {
    const now = Date.now();
    await db.sessions.put({ id: 'current', userId, remember, createdAt: now, expiresAt: now + (remember ? SESSION_LONG : SESSION_SHORT) });
  },

  async getSession(): Promise<PublicUser | null> {
    const s = await db.sessions.get('current');
    if (!s || s.expiresAt < Date.now()) {
      if (s) await db.sessions.delete('current');
      return null;
    }
    const u = await db.users.get(s.userId);
    return u ? strip(u) : null;
  },

  async logOut(): Promise<void> {
    await db.sessions.delete('current');
  },

  async updateProfile(userId: string, patch: { username?: string; email?: string; avatarSeed?: number }): Promise<PublicUser> {
    const u = await db.users.get(userId);
    if (!u) throw new AuthError('user', 'Account not found.');
    const next = { ...u };
    if (patch.username !== undefined && patch.username !== u.username) {
      const username = patch.username.trim();
      if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) throw new AuthError('username', 'Use 3–20 letters, numbers, dots or underscores.');
      const clash = await db.users.where('usernameLower').equals(username.toLowerCase()).first();
      if (clash && clash.id !== userId) throw new AuthError('username', 'That username is taken on this device.');
      next.username = username;
      next.usernameLower = username.toLowerCase();
    }
    if (patch.email !== undefined && patch.email !== u.email) {
      const email = patch.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AuthError('email', 'Enter a valid email address.');
      const clash = await db.users.where('emailLower').equals(email.toLowerCase()).first();
      if (clash && clash.id !== userId) throw new AuthError('email', 'An account with this email already exists on this device.');
      next.email = email;
      next.emailLower = email.toLowerCase();
    }
    if (patch.avatarSeed !== undefined) next.avatarSeed = patch.avatarSeed;
    await db.users.put(next);
    return strip(next);
  },

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const u = await db.users.get(userId);
    if (!u) throw new AuthError('user', 'Account not found.');
    const h = await hashPassword(current, u.salt, u.iterations);
    if (!safeEqual(h, u.passwordHash)) throw new AuthError('current', 'Your current password is incorrect.');
    if (next.length < 8) throw new AuthError('next', 'Use at least 8 characters.');
    const salt = newSalt();
    await db.users.update(userId, { salt, passwordHash: await hashPassword(next, salt), iterations: 150_000 });
  },

  /** Demo reset flow: issues a 6-digit code the app shows in a toast. */
  async requestReset(identifier: string): Promise<{ code: string; userId: string }> {
    const id = identifier.trim().toLowerCase();
    const user = id.includes('@') ? await db.users.where('emailLower').equals(id).first() : await db.users.where('usernameLower').equals(id).first();
    if (!user) throw new AuthError('identifier', 'No account with that username or email on this device.');
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const code = String(n[0] % 1_000_000).padStart(6, '0');
    await db.resets.put({ userId: user.id, code, expiresAt: Date.now() + 10 * 60_000 });
    return { code, userId: user.id };
  },

  async resetPassword(userId: string, code: string, next: string): Promise<void> {
    const r = await db.resets.get(userId);
    if (!r || r.expiresAt < Date.now()) throw new AuthError('code', 'That code has expired. Request a new one.');
    if (r.code !== code.trim()) throw new AuthError('code', 'That code is not correct.');
    if (next.length < 8) throw new AuthError('password', 'Use at least 8 characters.');
    const salt = newSalt();
    await db.users.update(userId, { salt, passwordHash: await hashPassword(next, salt), iterations: 150_000 });
    await db.resets.delete(userId);
  },

  async deleteAccount(userId: string): Promise<void> {
    await db.transaction('rw', [db.users, db.wallets, db.ledger, db.bets, db.settings, db.sessions, db.notifications, db.resets], async () => {
      await db.ledger.where('userId').equals(userId).delete();
      await db.bets.where('userId').equals(userId).delete();
      await db.notifications.where('userId').equals(userId).delete();
      await db.wallets.delete(userId);
      await db.settings.delete(userId);
      await db.resets.delete(userId);
      await db.users.delete(userId);
      const s = await db.sessions.get('current');
      if (s?.userId === userId) await db.sessions.delete('current');
    });
  },
};
