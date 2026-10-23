/** My Bets: open, cash-out-able and settled bets with leg-by-leg detail. */
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BetRow } from '../../db/db';
import type { EventPublic } from '../../engine/types';
import { Crest } from '../../components/Crest';
import { scoreOf } from '../../components/match';
import { spring } from '../../components/motion';
import { useOddsFmt } from '../../components/OddsButton';
import { Sheet } from '../../components/Sheet';
import { Empty, LiveDot, Pill, Tabs, TwoTone } from '../../components/ui';
import { cashOutValue, LegQuote } from '../../lib/betting';
import { formatMoney, LegResult, Minor } from '../../lib/money';
import { betService, shortRef } from '../../services/betService';
import { findSelection, useLive } from '../../store/live';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { leagueById } from '../../data/leagues';

const RESULT_LABEL: Record<LegResult, string> = { PENDING: 'Open', WON: 'Won', LOST: 'Lost', VOID: 'Void', PUSH: 'Push', HALF_WON: 'Half won', HALF_LOST: 'Half lost' };

function quotesFor(bet: BetRow, events: Record<string, EventPublic>): (LegQuote | null)[] {
  return bet.legs.map((l) => {
    if (l.result !== 'PENDING') return null;
    const f = findSelection(events[l.eventId], l.marketKey, l.code);
    if (!f) return { fair: 0, available: false };
    return { fair: f.selection.fair, available: f.market.status === 'OPEN' && !f.market.closed && f.selection.fair > 0 };
  });
}

export function useCashOut(bet: BetRow): Minor | null {
  const events = useLive((s) => s.events);
  return useMemo(() => cashOutValue(bet, quotesFor(bet, events)), [bet, events]);
}

function statusTone(b: BetRow): { label: string; cls: string } {
  switch (b.status) {
    case 'WON': return { label: 'Won', cls: 'bg-lime text-onlime' };
    case 'LOST': return { label: BigInt(b.returnMinor ?? '0') > 0n ? 'Part refund' : 'Lost', cls: 'bg-down/12 text-down' };
    case 'VOID': return { label: 'Void', cls: 'bg-surface3 text-mute' };
    case 'CASHED_OUT': return { label: 'Cashed out', cls: 'bg-lavender/20 text-lavender' };
    case 'PARTIALLY_CASHED_OUT': return { label: 'Part cashed out', cls: 'bg-lavender/20 text-lavender' };
    default: return { label: 'Open', cls: 'bg-surface3 text-ink' };
  }
}

function typeLabel(b: BetRow): string {
  if (b.type === 'SINGLE') return 'Single';
  if (b.type === 'PARLAY') return `${b.legs.length}-leg parlay`;
  return `System · ${b.systemType}`;
}

function CashOutSheet({ bet, open, onClose }: { bet: BetRow; open: boolean; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const events = useLive((s) => s.events);
  const value = useCashOut(bet);
  const [pct, setPct] = useState(100);
  const [busy, setBusy] = useState(false);
  const paid = value ? (value * BigInt(pct)) / 100n : 0n;
  const go = async () => {
    if (!user || !value) return;
    setBusy(true);
    try {
      const r = await betService.cashOut(user.id, bet.id, pct / 100, quotesFor(bet, events), value);
      await useSession.getState().refreshAll();
      useUi.getState().toast({ tone: 'win', title: `Cashed out ${formatMoney(r.paid, bet.currency)}`, body: `Ref ${shortRef(bet.id)}` });
      useUi.getState().win();
      onClose();
    } catch (e) {
      useUi.getState().toast({ tone: 'error', title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={<>Cash <span className="text-mute">out</span></>}>
      {value ? (
        <div className="flex flex-col gap-5">
          <div className="text-center">
            <p className="text-[13px] text-mute">You receive</p>
            <motion.p key={paid.toString()} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} className="num mt-1 text-[44px] font-medium tracking-tighter2">{formatMoney(paid, bet.currency)}</motion.p>
            <p className="text-[13px] text-mute">Full value {formatMoney(value, bet.currency)} · updates live</p>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-[13px]"><span className="text-mute">Amount to cash out</span><span className="num font-medium">{pct}%</span></div>
            <input type="range" min={10} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Cash out percentage" className="w-full accent-[rgb(var(--lime))]" />
            {pct < 100 && <p className="mt-2 text-[12.5px] text-mute">{formatMoney((BigInt(bet.activeStakeMinor) * BigInt(100 - pct)) / 100n, bet.currency)} of your stake stays on the bet.</p>}
          </div>
          <Pill tone="lime" size="lg" onClick={go} disabled={busy}>{busy ? 'Cashing out' : `Cash out ${formatMoney(paid, bet.currency)}`}</Pill>
        </div>
      ) : (
        <p className="py-6 text-center text-[14px] text-mute">Cash out is paused while a market is suspended. It returns when prices reopen.</p>
      )}
    </Sheet>
  );
}

export function Receipt({ bet, open, onClose }: { bet: BetRow; open: boolean; onClose: () => void }) {
  const fmt = useOddsFmt();
  const user = useSession((s) => s.user);
  const tone = statusTone(bet);
  const ret = BigInt(bet.returnMinor ?? '0') + (bet.status === 'CASHED_OUT' ? 0n : BigInt(bet.cashedOutMinor));
  return (
    <Sheet open={open} onClose={onClose} title={<>Bet <span className="text-mute">receipt</span></>}>
      <div className="relative overflow-hidden rounded-[28px] bg-[#0E0E11] p-6 text-white" style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.08)' }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#7c6cf6]/45 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-[#b5f23d]/25 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <span className="text-[15px] font-semibold tracking-tighter2">CDNX</span>
          <span className={`rounded-full px-3 py-1 text-[12px] font-medium ${tone.cls}`}>{tone.label}</span>
        </div>
        <p className="relative mt-6 text-[13px] text-white/50">{typeLabel(bet)} · Ref {shortRef(bet.id)}</p>
        <p className="num relative mt-1 text-[40px] font-medium leading-none tracking-tighter2">{fmt(bet.totalOdds)}</p>
        <ul className="relative mt-5 flex flex-col gap-3">
          {bet.legs.map((l) => (
            <li key={l.selectionId} className="flex items-start justify-between gap-3 text-[13px]">
              <span className="min-w-0"><span className="block truncate font-medium">{l.label}</span><span className="block truncate text-white/50">{l.marketName} · {l.home} v {l.away}</span></span>
              <span className="mono shrink-0 text-white/70">{fmt(l.odds)}</span>
            </li>
          ))}
        </ul>
        <div className="relative mt-6 grid grid-cols-2 gap-y-1 border-t border-white/10 pt-4 text-[13px]">
          <span className="text-white/50">Stake</span><span className="num text-right">{formatMoney(BigInt(bet.stakeMinor), bet.currency)}</span>
          <span className="text-white/50">{bet.status === 'OPEN' ? 'Potential return' : 'Returned'}</span><span className="num text-right text-[16px] font-medium">{formatMoney(bet.status === 'OPEN' ? BigInt(bet.potentialReturnMinor) : ret, bet.currency)}</span>
        </div>
        <p className="relative mt-5 text-[11px] text-white/35">{user?.username} · {new Date(bet.placedAt).toLocaleString()} · Virtual funds</p>
      </div>
      <p className="mt-3 text-center text-[12.5px] text-mute">Take a screenshot to share this receipt.</p>
    </Sheet>
  );
}

function BetCard({ bet }: { bet: BetRow }) {
  const [open, setOpen] = useState(false);
  const [cashing, setCashing] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const events = useLive((s) => s.events);
  const fmt = useOddsFmt();
  const value = useCashOut(bet);
  const tone = statusTone(bet);
  const isOpen = bet.status === 'OPEN' || bet.status === 'PARTIALLY_CASHED_OUT';
  const ret = BigInt(bet.returnMinor ?? '0') + (bet.status === 'CASHED_OUT' ? 0n : BigInt(bet.cashedOutMinor));
  const lost = bet.status === 'LOST' && ret === 0n;
  return (
    <motion.div layout transition={spring} className={`overflow-hidden rounded-[26px] ${lost ? 'bg-down/[0.06]' : 'bg-surface'}`} style={{ boxShadow: 'inset 0 1px 0 rgb(var(--edge) / var(--edge-a))' }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${tone.cls}`}>{tone.label}</span>
            <span className="text-[12.5px] text-mute">{typeLabel(bet)}</span>
          </div>
          <p className="mt-2 truncate text-[15px] font-medium">{bet.legs.length === 1 ? bet.legs[0].label : bet.legs.map((l) => l.label).join(' · ')}</p>
          <p className="truncate text-[12.5px] text-mute">{bet.legs.length === 1 ? `${bet.legs[0].marketName} · ${bet.legs[0].home} v ${bet.legs[0].away}` : `${bet.legs.filter((l) => l.result === 'WON' || l.result === 'HALF_WON').length} of ${bet.legs.length} legs won so far`}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="mono text-[15px] font-medium">{fmt(bet.totalOdds)}</p>
          <p className="num text-[12px] text-mute">{formatMoney(BigInt(bet.stakeMinor), bet.currency)}</p>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} className="mt-1 inline-block text-mute"><ChevronDown size={16} strokeWidth={1.5} /></motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={spring} className="overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12 } }} exit={{ opacity: 0 }} className="flex flex-col gap-2 px-4 pb-2">
              {bet.legs.map((l) => {
                const ev = events[l.eventId];
                const [sh, sa] = ev ? scoreOf(ev) : ['', ''];
                return (
                  <Link key={l.selectionId} to={`/event/${l.eventId}`} className="flex items-center gap-3 rounded-[18px] bg-surface2 px-3 py-2.5">
                    {ev ? <Crest p={ev.home} sport={ev.sport} size={24} /> : <span className="h-6 w-6 rounded-full bg-surface3" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{l.label} <span className="mono font-normal text-mute">{fmt(l.odds)}</span></p>
                      <p className="truncate text-[12px] text-mute">{l.marketName} · {l.home} v {l.away} · {leagueById(l.leagueId).short}</p>
                    </div>
                    {l.result === 'PENDING' ? (
                      ev?.status === 'LIVE' ? (
                        <span className="flex shrink-0 flex-col items-end"><span className="mono text-[13px]">{sh}–{sa}</span><span className="inline-flex items-center gap-1 text-[11px] text-down"><LiveDot />{ev.clock}</span></span>
                      ) : <span className="shrink-0 text-[12px] text-mute">{ev?.status === 'FINISHED' ? 'Settling' : 'Upcoming'}</span>
                    ) : (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium ${l.result === 'WON' || l.result === 'HALF_WON' ? 'bg-lime/20 text-up' : l.result === 'LOST' || l.result === 'HALF_LOST' ? 'bg-down/12 text-down' : 'bg-surface3 text-mute'}`}>{RESULT_LABEL[l.result]}</span>
                    )}
                  </Link>
                );
              })}
              <div className="mt-1 grid grid-cols-2 gap-y-1 px-1 text-[13px]">
                <span className="text-mute">Placed</span><span className="text-right text-mute">{new Date(bet.placedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {BigInt(bet.cashedOutMinor) > 0n && (<><span className="text-mute">Cashed out</span><span className="num text-right">{formatMoney(BigInt(bet.cashedOutMinor), bet.currency)}</span></>)}
                <span className="text-mute">Ref</span><span className="mono text-right text-mute">{shortRef(bet.id)}</span>
              </div>
              <button onClick={() => setReceipt(true)} className="mt-1 inline-flex h-10 items-center gap-2 self-start rounded-full px-1 text-[13px] text-mute hover:text-ink"><ReceiptText size={15} strokeWidth={1.5} />View receipt</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between gap-3 border-t hair px-4 py-3">
        <div>
          <p className="text-[12px] text-mute">{isOpen ? 'Potential return' : 'Returned'}</p>
          <p className={`num text-[17px] font-medium ${bet.status === 'WON' || bet.status === 'CASHED_OUT' ? 'text-up' : ''}`}>{formatMoney(isOpen ? BigInt(bet.potentialReturnMinor) : ret, bet.currency)}</p>
        </div>
        {isOpen && bet.type !== 'SYSTEM' && (
          <Pill tone={value ? 'primary' : 'soft'} size="sm" disabled={!value} onClick={() => setCashing(true)} className="min-w-[132px]">
            {value ? <>Cash out <span className="num">{formatMoney(value, bet.currency, { compact: true })}</span></> : 'Cash out paused'}
          </Pill>
        )}
      </div>
      <CashOutSheet bet={bet} open={cashing} onClose={() => setCashing(false)} />
      <Receipt bet={bet} open={receipt} onClose={() => setReceipt(false)} />
    </motion.div>
  );
}

export function MyBets() {
  const bets = useSession((s) => s.bets);
  const events = useLive((s) => s.events);
  const [tab, setTab] = useState<'open' | 'cashout' | 'settled'>('open');
  const open = bets.filter((b) => b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT');
  const cashable = open.filter((b) => cashOutValue(b, quotesFor(b, events)) !== null);
  const settled = bets.filter((b) => !(b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT'));
  const list = tab === 'open' ? open : tab === 'cashout' ? cashable : settled;
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <TwoTone a="Your" b="bets" size="xl" as="h1" />
      <Tabs id="betstabs" value={tab} onChange={setTab} tabs={[
        { id: 'open', label: 'Open', count: open.length },
        { id: 'cashout', label: 'Cash out', count: cashable.length },
        { id: 'settled', label: 'Settled', count: settled.length },
      ]} />
      <div className="flex flex-col gap-3">
        {list.length === 0 ? (
          <Empty
            title={tab === 'settled' ? 'No settled bets yet' : tab === 'cashout' ? 'Nothing to cash out right now' : 'No open bets'}
            body={tab === 'open' ? 'Pick a match and tap a price to start a slip.' : undefined}
            action={tab === 'open' ? <Link to="/live" className="rounded-full bg-lime px-5 py-3 text-[14px] font-medium text-onlime">See live matches</Link> : undefined}
          />
        ) : (
          list.map((b, i) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 8) * 0.035 }}>
              <BetCard bet={b} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
