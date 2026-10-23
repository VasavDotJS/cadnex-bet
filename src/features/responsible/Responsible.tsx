/** Responsible gaming: limits, reminders, breaks and self-exclusion. All enforced. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, TwoTone } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { currency } from '../../lib/currencies';
import { formatMoney, parseAmount } from '../../lib/money';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { getRg, Limit, Period, PERIOD_LABEL, RgSettings, saveRg, setLimit } from './limits';

type Kind = 'deposit' | 'loss' | 'stake';
const COPY: Record<Kind, { title: string; body: string }> = {
  deposit: { title: 'Deposit limit', body: 'Caps deposits and demo top-ups over a period.' },
  loss: { title: 'Loss limit', body: 'Stops bets that could take your net losses past the limit.' },
  stake: { title: 'Stake limit', body: 'Caps the total you can stake over a period.' },
};

function LimitCard({ kind, rg, onChange }: { kind: Kind; rg: RgSettings; onChange: (r: RgSettings) => void }) {
  const user = useSession((s) => s.user)!;
  const wallet = useSession((s) => s.wallet)!;
  const cur = rg[kind];
  const [amt, setAmt] = useState('');
  const [period, setPeriod] = useState<Period>(cur?.period ?? 'week');
  const code = wallet.currency;
  const save = async (remove = false) => {
    const parsed = parseAmount(amt, code);
    if (!remove && (parsed === null || parsed <= 0n)) { useUi.getState().toast({ tone: 'error', title: 'Enter an amount above zero' }); return; }
    const next: Limit | null = remove ? null : { amountMinor: parsed!.toString(), currency: code, period };
    const r = await setLimit(user.id, kind, next);
    onChange(r);
    setAmt('');
    const pending = r[kind]?.pending;
    useUi.getState().toast({ tone: 'neutral', title: pending ? 'Change scheduled' : remove ? 'Limit removed' : 'Limit set', body: pending ? 'Raising or removing a limit takes effect after 24 hours.' : undefined });
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[16px] font-medium">{COPY[kind].title}</p>
          <p className="mt-0.5 text-[13px] text-mute">{COPY[kind].body}</p>
        </div>
        {cur && <span className="num shrink-0 rounded-full bg-lime/15 px-3 py-1.5 text-[13px] font-medium">{formatMoney(BigInt(cur.amountMinor), cur.currency, { trim: true })} / {PERIOD_LABEL[cur.period]}</span>}
      </div>
      {cur?.pending && <p className="mt-2 text-[12.5px] text-warn">Changes to {cur.pending.amountMinor ? formatMoney(BigInt(cur.pending.amountMinor), cur.currency) : 'no limit'} on {new Date(cur.pending.effectiveAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`Amount in ${currency(code).code}`} aria-label={`${COPY[kind].title} amount`} className="mono h-11 min-w-0 flex-1 rounded-full bg-surface2 px-4 text-[14px] outline-none focus:ring-2 focus:ring-lime" />
        <div className="flex gap-1 rounded-full bg-surface2 p-1">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p} className={`h-9 rounded-full px-3 text-[12.5px] ${period === p ? 'bg-pill text-onpill' : 'text-mute'}`}>{p === 'month' ? '30d' : p === 'day' ? 'Day' : 'Week'}</button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Pill tone="primary" size="sm" onClick={() => void save()}>{cur ? 'Update limit' : 'Set limit'}</Pill>
        {cur && <Pill size="sm" onClick={() => void save(true)}>Remove</Pill>}
      </div>
    </div>
  );
}

export function Responsible() {
  const user = useSession((s) => s.user);
  const wallet = useSession((s) => s.wallet);
  const nav = useNavigate();
  const [rg, setRg] = useState<RgSettings | null>(null);
  const [confirm, setConfirm] = useState<null | { label: string; until: number; exclude: boolean }>(null);
  const [maxBet, setMaxBet] = useState('');
  useEffect(() => { if (user) void getRg(user.id).then(setRg); }, [user]);
  if (!user || !wallet || !rg) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
        <TwoTone a="Responsible" b="gaming" size="xl" as="h1" />
        <p className="max-w-[60ch] text-[15px] text-mute">CADNEX uses virtual money, but the habits are real. Log in to set limits, reminders, breaks or self-exclusion on your account.</p>
      </div>
    );
  }
  const now = Date.now();
  const update = async (r: RgSettings) => { await saveRg(user.id, r); setRg({ ...r }); };
  const lockout = rg.excludedUntil && rg.excludedUntil > now ? `Self-excluded until ${new Date(rg.excludedUntil).toLocaleDateString()}` : rg.coolOffUntil && rg.coolOffUntil > now ? `On a break until ${new Date(rg.coolOffUntil).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : null;
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <TwoTone a="Responsible" b="gaming" size="xl" as="h1" />
      <p className="-mt-2 max-w-[60ch] text-[15px] text-mute">Limits here are enforced: bets and deposits that break them are refused. Lowering a limit is instant; raising or removing one waits 24 hours.</p>
      {lockout && <div className="rounded-card bg-warn/12 p-5 text-[15px]"><p className="font-medium">{lockout}</p><p className="mt-1 text-[13px] text-mute">Betting and deposits are blocked until then. This cannot be cancelled early.</p></div>}
      <LimitCard kind="deposit" rg={rg} onChange={setRg} />
      <LimitCard kind="loss" rg={rg} onChange={setRg} />
      <LimitCard kind="stake" rg={rg} onChange={setRg} />
      <div className="card p-5">
        <p className="text-[16px] font-medium">Single bet limit</p>
        <p className="mt-0.5 text-[13px] text-mute">The most you can stake on one slip.{rg.maxBet ? ` Now ${formatMoney(BigInt(rg.maxBet.amountMinor), rg.maxBet.currency)}.` : ''}</p>
        <div className="mt-3 flex gap-2">
          <input inputMode="decimal" value={maxBet} onChange={(e) => setMaxBet(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Amount" aria-label="Single bet limit" className="mono h-11 min-w-0 flex-1 rounded-full bg-surface2 px-4 text-[14px] outline-none focus:ring-2 focus:ring-lime" />
          <Pill tone="primary" size="sm" onClick={() => { const v = parseAmount(maxBet, wallet.currency); if (!v) return; void update({ ...rg, maxBet: { amountMinor: v.toString(), currency: wallet.currency } }); setMaxBet(''); useUi.getState().toast({ tone: 'neutral', title: 'Single bet limit set' }); }}>Set</Pill>
          {rg.maxBet && <Pill size="sm" onClick={() => { const r = { ...rg }; delete r.maxBet; void update(r); }}>Remove</Pill>}
        </div>
      </div>
      <div className="card p-5">
        <p className="text-[16px] font-medium">Session reminder</p>
        <p className="mt-0.5 text-[13px] text-mute">A reminder of how long you have been playing and your result this session.</p>
        <div className="mt-3 flex flex-wrap gap-1 rounded-full bg-surface2 p-1">
          {[0, 15, 30, 60].map((m) => (
            <button key={m} onClick={() => void update({ ...rg, reminderMinutes: m })} aria-pressed={(rg.reminderMinutes ?? 0) === m} className={`h-9 flex-1 rounded-full px-3 text-[13px] ${(rg.reminderMinutes ?? 0) === m ? 'bg-pill text-onpill' : 'text-mute'}`}>{m ? `Every ${m}m` : 'Off'}</button>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <p className="text-[16px] font-medium">Take a break</p>
        <p className="mt-0.5 text-[13px] text-mute">Pause betting and deposits. You can still log in and see your history.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[{ l: '24 hours', d: 1 }, { l: '7 days', d: 7 }, { l: '30 days', d: 30 }].map((o) => <Pill key={o.l} size="sm" onClick={() => setConfirm({ label: `a ${o.l} break`, until: now + o.d * 86_400_000, exclude: false })}>{o.l}</Pill>)}
        </div>
        <p className="mt-5 text-[16px] font-medium">Self-exclusion</p>
        <p className="mt-0.5 text-[13px] text-mute">Block betting and deposits for six months.</p>
        <Pill tone="danger" size="sm" className="mt-3" onClick={() => setConfirm({ label: 'six months of self-exclusion', until: now + 182 * 86_400_000, exclude: true })}>Self-exclude</Pill>
      </div>
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={<>Confirm <span className="text-mute">break</span></>}>
        {confirm && (
          <>
            <p className="text-[15px]">Start {confirm.label}? It ends on {new Date(confirm.until).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} and cannot be cancelled early.</p>
            <div className="mt-5 flex gap-2">
              <Pill className="flex-1" onClick={() => setConfirm(null)}>Not now</Pill>
              <Pill tone="primary" className="flex-1" onClick={async () => { await update(confirm.exclude ? { ...rg, excludedUntil: confirm.until } : { ...rg, coolOffUntil: confirm.until }); setConfirm(null); nav('/responsible'); }}>Start</Pill>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
