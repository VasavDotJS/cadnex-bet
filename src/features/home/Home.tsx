/** Home: gradient header, stacked balance card, live carousel, starting soon, popular accas. */
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Bell, Gift, History, Search, Ticket, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StackedBalanceCard } from '../../components/cards';
import { MatchRow, LiveCard } from '../../components/match';
import { useOddsFmt } from '../../components/OddsButton';
import { press, spring } from '../../components/motion';
import { Empty, Pill, SectionHead, Tabs, useNow } from '../../components/ui';
import { formatMoney } from '../../lib/money';
import { claimDaily, dailyAmount, nextDailyAt } from '../../services/rewardService';
import { findSelection, useLive } from '../../store/live';
import { useLiveIds, usePopularAccas, useUpcomingIds } from '../../store/selectors';
import { useSession } from '../../store/session';
import { useSlip } from '../../store/slip';
import { useUi } from '../../store/ui';
import { DemoBadge } from '../shell/Shell';
import { useUnread } from '../notifications/Notifications';

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function QuickAction({ icon, label, onClick, badge }: { icon: React.ReactNode; label: string; onClick: () => void; badge?: number }) {
  return (
    <motion.button whileTap={press} transition={spring} onClick={onClick} className="flex flex-col items-center gap-2">
      <span className="relative inline-flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-md" style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.18)' }}>
        {icon}
        {!!badge && <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-lime px-1 text-[11px] font-semibold text-onlime">{badge}</span>}
      </span>
      <span className="text-[12.5px] text-white/75">{label}</span>
    </motion.button>
  );
}

function DailyStrip() {
  const user = useSession((s) => s.user);
  const wallet = useSession((s) => s.wallet);
  const [next, setNext] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (user) void nextDailyAt(user.id).then(setNext);
  }, [user]);
  if (!user || !wallet || next === null || dismissed) return null;
  const ready = next <= Date.now();
  const claim = async () => {
    try {
      const amt = await claimDaily(user.id);
      await useSession.getState().refreshAll();
      useUi.getState().toast({ tone: 'win', title: `${formatMoney(amt, wallet.currency)} added`, body: 'Daily reward claimed. Come back tomorrow for another.' });
      useUi.getState().win();
      setNext(Date.now() + 86_400_000);
    } catch (e) {
      useUi.getState().toast({ tone: 'error', title: (e as Error).message });
    }
  };
  return (
    <motion.div layout className="glass mx-4 -mt-1 flex items-center gap-3 rounded-[22px] py-2.5 pl-3 pr-2 md:mx-0">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface2"><Gift size={18} strokeWidth={1.5} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px]">{ready ? `Claim your daily reward of ${formatMoney(dailyAmount(wallet.currency), wallet.currency, { trim: true })}` : 'Daily reward claimed'}</p>
        {ready ? (
          <button onClick={claim} className="text-[13px] font-medium text-up">Claim now →</button>
        ) : (
          <p className="text-[12.5px] text-mute">Next one at {new Date(next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        )}
      </div>
      <button aria-label="Dismiss" onClick={() => setDismissed(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-mute hover:text-ink"><X size={16} strokeWidth={1.5} /></button>
    </motion.div>
  );
}

function Accas() {
  const accas = usePopularAccas();
  const fmt = useOddsFmt();
  const events = useLive((s) => s.events);
  if (!accas.length) return null;
  const add = (legs: (typeof accas)[number]['legs']) => {
    const sels = legs.flatMap((l) => {
      const ev = events[l.ev.id];
      const f = findSelection(ev, l.marketKey, l.code);
      if (!ev || !f || f.market.status !== 'OPEN') return [];
      return [{ id: f.selection.id, eventId: ev.id, marketKey: l.marketKey, code: l.code, sport: ev.sport, leagueId: ev.leagueId, home: ev.home.name, away: ev.away.name, marketName: f.market.name, label: f.selection.label, odds: f.selection.odds, startTime: ev.startTime }];
    });
    if (sels.length < 2) { useUi.getState().toast({ tone: 'error', title: 'Some prices are suspended. Try again in a moment.' }); return; }
    useSlip.getState().replace(sels);
    useSlip.getState().setMode('parlay');
    if (window.innerWidth < 1024) useUi.getState().setSlip('half');
  };
  return (
    <section className="px-4 md:px-0">
      <SectionHead a="Popular" b="accas" />
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {accas.map((a) => {
          const total = a.legs.reduce((x, l) => x * (findSelection(events[l.ev.id], l.marketKey, l.code)?.selection.odds ?? l.odds), 1);
          return (
            <div key={a.title} className="card flex w-[300px] shrink-0 flex-col p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] font-medium">{a.title}</p>
                <span className="mono text-[22px] font-medium tracking-tighter2">{fmt(total)}</span>
              </div>
              <ul className="mt-3 flex flex-col gap-2">
                {a.legs.map((l) => (
                  <li key={l.ev.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate"><span className="text-ink">{l.label}</span> <span className="text-mute">· {l.ev.home.short} v {l.ev.away.short}</span></span>
                    <span className="mono text-mute">{fmt(findSelection(events[l.ev.id], l.marketKey, l.code)?.selection.odds ?? l.odds)}</span>
                  </li>
                ))}
              </ul>
              <Pill tone="primary" size="sm" className="mt-4" onClick={() => add(a.legs)}>Add {a.legs.length}-leg parlay</Pill>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Home() {
  const user = useSession((s) => s.user)!;
  const openBets = useSession((s) => s.bets.filter((b) => b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT').length);
  const nav = useNavigate();
  const [seg, setSeg] = useState<'sports' | 'live'>('sports');
  const liveIds = useLiveIds();
  const upcoming = useUpcomingIds(8);
  const ready = useLive((s) => s.ready);
  const unread = useUnread();
  useNow(1000);
  return (
    <div className="flex flex-col gap-7">
      {/* C. gradient app header */}
      <div className="app-header relative overflow-hidden px-4 pb-6 pt-[max(18px,env(safe-area-inset-top))] text-white md:rounded-card md:px-6 lg:mt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-semibold tracking-tighter2">CDNX</span>
            <DemoBadge className="!bg-white/12 !text-white/80 [&>span]:!bg-lime" />
          </div>
          <div className="flex items-center gap-1 lg:hidden">
            <button onClick={() => useUi.getState().setSearch(true)} aria-label="Search" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10"><Search size={19} strokeWidth={1.5} /></button>
            <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
              <Bell size={19} strokeWidth={1.5} />
              {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-lime" />}
            </Link>
          </div>
        </div>
        <h1 className="mt-6 text-[30px] font-semibold leading-[1.02] tracking-tighter2">
          {greeting()},<br /><span className="text-white/55">{user.username}</span>
        </h1>
        <div className="mt-6 grid grid-cols-4 gap-2">
          <QuickAction icon={<ArrowDownLeft size={22} strokeWidth={1.5} />} label="Deposit" onClick={() => nav('/wallet?action=deposit')} />
          <QuickAction icon={<ArrowUpRight size={22} strokeWidth={1.5} />} label="Withdraw" onClick={() => nav('/wallet?action=withdraw')} />
          <QuickAction icon={<Ticket size={22} strokeWidth={1.5} />} label="Bet slip" onClick={() => (window.innerWidth < 1024 ? useUi.getState().setSlip('half') : document.getElementById('slip-anchor')?.scrollIntoView({ behavior: 'smooth' }))} badge={useSlip.getState().sels.length || undefined} />
          <QuickAction icon={<History size={22} strokeWidth={1.5} />} label="History" onClick={() => nav('/wallet#history')} badge={openBets || undefined} />
        </div>
      </div>

      <div className="-mt-4 flex flex-col gap-5">
        <DailyStrip />
        <div className="px-4 md:px-0">
          <Tabs id="homeseg" tabs={[{ id: 'sports', label: 'Sports' }, { id: 'live', label: 'Live', count: liveIds.length }]} value={seg} onChange={setSeg} />
        </div>
      </div>

      <div className="px-4 md:px-0">
        <StackedBalanceCard />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {seg === 'sports' ? (
          <motion.div key="sports" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="flex flex-col gap-8">
            <section>
              <div className="px-4 md:px-0"><SectionHead a="Live" b="now" action={<Link to="/live" className="text-[13px] text-mute hover:text-ink">All {liveIds.length}</Link>} /></div>
              {!ready ? (
                <div className="flex gap-3 overflow-hidden px-4 md:px-0">{[0, 1].map((i) => <div key={i} className="skeleton h-[230px] w-[300px] shrink-0 rounded-card" />)}</div>
              ) : liveIds.length ? (
                <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2 md:px-0">
                  {liveIds.slice(0, 10).map((id) => <LiveCard key={id} id={id} />)}
                </div>
              ) : (
                <div className="px-4 md:px-0"><Empty title="No matches in play right now" body="The next kick-offs are below." /></div>
              )}
            </section>
            <section className="px-4 md:px-0">
              <SectionHead a="Starting" b="soon" action={<Link to="/sports" className="text-[13px] text-mute hover:text-ink">All sports</Link>} />
              <div className="flex flex-col gap-2">
                {!ready ? [0, 1, 2].map((i) => <div key={i} className="skeleton h-[92px] rounded-[24px]" />) : upcoming.map((id) => <MatchRow key={id} id={id} showLeague />)}
              </div>
            </section>
            <Accas />
          </motion.div>
        ) : (
          <motion.div key="live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="flex flex-col gap-2 px-4 md:px-0">
            <SectionHead a="In" b="play" />
            {liveIds.length ? liveIds.map((id) => <MatchRow key={id} id={id} showLeague />) : <Empty title="No matches in play right now" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
