/** Wallet: balance, demo top-ups, simulated deposits and withdrawals, currency, and the full ledger. */
import { AnimatePresence, motion } from 'framer-motion';
import { Bitcoin, Check, CreditCard, Landmark, Minus, Plus, Search, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { LedgerRow, LedgerType } from '../../db/db';
import { Orbs } from '../../components/Ambient';
import { FrostedWalletCard } from '../../components/cards';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { gentle, press, snappy, spring } from '../../components/motion';
import { Sheet } from '../../components/Sheet';
import { Chip, Empty, Pill, SectionHead, TwoTone } from '../../components/ui';
import { currency } from '../../lib/currencies';
import { convertMinor, formatMoney, fxRate, Minor, parseAmount, units } from '../../lib/money';
import { shortRef } from '../../services/betService';
import { maxBalance, walletService } from '../../services/walletService';
import { checkDeposit } from '../responsible/limits';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';

const METHODS = [
  { id: 'Card', icon: CreditCard, note: 'Visa •••• 4242' },
  { id: 'UPI', icon: Smartphone, note: 'demo@cdnx' },
  { id: 'Bank', icon: Landmark, note: 'Account •••• 0091' },
  { id: 'Crypto', icon: Bitcoin, note: 'Wallet 0x7F3A…91C2' },
];

function amountInput(value: string, set: (v: string) => void, code: string, autoFocus = false) {
  const cur = currency(code);
  return (
    <label className="flex h-16 items-center gap-2 rounded-[20px] bg-surface2 px-5">
      <span className="text-[20px] text-mute">{cur.kind === 'crypto' ? '' : cur.symbol}</span>
      <input autoFocus={autoFocus} inputMode="decimal" value={value} onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" aria-label={`Amount in ${code}`} className="mono w-full bg-transparent text-[28px] outline-none placeholder:text-faint" />
      {cur.kind === 'crypto' && <span className="text-[15px] text-mute">{code}</span>}
    </label>
  );
}

function MoveSheet({ kind, open, onClose }: { kind: 'deposit' | 'withdraw'; open: boolean; onClose: () => void }) {
  const user = useSession((s) => s.user)!;
  const wallet = useSession((s) => s.wallet)!;
  const [method, setMethod] = useState('Card');
  const [amt, setAmt] = useState('');
  const [phase, setPhase] = useState<'form' | 'processing' | 'done'>('form');
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setPhase('form'); setAmt(''); setErr(''); } }, [open]);
  const code = wallet.currency;
  const parsed = parseAmount(amt, code);
  const submit = async () => {
    if (!parsed || parsed <= 0n) { setErr('Enter an amount above zero.'); return; }
    setPhase('processing');
    await new Promise((r) => setTimeout(r, 1100 + Math.random() * 700));
    try {
      if (kind === 'deposit') {
        await checkDeposit(user.id, parsed, code);
        await walletService.deposit(user.id, parsed, method);
      } else await walletService.withdraw(user.id, parsed, method);
      await useSession.getState().refreshAll();
      setPhase('done');
      setTimeout(onClose, 1300);
    } catch (e) {
      setErr((e as Error).message);
      setPhase('form');
    }
  };
  const title = kind === 'deposit' ? <>Deposit <span className="text-mute">funds</span></> : <>Withdraw <span className="text-mute">funds</span></>;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'done' ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={gentle} className="flex flex-col items-center gap-3 py-10 text-center">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={snappy} className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-lime text-onlime"><Check size={30} strokeWidth={2} /></motion.span>
            <p className="text-[20px] font-semibold tracking-tighter2">{kind === 'deposit' ? 'Deposited' : 'Withdrawn'} {parsed ? formatMoney(parsed, code) : ''}</p>
            <p className="text-[13.5px] text-mute">Virtual funds · via {method}</p>
          </motion.div>
        ) : phase === 'processing' ? (
          <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-12">
            <motion.span className="h-12 w-12 rounded-full border-[3px] border-surface3 border-t-lime" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} />
            <p className="text-[15px]">Processing with {method}</p>
            <p className="text-[13px] text-mute">This is a simulation. No real payment is made.</p>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const on = method === m.id;
                return (
                  <motion.button key={m.id} whileTap={press} onClick={() => setMethod(m.id)} aria-pressed={on} className={`flex items-center gap-3 rounded-[20px] p-3 text-left transition-colors ${on ? 'bg-pill text-onpill' : 'bg-surface2'}`}>
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${on ? 'bg-onpill/10' : 'bg-surface'}`}><Icon size={18} strokeWidth={1.5} /></span>
                    <span className="min-w-0"><span className="block text-[14px] font-medium">{m.id}</span><span className={`block truncate text-[11.5px] ${on ? 'text-onpill/60' : 'text-mute'}`}>{m.note}</span></span>
                  </motion.button>
                );
              })}
            </div>
            {amountInput(amt, (v) => { setAmt(v); setErr(''); }, code, true)}
            {kind === 'withdraw' && <button onClick={() => setAmt(formatMoney(BigInt(wallet.balanceMinor), code).replace(/[^\d.]/g, ''))} className="-mt-2 self-end text-[13px] text-mute hover:text-ink">Withdraw all</button>}
            {err && <p className="text-[13px] text-down">{err}</p>}
            <Pill tone="lime" size="lg" onClick={submit}>{kind === 'deposit' ? 'Deposit' : 'Withdraw'}{parsed ? ` ${formatMoney(parsed, code)}` : ''}</Pill>
            <p className="text-center text-[12px] text-faint">Demo only. CADNEX never takes or pays real money.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

function SetBalance() {
  const user = useSession((s) => s.user)!;
  const wallet = useSession((s) => s.wallet)!;
  const [mode, setMode] = useState<'add' | 'subtract' | 'set'>('add');
  const [amt, setAmt] = useState('');
  const [err, setErr] = useState('');
  const code = wallet.currency;
  const presets = [100, 1_000, 10_000, 100_000];
  const run = async (amount: Minor) => {
    try {
      if (mode !== 'subtract' && mode !== 'set') await checkDeposit(user.id, amount, code);
      if (mode === 'set') {
        const cur = BigInt(wallet.balanceMinor);
        if (amount > cur) await checkDeposit(user.id, amount - cur, code);
        await walletService.setBalance(user.id, amount);
      } else await walletService.adjust(user.id, mode === 'add' ? amount : -amount);
      await useSession.getState().refreshAll();
      setAmt('');
      setErr('');
      useUi.getState().toast({ tone: 'demo', title: mode === 'set' ? `Balance set to ${formatMoney(amount, code)}` : `${mode === 'add' ? 'Added' : 'Removed'} ${formatMoney(amount, code)}` });
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const parsed = parseAmount(amt, code);
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-[16px] font-medium">Demo <span className="text-mute">balance</span></p>
        <span className="text-[12px] text-mute">Up to {formatMoney(maxBalance(code), code, { noDecimals: true, compact: true })}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-surface2 p-1">
        {(['add', 'subtract', 'set'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`relative h-10 rounded-full text-[13.5px] font-medium ${mode === m ? 'text-onpill' : 'text-mute'}`}>
            {mode === m && <motion.span layoutId="balmode" className="absolute inset-0 rounded-full bg-pill" transition={spring} />}
            <span className="relative">{m === 'add' ? 'Add' : m === 'subtract' ? 'Subtract' : 'Set exact'}</span>
          </button>
        ))}
      </div>
      {mode !== 'set' && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <motion.button key={p} whileTap={press} onClick={() => void run(units(p, code))} className="mono flex h-11 items-center justify-center gap-0.5 rounded-full bg-surface2 text-[13px] hover:bg-surface3">
              {mode === 'add' ? <Plus size={12} /> : <Minus size={12} />}{p >= 1000 ? `${p / 1000}K` : p}
            </motion.button>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input inputMode="decimal" value={amt} onChange={(e) => { setAmt(e.target.value.replace(/[^\d.,]/g, '')); setErr(''); }} placeholder={mode === 'set' ? 'New balance' : 'Custom amount'} aria-label="Custom amount" className="mono h-12 min-w-0 flex-1 rounded-full bg-surface2 px-5 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-lime" />
        <Pill tone="lime" onClick={() => parsed !== null && void run(parsed)} disabled={parsed === null || (mode !== 'set' && parsed === 0n)}>Apply</Pill>
      </div>
      {err && <p className="mt-2 text-[13px] text-down">{err}</p>}
    </div>
  );
}

const TYPE_LABEL: Record<LedgerType, string> = {
  DEPOSIT: 'Deposit', WITHDRAW: 'Withdrawal', DEMO_ADJUST: 'Demo adjustment', BET_PLACED: 'Bet placed', BET_WON: 'Bet won', BET_REFUND: 'Refund', CASHOUT: 'Cash out', CURRENCY_CONVERT: 'Currency change', BONUS: 'Bonus',
};

function LedgerList() {
  const ledger = useSession((s) => s.ledger);
  const [type, setType] = useState<LedgerType | 'ALL'>('ALL');
  const [range, setRange] = useState<'all' | 'day' | 'week' | 'month'>('all');
  const [cur, setCur] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const currencies = useMemo(() => Array.from(new Set(ledger.map((r) => r.currency))), [ledger]);
  const since = range === 'all' ? 0 : Date.now() - (range === 'day' ? 1 : range === 'week' ? 7 : 30) * 86_400_000;
  const rows = ledger.filter((r) => (type === 'ALL' || r.type === type) && r.createdAt >= since && (cur === 'ALL' || r.currency === cur) && (!q || `${r.note ?? ''} ${TYPE_LABEL[r.type]} ${r.refId ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const types: (LedgerType | 'ALL')[] = ['ALL', 'BET_PLACED', 'BET_WON', 'CASHOUT', 'BET_REFUND', 'DEPOSIT', 'WITHDRAW', 'DEMO_ADJUST', 'BONUS', 'CURRENCY_CONVERT'];
  return (
    <section id="history" className="scroll-mt-24">
      <SectionHead a="Transaction" b="history" />
      <label className="mb-3 flex h-12 items-center gap-2 rounded-full bg-surface2 px-4">
        <Search size={16} strokeWidth={1.5} className="text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes, matches or refs" aria-label="Search transactions" className="w-full bg-transparent text-[14px] outline-none placeholder:text-faint" />
      </label>
      <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {types.map((t) => <Chip key={t} active={type === t} onClick={() => setType(t)}>{t === 'ALL' ? 'All types' : TYPE_LABEL[t]}</Chip>)}
      </div>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {(['all', 'day', 'week', 'month'] as const).map((r) => <Chip key={r} active={range === r} onClick={() => setRange(r)}>{r === 'all' ? 'All time' : r === 'day' ? '24 hours' : r === 'week' ? '7 days' : '30 days'}</Chip>)}
        {currencies.length > 1 && ['ALL', ...currencies].map((c) => <Chip key={c} active={cur === c} onClick={() => setCur(c)}>{c === 'ALL' ? 'All currencies' : c}</Chip>)}
      </div>
      {rows.length === 0 ? <Empty title="No transactions match" /> : (
        <div className="overflow-hidden rounded-card bg-surface">
          {rows.slice(0, 200).map((r: LedgerRow) => {
            const amt = BigInt(r.amountMinor);
            const isConvert = r.type === 'CURRENCY_CONVERT';
            return (
              <div key={r.id} className="flex items-center gap-3 border-b hair px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{TYPE_LABEL[r.type]}</p>
                  <p className="truncate text-[12.5px] text-mute">{r.note}</p>
                  <p className="text-[11.5px] text-faint">{new Date(r.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{r.refId && <> · <Link to={`/bets#${r.refId}`} className="underline-offset-2 hover:underline">Ref {shortRef(r.refId)}</Link></>}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`num text-[14.5px] font-medium ${isConvert ? 'text-ink' : amt > 0n ? 'text-up' : amt < 0n ? 'text-ink' : 'text-mute'}`}>{isConvert ? formatMoney(amt, r.currency) : formatMoney(amt, r.currency, { sign: true })}</p>
                  <p className="num text-[11.5px] text-mute">Balance {formatMoney(BigInt(r.balanceAfterMinor), r.currency)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function WalletPage() {
  const user = useSession((s) => s.user)!;
  const wallet = useSession((s) => s.wallet);
  const [params, setParams] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const [picker, setPicker] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const action = params.get('action') as 'deposit' | 'withdraw' | null;
  useEffect(() => {
    if (loc.hash === '#history') setTimeout(() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' }), 150);
  }, [loc.hash]);
  if (!wallet) return null;
  const change = async (mode: 'convert' | 'keep') => {
    if (!pending) return;
    await walletService.changeCurrency(user.id, pending, mode);
    await useSession.getState().refreshAll();
    useUi.getState().toast({ tone: 'demo', title: `Wallet now in ${pending}` });
    setPending(null);
  };
  const bal = BigInt(wallet.balanceMinor);
  return (
    <div className="relative flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] [mask-image:radial-gradient(70%_80%_at_50%_20%,black,transparent)]"><Orbs palette="wallet" intensity={0.55} /></div>
      <div className="relative"><TwoTone a="Your" b="wallet" size="xl" as="h1" /></div>
      <div className="relative">
        <FrostedWalletCard onDeposit={() => setParams({ action: 'deposit' })} onWithdraw={() => setParams({ action: 'withdraw' })} onCurrency={() => setPicker(true)} />
      </div>
      <SetBalance />
      <button onClick={() => setPicker(true)} className="card flex items-center gap-3 p-4 text-left">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-[20px]">{currency(wallet.currency).glyph}</span>
        <span className="flex-1"><span className="block text-[15px] font-medium">{currency(wallet.currency).name}</span><span className="block text-[12.5px] text-mute">Display currency · tap to change</span></span>
        <span className="rounded-full bg-surface2 px-3 py-1.5 text-[13px] font-medium">{wallet.currency}</span>
      </button>
      <LedgerList />
      <MoveSheet kind="deposit" open={action === 'deposit'} onClose={() => nav('/wallet', { replace: true })} />
      <MoveSheet kind="withdraw" open={action === 'withdraw'} onClose={() => nav('/wallet', { replace: true })} />
      <CurrencyPicker open={picker} onClose={() => setPicker(false)} value={wallet.currency} onPick={(c) => c !== wallet.currency && setPending(c)} />
      <Sheet open={!!pending} onClose={() => setPending(null)} title={<>Switch to <span className="text-mute">{pending}</span></>}>
        {pending && (
          <div className="flex flex-col gap-3">
            <button onClick={() => void change('convert')} className="rounded-[22px] bg-surface2 p-4 text-left hover:bg-surface3">
              <p className="text-[15px] font-medium">Convert my balance</p>
              <p className="mt-1 text-[13px] text-mute">{formatMoney(bal, wallet.currency)} becomes <span className="num text-ink">{formatMoney(convertMinor(bal, wallet.currency, pending), pending)}</span></p>
              <p className="mt-1 text-[12px] text-faint">Demo rate: 1 {wallet.currency} = {(() => { const r = fxRate(wallet.currency, pending); return r < 0.001 ? r.toPrecision(4) : r.toFixed(r < 1 ? 6 : 4); })()} {pending}</p>
            </button>
            <button onClick={() => void change('keep')} className="rounded-[22px] bg-surface2 p-4 text-left hover:bg-surface3">
              <p className="text-[15px] font-medium">Keep the number</p>
              <p className="mt-1 text-[13px] text-mute">Show the same amount, now in {pending}.</p>
            </button>
            <p className="px-1 text-[12px] text-faint">Open bets stay in the currency you placed them in. Winnings are converted at the demo rate.</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
