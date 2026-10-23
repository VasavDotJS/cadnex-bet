/** Signature components A (stacked balance card) and B (frosted wallet card). */
import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Copy, Eye, EyeOff, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { currency } from '../lib/currencies';
import { balanceSeries, computeStats } from '../services/statsService';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';
import { RollingMoney } from './Money';
import { gentle, press, spring } from './motion';
import { Sparkline } from './Sparkline';

export function useBalanceStats() {
  const wallet = useSession((s) => s.wallet);
  const bets = useSession((s) => s.bets);
  const ledger = useSession((s) => s.ledger);
  return useMemo(() => {
    if (!wallet) return null;
    const series = balanceSeries(ledger, wallet.currency);
    const all = computeStats(bets, wallet.currency);
    const month = computeStats(bets, wallet.currency, Date.now() - 30 * 86_400_000);
    return { series, all, month };
  }, [wallet, bets, ledger]);
}

export function StackedBalanceCard() {
  const wallet = useSession((s) => s.wallet);
  const hidden = useSession((s) => s.settings?.hideBalance ?? false);
  const update = useSession((s) => s.updateSettings);
  const mood = useUi((s) => s.mood);
  const nav = useNavigate();
  const st = useBalanceStats();
  if (!wallet || !st) return null;
  const pct = Math.round(st.all.winRate * 100);
  const up = st.series[st.series.length - 1] >= st.series[0];
  return (
    <div className="relative mx-auto w-full max-w-[460px] pb-[78px]">
      {/* lime base */}
      <motion.div
        className="absolute inset-x-0 bottom-0 top-10 rounded-card bg-lime"
        animate={{ boxShadow: mood === 'win' ? '0 0 0 2px rgb(var(--lime) / 0.6), 0 0 60px 6px rgb(var(--lime) / 0.55)' : '0 24px 48px -28px rgb(0 0 0 / 0.5)' }}
        transition={{ duration: 0.6 }}
      >
        <div className="absolute inset-x-0 bottom-0 flex h-[78px] items-center justify-between px-6">
          <span className="num text-[38px] font-medium leading-none tracking-tighter2 text-onlime">{st.all.settled ? `${pct}%` : '—'}</span>
          <span className="rounded-full bg-onlime/12 px-3.5 py-1.5 text-[13px] font-medium text-onlime/80">Win rate</span>
        </div>
      </motion.div>
      {/* dark top card */}
      <motion.div
        layout
        transition={gentle}
        whileTap={{ scale: 0.99 }}
        onClick={() => nav('/wallet')}
        role="link"
        aria-label="Open wallet"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && nav('/wallet')}
        className="relative cursor-pointer overflow-hidden rounded-card bg-[#0E0E11] px-6 pb-5 pt-5 text-white"
        style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.09), 0 30px 50px -20px rgb(0 0 0 / 0.6)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-white/50">Balance</span>
          <motion.button
            whileTap={press}
            transition={spring}
            onClick={(e) => { e.stopPropagation(); void update({ hideBalance: !hidden }); }}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-white/50 hover:text-white"
          >
            {hidden ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
          </motion.button>
        </div>
        <div className="mt-1 min-h-[60px]">
          <RollingMoney amount={BigInt(wallet.balanceMinor)} code={wallet.currency} size={currency(wallet.currency).kind === 'crypto' ? 38 : 50} hidden={hidden} symbolClass="text-white/55" fracClass="text-white/40" className="font-medium text-white" />
        </div>
        <Sparkline values={st.series} width={420} height={92} stroke={up ? 'rgb(34 197 94)' : 'rgb(244 63 94)'} className="mt-2 h-[92px] w-full" />
        <p className="mt-2 text-[13px] text-white/45">Balance · Last 30 days</p>
      </motion.div>
    </div>
  );
}

export function accountId(userId: string): string {
  const hex = userId.replace(/^u_/, '').toUpperCase();
  return `CDNX-${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export function CurrencyStack({ codes, onMore }: { codes: string[]; onMore?: () => void }) {
  return (
    <div className="flex items-center">
      {codes.map((c, i) => (
        <span key={c} className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/70 bg-[#B9B9D4] text-[15px] text-[#2B2950] first:ml-0 dark-coin" style={{ zIndex: 10 - i }} title={currency(c).name}>
          {currency(c).glyph}
        </span>
      ))}
      {onMore && (
        <button onClick={onMore} aria-label="Change currency" className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/70 bg-white text-[#2B2950]">
          <Plus size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

export function FrostedWalletCard({ onDeposit, onWithdraw, onCurrency }: { onDeposit: () => void; onWithdraw: () => void; onCurrency: () => void }) {
  const wallet = useSession((s) => s.wallet);
  const user = useSession((s) => s.user);
  const hidden = useSession((s) => s.settings?.hideBalance ?? false);
  const st = useBalanceStats();
  if (!wallet || !user || !st) return null;
  const roi = st.month.roi * 100;
  const id = accountId(user.id);
  const cur = currency(wallet.currency);
  const others = (cur.kind === 'crypto' ? ['BTC', 'ETH', 'SOL'] : ['USD', 'EUR', 'BTC']).filter((c) => c !== wallet.currency).slice(0, 2);
  return (
    <div className="rounded-[34px] bg-surface p-2.5" style={{ boxShadow: 'inset 0 1px 0 rgb(var(--edge) / var(--edge-a)), inset 0 0 0 1px rgb(var(--line) / 0.04), var(--shadow-lift)' }}>
      <div className="wallet-mesh relative overflow-hidden rounded-[26px] px-6 pb-5 pt-5">
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[13px] opacity-60">Main wallet</p>
            <p className="mt-0.5 font-mono text-[15px] font-medium tracking-tight">{id}</p>
          </div>
          <motion.button
            whileTap={press}
            onClick={() => { void navigator.clipboard?.writeText(id.replace('…', '')); useUi.getState().toast({ tone: 'neutral', title: 'Account ID copied' }); }}
            className="-mr-2 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full opacity-70 hover:opacity-100"
            aria-label="Copy account ID"
          >
            <Copy size={22} strokeWidth={1.5} />
          </motion.button>
        </div>
        <div className="relative mt-6">
          <RollingMoney amount={BigInt(wallet.balanceMinor)} code={wallet.currency} size={cur.kind === 'crypto' ? 40 : 54} hidden={hidden} className="font-semibold" symbolClass="opacity-90" fracClass="opacity-50" />
        </div>
        <div className="relative mt-5 flex items-center justify-between">
          <CurrencyStack codes={[wallet.currency, ...others]} onMore={onCurrency} />
          <span className={`num rounded-full px-3.5 py-1.5 text-[14px] font-medium ${roi >= 0 ? 'bg-[#22C55E]/18 text-[#15803D] dark-up' : 'bg-[#F43F5E]/15 text-[#BE123C] dark-down'}`} title="Return on stakes, last 30 days">
            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <motion.button whileTap={press} transition={spring} onClick={onDeposit} className="flex h-[60px] items-center gap-3 rounded-full bg-surface2 pl-2 pr-5 text-[16px] font-medium hover:bg-surface3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface"><ArrowDownLeft size={20} strokeWidth={1.5} className="text-mute" /></span>
          Deposit
        </motion.button>
        <motion.button whileTap={press} transition={spring} onClick={onWithdraw} className="flex h-[60px] items-center gap-3 rounded-full bg-surface2 pl-2 pr-5 text-[16px] font-medium hover:bg-surface3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface"><ArrowUpRight size={20} strokeWidth={1.5} className="text-mute" /></span>
          Withdraw
        </motion.button>
      </div>
    </div>
  );
}
