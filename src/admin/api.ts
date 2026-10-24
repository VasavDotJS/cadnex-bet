/**
 * Admin data. Every call is a Postgres function that re-checks, on the server, that the
 * caller is an admin with an authenticator code from the last 12 hours. Nothing here is
 * trusted for security: hiding the page is a courtesy, the database is the gate.
 */
import { cloud } from '../cloud/client';

export class AdminError extends Error {
  constructor(public kind: 'forbidden' | 'mfa' | 'other', message: string) {
    super(message);
  }
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await cloud().rpc(fn, args ?? {});
  if (error) {
    if (/mfa_required/.test(error.message)) throw new AdminError('mfa', 'Enter your authenticator code to continue.');
    if (/forbidden|permission denied/.test(error.message)) throw new AdminError('forbidden', 'Not allowed.');
    throw new AdminError('other', error.message);
  }
  return data as T;
}

export interface Whoami { admin: boolean; mfa?: boolean }
export interface DayCount { day: string; n: number }
export interface Overview {
  users_total: number;
  users_today: number;
  users_7d: number;
  active_24h: number;
  bets_total: number;
  bets_open: number;
  bets_today: number;
  staked: Record<string, string>;
  paid_out: Record<string, string>;
  signups_30d: DayCount[];
  bets_30d: DayCount[];
  top_events: { event_id: string; home: string; away: string; league: string; n: number }[];
  big_wins: { username: string | null; currency: string; amount: string; note: string | null; created_at: number }[];
}
export interface PlayerRow {
  id: string;
  username: string | null;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  last_active: string | null;
  banned: boolean;
  is_admin: boolean;
  currency: string | null;
  balance_minor: string | null;
  bets: number;
  open_bets: number;
}
export interface PlayerDetail {
  user: { id: string; email: string; username: string | null; created_at: string; last_sign_in_at: string | null; banned: boolean; is_admin: boolean; dob: string | null; currency: string | null };
  wallet: { currency: string; balance_minor: string; updated_at: string } | null;
  bets: { id: string; type: string; status: string; currency: string; stakeMinor: string; totalOdds: number; placedAt: number; returnMinor?: string; potentialReturnMinor: string; legs: { label: string; home: string; away: string; marketName: string; odds: number; result: string }[] }[];
  ledger: { id: string; type: string; amount_minor: string; balance_after_minor: string; currency: string; note: string | null; created_at: number }[];
  audit: AuditRow[];
}
export interface AuditRow { id: number; action: string; detail: Record<string, unknown>; at: string; target: string | null; admin?: string | null; target_name?: string | null }

export const adminApi = {
  whoami: () => call<Whoami>('admin_whoami'),
  overview: () => call<Overview>('admin_overview'),
  players: (search: string, limit = 50, offset = 0) => call<{ total: number; rows: PlayerRow[] }>('admin_users', { p_search: search, p_limit: limit, p_offset: offset }),
  player: (id: string) => call<PlayerDetail>('admin_user', { p_target: id }),
  audit: (limit = 100) => call<AuditRow[]>('admin_audit_log', { p_limit: limit }),
  gift: (id: string, amountMinor: string, note: string) => call<{ balance_minor: string; currency: string }>('admin_gift', { p_target: id, p_amount_minor: amountMinor, p_note: note }),
  ban: (id: string, banned: boolean) => call<{ banned: boolean }>('admin_set_ban', { p_target: id, p_banned: banned }),
};

// ───────────── second factor (authenticator app) ─────────────

export interface Setup { factorId: string; qr: string; uri: string; secret: string }

/** Verified authenticator for this account, if any. */
export async function verifiedFactor(): Promise<string | null> {
  const { data, error } = await cloud().auth.mfa.listFactors();
  if (error) throw new AdminError('other', error.message);
  return data.totp.find((f) => f.status === 'verified')?.id ?? null;
}

/** Start linking an authenticator app: returns the QR code and the secret to type in. */
export async function startSetup(): Promise<Setup> {
  // clear half-finished attempts so a fresh one can start
  const { data: list } = await cloud().auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status !== 'verified') await cloud().auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await cloud().auth.mfa.enroll({ factorType: 'totp', friendlyName: `CADNEX admin ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) throw new AdminError('other', error?.message ?? 'Could not start setup.');
  return { factorId: data.id, qr: data.totp.qr_code, uri: data.totp.uri, secret: data.totp.secret };
}

/** Check a 6-digit code; on success the session is upgraded to two-factor. */
export async function verifyCode(factorId: string, code: string): Promise<void> {
  const { error } = await cloud().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  if (error) throw new AdminError('mfa', /invalid|expired/i.test(error.message) ? 'That code is not right. Codes change every 30 seconds.' : error.message);
}
