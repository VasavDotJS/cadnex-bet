/**
 * Entry point of the `money` Supabase Edge Function (bundled by scripts/build-money.mjs into
 * supabase/functions/money/index.ts). Checks who is calling, rate-limits them, and runs the
 * money handler with Postgres (through the service role) and the live match feed.
 */
import type { BetRow, LedgerRow, SettingsRow, WalletRow } from '../db/db';
import { loadDetail } from '../feed/server';
import type { Change } from './core';
import type { RgSettings } from './limits';
import { ConflictError, handleMoney, Store } from './server';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Promise<Response>): void };

const URL_ = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const ORIGINS = [/^https:\/\/cadnex\.vercel\.app$/, /^https:\/\/cadnex-[a-z0-9-]+\.vercel\.app$/, /^http:\/\/localhost:\d+$/];

function cors(req: Request): Record<string, string> {
  const o = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.some((r) => r.test(o)) ? o : 'https://cadnex.vercel.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// ── Postgres through PostgREST, as the service role ─────────

const svc = (extra: Record<string, string> = {}) => ({ apikey: SERVICE, ...(SERVICE.startsWith('eyJ') ? { Authorization: `Bearer ${SERVICE}` } : {}), ...extra });

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...svc({ 'Content-Type': 'application/json' }), ...(init.headers as Record<string, string> | undefined) } });
  const text = await r.text();
  if (!r.ok) {
    const err = (() => { try { return JSON.parse(text); } catch { return { message: text }; } })();
    if (err?.code === '40001' || /conflict/i.test(err?.message ?? '')) throw new ConflictError();
    if (err?.code === '23505') throw new ConflictError(); // a payout that just landed from another request
    throw new Error(`db ${r.status}: ${err?.message ?? text}`.slice(0, 300));
  }
  return (text ? JSON.parse(text) : null) as T;
}

const q = encodeURIComponent;

const walletOf = (r: Record<string, unknown>): WalletRow => ({ userId: String(r.user_id), currency: String(r.currency), balanceMinor: String(r.balance_minor), updatedAt: Number(r.client_updated_at ?? 0) });
const ledgerOf = (r: Record<string, unknown>): LedgerRow => ({
  id: String(r.id), userId: String(r.user_id), type: r.type as LedgerRow['type'], amountMinor: String(r.amount_minor), balanceAfterMinor: String(r.balance_after_minor),
  currency: String(r.currency), refId: (r.ref_id as string) ?? undefined, note: (r.note as string) ?? undefined, createdAt: Number(r.created_at),
});

const store: Store = {
  async wallet(uid) {
    const rows = await rest<Record<string, unknown>[]>(`wallets?user_id=eq.${q(uid)}&select=*`);
    return rows[0] ? walletOf(rows[0]) : null;
  },
  async bets(uid, ids) {
    const filter = ids === 'open' ? 'status=in.(OPEN,PARTIALLY_CASHED_OUT)' : `id=in.(${ids.map((i) => `"${i.replace(/["\\]/g, '')}"`).join(',')})`;
    if (ids !== 'open' && !ids.length) return [];
    const rows = await rest<{ id: string; user_id: string; doc: BetRow }[]>(`bets?user_id=eq.${q(uid)}&${filter}&select=id,user_id,doc&limit=500`);
    return rows.map((r) => ({ ...r.doc, id: r.id, userId: r.user_id }));
  },
  async settings(uid) {
    const rows = await rest<{ doc: SettingsRow & { rg?: RgSettings } }[]>(`settings?user_id=eq.${q(uid)}&select=doc`);
    return rows[0]?.doc ?? null;
  },
  async ledgerSince(uid, since) {
    const rows = await rest<Record<string, unknown>[]>(`ledger?user_id=eq.${q(uid)}&created_at=gte.${Math.floor(since)}&select=*&order=created_at.desc&limit=5000`);
    return rows.map(ledgerOf);
  },
  async ledgerHas(id) {
    const rows = await rest<unknown[]>(`ledger?id=eq.${q(id)}&select=id`);
    return rows.length > 0;
  },
  async commit(uid, c: Change) {
    await rest('rpc/money_commit', { method: 'POST', body: JSON.stringify({ p_user: uid, p_before: c.before, p_wallet: c.wallet, p_ledger: c.ledger, p_bets: c.bets }) });
  },
};

const feed = { event: (id: string) => loadDetail(id) };

function newId(prefix: string): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return prefix + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Who is calling: the player's own session, checked with Supabase Auth (bans included). */
async function caller(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer \S+$/.test(auth)) return null;
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON || SERVICE, Authorization: auth } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string; banned_until?: string | null };
  if (!u.id) return null;
  if (u.banned_until && Date.parse(u.banned_until) > Date.now()) return null;
  return u.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { ok: false, code: 'BAD_REQUEST', message: 'POST only.' }, 405);
  try {
    const uid = await caller(req);
    if (!uid) return json(req, { ok: false, code: 'AUTH', message: 'Please log in again.' }, 401);
    const allowed = await rest<boolean>('rpc/money_rate_hit', { method: 'POST', body: JSON.stringify({ p_user: uid }) }).catch(() => true);
    if (allowed === false) return json(req, { ok: false, code: 'RATE', message: 'Too many requests. Wait a moment and try again.' }, 429);
    const raw = await req.text();
    if (raw.length > 64_000) return json(req, { ok: false, code: 'BAD_REQUEST', message: 'Request too large.' }, 413);
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const reply = await handleMoney(uid, action, body, { store, feed, now: () => Date.now(), id: newId });
    return json(req, reply);
  } catch (e) {
    console.error('money failed', (e as Error).message);
    return json(req, { ok: false, code: 'SERVER', message: 'Something went wrong. Try again.' }, 500);
  }
});
