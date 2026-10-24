/**
 * Private admin panel at /#/admin. To everyone except an admin it is the normal "page not
 * found". Admins also need an authenticator-app code (checked by the database, not here),
 * and the panel locks itself after 15 minutes without activity.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Ban, Check, ChevronRight, Copy, Gift, Lock, RefreshCw, Search, ShieldCheck, Undo2 } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { press, spring } from '../components/motion';
import { Pill, Tabs, TwoTone } from '../components/ui';
import { NotFound } from '../features/help/Help';
import { currency } from '../lib/currencies';
import { convertMinor, formatMoney } from '../lib/money';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';
import { AdminError, adminApi, AuditRow, Overview, PlayerDetail, PlayerRow, Setup, startSetup, verifiedFactor, verifyCode } from './api';

const IDLE_MS = 15 * 60_000;

type Gate = { s: 'loading' } | { s: 'hidden' } | { s: 'code'; factorId: string; locked?: boolean } | { s: 'setup'; setup: Setup | null } | { s: 'open' };

export default function AdminPage() {
  const user = useSession((st) => st.user);
  const [gate, setGate] = useState<Gate>({ s: 'loading' });

  const check = useCallback(async () => {
    if (!user) { setGate({ s: 'hidden' }); return; }
    try {
      const me = await adminApi.whoami();
      if (!me.admin) { setGate({ s: 'hidden' }); return; }
      if (me.mfa) { setGate({ s: 'open' }); return; }
      const f = await verifiedFactor();
      setGate(f ? { s: 'code', factorId: f } : { s: 'setup', setup: null });
    } catch {
      setGate({ s: 'hidden' });
    }
  }, [user]);
  useEffect(() => { void check(); }, [check]);

  // lock after 15 minutes without a tap, key or scroll
  useEffect(() => {
    if (gate.s !== 'open') return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(async () => {
      if (Date.now() - last < IDLE_MS) return;
      const f = await verifiedFactor().catch(() => null);
      if (f) setGate({ s: 'code', factorId: f, locked: true });
    }, 15_000);
    return () => { clearInterval(t); evs.forEach((e) => window.removeEventListener(e, bump)); };
  }, [gate.s]);

  const needCode = useCallback(async () => {
    const f = await verifiedFactor().catch(() => null);
    setGate(f ? { s: 'code', factorId: f } : { s: 'setup', setup: null });
  }, []);

  if (gate.s === 'loading') return <div className="flex min-h-[60dvh] items-center justify-center"><span className="h-3 w-3 animate-pulse rounded-full bg-lime" /></div>;
  if (gate.s === 'hidden') return <NotFound />;
  if (gate.s === 'setup') return <SetupScreen onDone={() => void check()} />;
  if (gate.s === 'code') return <CodeScreen factorId={gate.factorId} locked={gate.locked} onDone={() => setGate({ s: 'open' })} />;
  return <Dashboard onNeedCode={needCode} onLock={() => void needCode()} />;
}

// ───────────── second factor screens ─────────────

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[80dvh] w-full max-w-[440px] flex-col justify-center gap-6 px-4 pb-10 pt-[max(24px,env(safe-area-inset-top))]">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] bg-lime/15 text-up"><ShieldCheck size={26} strokeWidth={1.6} /></span>
      {children}
    </div>
  );
}

function CodeInput({ onSubmit, busy }: { onSubmit: (code: string) => void; busy: boolean }) {
  const [v, setV] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = (e?: FormEvent) => { e?.preventDefault(); if (v.length === 6 && !busy) onSubmit(v); };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="relative">
        <input
          ref={ref}
          value={v}
          onChange={(e) => { const n = e.target.value.replace(/\D/g, '').slice(0, 6); setV(n); if (n.length === 6 && !busy) onSubmit(n); }}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="6-digit code"
          className="absolute inset-0 h-full w-full opacity-0"
        />
        <div className="grid grid-cols-6 gap-2" onClick={() => ref.current?.focus()}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`mono flex h-16 items-center justify-center rounded-[16px] bg-surface2 text-[28px] transition-shadow ${i === v.length ? 'ring-2 ring-lime' : ''}`}>{v[i] ?? ''}</div>
          ))}
        </div>
      </div>
      <Pill tone="lime" size="lg" type="submit" disabled={v.length !== 6 || busy}>{busy ? 'Checking' : 'Unlock'}</Pill>
    </form>
  );
}

function CodeScreen({ factorId, locked, onDone }: { factorId: string; locked?: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (code: string) => {
    setBusy(true);
    setErr('');
    try {
      await verifyCode(factorId, code);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-tighter2">{locked ? 'Locked' : 'Admin'} <span className="text-mute">{locked ? 'after 15 minutes idle' : 'verification'}</span></h1>
        <p className="mt-2 text-[15px] text-mute">Enter the 6-digit code from your authenticator app.</p>
      </div>
      <CodeInput onSubmit={(c) => void go(c)} busy={busy} />
      {err && <p className="text-[13.5px] text-down">{err}</p>}
    </Shell>
  );
}

/** The authenticator link as a crisp QR code (drawn here, so it works in every browser). */
function Qr({ text }: { text: string }) {
  const path = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  return (
    <svg width={184} height={184} viewBox={`0 0 ${path.n} ${path.n}`} role="img" aria-label="Authenticator QR code" shapeRendering="crispEdges">
      <path d={path.d} fill="#0A0A0C" />
    </svg>
  );
}

function SetupScreen({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { startSetup().then(setSetup, (e) => setErr(e.message)); }, []);
  const go = async (code: string) => {
    if (!setup) return;
    setBusy(true);
    setErr('');
    try {
      await verifyCode(setup.factorId, code);
      useUi.getState().toast({ tone: 'neutral', title: 'Authenticator linked', body: 'You will need a code from it to open the admin panel.' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-tighter2">Protect <span className="text-mute">the admin panel</span></h1>
        <p className="mt-2 text-[15px] text-mute">One-time setup. Link an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…). After this, the panel needs your password and a code from that app.</p>
      </div>
      <ol className="flex flex-col gap-4 text-[14.5px]">
        <li className="flex gap-3"><span className="num mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface3 text-[12px]">1</span><span>In the app, tap <b>+</b> and scan this code, or type the key below.</span></li>
      </ol>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-[24px] bg-white p-4">{setup ? <Qr text={setup.uri} /> : <div className="h-[184px] w-[184px] animate-pulse rounded-xl bg-black/10" />}</div>
        {setup && (
          <button onClick={() => { void navigator.clipboard?.writeText(setup.secret); setCopied(true); setTimeout(() => setCopied(false), 1800); }} className="mono inline-flex max-w-full items-center gap-2 break-all rounded-full bg-surface2 px-4 py-2 text-[12.5px] text-mute">
            {setup.secret}{copied ? <Check size={14} className="text-up" /> : <Copy size={14} />}
          </button>
        )}
      </div>
      <p className="flex gap-3 text-[14.5px]"><span className="num mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface3 text-[12px]">2</span><span>Enter the 6-digit code it shows.</span></p>
      <CodeInput onSubmit={(c) => void go(c)} busy={busy || !setup} />
      {err && <p className="text-[13.5px] text-down">{err}</p>}
    </Shell>
  );
}

// ───────────── dashboard ─────────────

const usd = (byCur: Record<string, string>) => Object.entries(byCur).reduce((a, [c, v]) => { try { return a + convertMinor(BigInt(v), c, 'USD'); } catch { return a; } }, 0n);
const ago = (iso: string | null) => {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function useAdmin<T>(load: () => Promise<T>, deps: unknown[], onNeedCode: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const run = useCallback(async () => {
    setBusy(true);
    try {
      setData(await load());
      setErr('');
    } catch (e) {
      if (e instanceof AdminError && e.kind === 'mfa') onNeedCode();
      else setErr(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void run(); }, [run]);
  return { data, err, busy, reload: run };
}

function Dashboard({ onNeedCode, onLock }: { onNeedCode: () => void; onLock: () => void }) {
  const [tab, setTab] = useState<'overview' | 'players' | 'audit'>('overview');
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.16em] text-up"><ShieldCheck size={14} />ADMIN · VERIFIED</p>
          <TwoTone a="Control" b="room" size="lg" as="h1" className="mt-1" />
          <p className="mt-1 text-[13px] text-mute">Every action here is recorded in the audit log.</p>
        </div>
        <button onClick={onLock} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface2 px-3.5 text-[13px]"><Lock size={14} />Lock</button>
      </div>
      <Tabs id="admintabs" tabs={[{ id: 'overview', label: 'Overview' }, { id: 'players', label: 'Players' }, { id: 'audit', label: 'Audit log' }]} value={tab} onChange={setTab} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
          {tab === 'overview' ? <OverviewTab onNeedCode={onNeedCode} /> : tab === 'players' ? <PlayersTab onNeedCode={onNeedCode} /> : <AuditTab onNeedCode={onNeedCode} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-[22px] p-4 ${accent ? 'bg-lime text-onlime' : 'bg-surface'}`}>
      <p className={`text-[12px] ${accent ? 'text-onlime/70' : 'text-mute'}`}>{label}</p>
      <p className="num mt-1 text-[26px] font-semibold leading-none tracking-tighter2">{value}</p>
      {sub && <p className={`mt-1.5 text-[12px] ${accent ? 'text-onlime/70' : 'text-mute'}`}>{sub}</p>}
    </div>
  );
}

function Bars({ title, days, tone }: { title: string; days: { day: string; n: number }[]; tone: string }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const total = days.reduce((a, d) => a + d.n, 0);
  return (
    <div className="rounded-[24px] bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-[12px] text-mute"><span className="num text-ink">{total}</span> in 30 days</p>
      </div>
      <div className="mt-4 flex h-[110px] items-end gap-[3px]">
        {days.map((d, i) => (
          <motion.div key={d.day} title={`${d.day}: ${d.n}`} initial={{ height: 0 }} animate={{ height: `${Math.max(d.n ? 6 : 2, (d.n / max) * 100)}%` }} transition={{ ...spring, delay: i * 0.012 }} className="flex-1 rounded-t-[4px]" style={{ background: d.n ? tone : 'rgb(var(--surface-3))' }} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-faint"><span>{days[0]?.day.slice(5)}</span><span>today</span></div>
    </div>
  );
}

function OverviewTab({ onNeedCode }: { onNeedCode: () => void }) {
  const { data, err, busy, reload } = useAdmin<Overview>(() => adminApi.overview(), [], onNeedCode);
  const [health, setHealth] = useState<{ ok: boolean; sources: { league: string; ok: boolean; events: number; error?: string }[]; checkedAt: string } | null>(null);
  useEffect(() => { fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth(null)); }, []);
  if (err) return <p className="text-[14px] text-down">{err}</p>;
  if (!data) return <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-[96px] rounded-[22px]" />)}</div>;
  const staked = usd(data.staked);
  const paid = usd(data.paid_out);
  const okSources = health?.sources.filter((s) => s.ok).length ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Tile accent label="Players" value={data.users_total} sub={`+${data.users_7d} this week · +${data.users_today} today`} />
        <Tile label="Active, last 24h" value={data.active_24h} />
        <Tile label="Bets placed" value={data.bets_total} sub={`${data.bets_today} today · ${data.bets_open} open`} />
        <Tile label="Live feed" value={health ? `${okSources}/${health.sources.length}` : '…'} sub={health ? (health.ok ? 'sources answering' : 'feed is down') : 'checking'} />
        <Tile label="Total staked" value={formatMoney(staked, 'USD', { compact: true })} sub="all currencies, in USD" />
        <Tile label="Paid back" value={formatMoney(paid, 'USD', { compact: true })} sub="wins, refunds, cash outs" />
        <Tile label="House result" value={formatMoney(staked - paid, 'USD', { compact: true, sign: true })} sub="staked minus paid back" />
        <button onClick={() => void reload()} className="flex items-center justify-center gap-2 rounded-[22px] bg-surface p-4 text-[13px] text-mute hover:text-ink"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />Refresh</button>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        <Bars title="Sign-ups" days={data.signups_30d} tone="rgb(var(--lime))" />
        <Bars title="Bets placed" days={data.bets_30d} tone="rgb(var(--violet))" />
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        <div className="rounded-[24px] bg-surface p-5">
          <p className="text-[14px] font-medium">Most-bet matches <span className="text-mute">· 7 days</span></p>
          <div className="mt-3 flex flex-col">
            {data.top_events.length ? data.top_events.map((e) => (
              <div key={e.event_id} className="flex items-center justify-between gap-3 border-b hair py-2.5 text-[13.5px] last:border-0">
                <span className="truncate">{e.home} <span className="text-mute">v</span> {e.away}</span>
                <span className="num shrink-0 text-mute">{e.n} bet{e.n > 1 ? 's' : ''}</span>
              </div>
            )) : <p className="py-4 text-[13px] text-mute">No bets this week yet.</p>}
          </div>
        </div>
        <div className="rounded-[24px] bg-surface p-5">
          <p className="text-[14px] font-medium">Biggest wins</p>
          <div className="mt-3 flex flex-col">
            {data.big_wins.length ? data.big_wins.map((w, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b hair py-2.5 text-[13.5px] last:border-0">
                <span className="min-w-0 truncate">@{w.username ?? 'deleted'} <span className="text-mute">· {w.note?.replace(/^Winnings · /, '')}</span></span>
                <span className="num shrink-0 text-up">{formatMoney(BigInt(w.amount), w.currency)}</span>
              </div>
            )) : <p className="py-4 text-[13px] text-mute">No winning bets yet.</p>}
          </div>
        </div>
      </div>
      {health && !health.ok && <p className="rounded-[18px] bg-down/10 p-4 text-[13px] text-down">The live data feed is not answering. Players will see paused markets.</p>}
    </div>
  );
}

function PlayersTab({ onNeedCode }: { onNeedCode: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, err, reload } = useAdmin(() => adminApi.players(debounced), [debounced], onNeedCode);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex h-12 items-center gap-2 rounded-full bg-surface2 px-4">
        <Search size={16} className="text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username or email" className="h-full flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-faint" />
      </label>
      {err && <p className="text-[14px] text-down">{err}</p>}
      <p className="px-1 text-[12.5px] text-mute">{data ? `${data.total} player${data.total === 1 ? '' : 's'}` : 'Loading…'}</p>
      <div className="overflow-hidden rounded-card bg-surface">
        {(data?.rows ?? []).map((p) => <PlayerLine key={p.id} p={p} onOpen={() => setOpen(p.id)} />)}
        {data && !data.rows.length && <p className="p-5 text-[13.5px] text-mute">Nobody matches that search.</p>}
      </div>
      <PlayerSheet id={open} onClose={() => setOpen(null)} onChanged={() => void reload()} onNeedCode={onNeedCode} />
    </div>
  );
}

function PlayerLine({ p, onOpen }: { p: PlayerRow; onOpen: () => void }) {
  return (
    <motion.button whileTap={press} onClick={onOpen} className="flex w-full items-center gap-3 border-b hair px-4 py-3 text-left last:border-0 hover:bg-surface2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[15px] font-medium">
          @{p.username ?? 'unknown'}
          {p.is_admin && <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[10.5px] text-up">ADMIN</span>}
          {p.banned && <span className="rounded-full bg-down/15 px-2 py-0.5 text-[10.5px] text-down">BANNED</span>}
        </p>
        <p className="truncate text-[12.5px] text-mute">{p.email} · joined {ago(p.created_at)} · active {ago(p.last_active)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-[14px]">{p.balance_minor && p.currency ? formatMoney(BigInt(p.balance_minor), p.currency, { compact: true }) : '—'}</p>
        <p className="text-[12px] text-mute">{p.bets} bets · {p.open_bets} open</p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-mute" />
    </motion.button>
  );
}

function toMinorUnits(input: string, code: string): bigint | null {
  const d = currency(code).decimals;
  const m = input.trim().replace(/,/g, '').match(/^(\d{1,12})(?:\.(\d+))?$/);
  if (!m) return null;
  const frac = (m[2] ?? '').slice(0, d).padEnd(d, '0');
  return BigInt(m[1]) * 10n ** BigInt(d) + (d ? BigInt(frac || '0') : 0n);
}

function PlayerSheet({ id, onClose, onChanged, onNeedCode }: { id: string | null; onClose: () => void; onChanged: () => void; onNeedCode: () => void }) {
  const [d, setD] = useState<PlayerDetail | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirmBan, setConfirmBan] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!id) return;
    try { setD(await adminApi.player(id)); } catch (e) { if (e instanceof AdminError && e.kind === 'mfa') { onClose(); onNeedCode(); } }
  }, [id, onClose, onNeedCode]);
  useEffect(() => { setD(null); setAmount(''); setNote(''); setConfirmBan(false); void load(); }, [load]);
  const cur = d?.wallet?.currency ?? 'USD';
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      useUi.getState().toast({ tone: 'neutral', title: ok });
      await load();
      onChanged();
    } catch (e) {
      if (e instanceof AdminError && e.kind === 'mfa') { onClose(); onNeedCode(); return; }
      useUi.getState().toast({ tone: 'error', title: e instanceof Error ? e.message : 'That did not work.' });
    } finally {
      setBusy(false);
    }
  };
  const gift = () => {
    const minor = toMinorUnits(amount, cur);
    if (!minor || minor <= 0n || !d) { useUi.getState().toast({ tone: 'error', title: 'Enter an amount like 50 or 12.50' }); return; }
    void act(() => adminApi.gift(d.user.id, minor.toString(), note || 'Gift from CADNEX'), `Sent ${formatMoney(minor, cur)} to @${d.user.username}`).then(() => { setAmount(''); setNote(''); });
  };
  const inputCls = 'h-12 w-full rounded-[16px] bg-surface2 px-4 text-[15px] outline-none focus:ring-2 focus:ring-lime';
  return (
    <Sheet open={!!id} onClose={onClose} tall title={d ? <>@{d.user.username} <span className="text-mute">player</span></> : 'Player'} label="Player details">
      {!d ? <div className="skeleton h-40 rounded-[22px]" /> : (
        <div className="flex flex-col gap-5 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Balance" value={d.wallet ? formatMoney(BigInt(d.wallet.balance_minor), d.wallet.currency, { compact: true }) : '—'} />
            <Tile label="Bets" value={d.bets.length} sub={`${d.bets.filter((b) => b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT').length} open`} />
          </div>
          <div className="rounded-[20px] bg-surface2 p-4 text-[13px] text-mute">
            <p>{d.user.email}</p>
            <p className="mt-1">Joined {new Date(d.user.created_at).toLocaleString()} · last login {d.user.last_sign_in_at ? ago(d.user.last_sign_in_at) : 'never'}</p>
            {d.user.banned && <p className="mt-1 text-down">Banned: cannot log in.</p>}
          </div>

          <section className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-[14px] font-medium"><Gift size={16} />Gift virtual credits</p>
            <div className="flex gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={`Amount in ${cur}`} className={inputCls} />
              <Pill tone="lime" onClick={gift} disabled={busy || !amount}>Send</Pill>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note they will see (optional)" maxLength={120} className={inputCls} />
          </section>

          {!d.user.is_admin && (
            <section className="flex flex-col gap-2">
              {d.user.banned ? (
                <Pill onClick={() => void act(() => adminApi.ban(d.user.id, false), `@${d.user.username} can log in again`)} disabled={busy}><Undo2 size={16} />Lift ban</Pill>
              ) : confirmBan ? (
                <div className="flex gap-2">
                  <Pill tone="danger" className="flex-1" onClick={() => void act(() => adminApi.ban(d.user.id, true), `@${d.user.username} is banned`)} disabled={busy}><Ban size={16} />Yes, ban @{d.user.username}</Pill>
                  <Pill onClick={() => setConfirmBan(false)}>Cancel</Pill>
                </div>
              ) : (
                <Pill tone="danger" onClick={() => setConfirmBan(true)}><Ban size={16} />Ban player</Pill>
              )}
              <p className="px-1 text-[12px] text-faint">A ban stops them logging in; any open session ends within the hour.</p>
            </section>
          )}

          <section>
            <p className="text-[14px] font-medium">Recent bets</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {d.bets.slice(0, 15).map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-[16px] bg-surface2 px-3.5 py-2.5 text-[13px]">
                  <span className="min-w-0 truncate">{b.legs.map((l) => l.label).join(' · ')} <span className="text-mute">· {b.status.toLowerCase().replace(/_/g, ' ')}</span></span>
                  <span className="num shrink-0">{formatMoney(BigInt(b.stakeMinor), b.currency, { compact: true })}</span>
                </div>
              ))}
              {!d.bets.length && <p className="text-[13px] text-mute">No bets yet.</p>}
            </div>
          </section>

          <section>
            <p className="text-[14px] font-medium">Wallet history</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {d.ledger.slice(0, 15).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-1 text-[13px]">
                  <span className="min-w-0 truncate text-mute">{l.note ?? l.type}</span>
                  <span className={`num shrink-0 ${BigInt(l.amount_minor) > 0n ? 'text-up' : ''}`}>{formatMoney(BigInt(l.amount_minor), l.currency, { sign: true, compact: true })}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}

const ACTION: Record<string, string> = { gift: 'Gifted credits', ban: 'Banned', unban: 'Lifted ban', delete_user: 'Deleted player' };

function AuditTab({ onNeedCode }: { onNeedCode: () => void }) {
  const { data, err } = useAdmin<AuditRow[]>(() => adminApi.audit(200), [], onNeedCode);
  const rows = useMemo(() => data ?? [], [data]);
  if (err) return <p className="text-[14px] text-down">{err}</p>;
  return (
    <div className="overflow-hidden rounded-card bg-surface">
      {rows.map((a) => (
        <div key={a.id} className="flex items-start justify-between gap-3 border-b hair px-4 py-3 last:border-0">
          <div className="min-w-0">
            <p className="text-[14px] font-medium">{ACTION[a.action] ?? a.action} {a.target_name ? <span className="text-mute">· @{a.target_name}</span> : null}</p>
            <p className="truncate text-[12.5px] text-mute">
              by @{a.admin ?? 'admin'}
              {a.action === 'gift' && a.detail.amount_minor ? ` · ${formatMoney(BigInt(String(a.detail.amount_minor)), String(a.detail.currency ?? 'USD'))}` : ''}
              {a.detail.note ? ` · “${String(a.detail.note)}”` : ''}
            </p>
          </div>
          <span className="shrink-0 text-[12px] text-mute">{ago(a.at)}</span>
        </div>
      ))}
      {data && !rows.length && <p className="p-5 text-[13.5px] text-mute">Nothing yet. Gifts and bans will appear here.</p>}
    </div>
  );
}
