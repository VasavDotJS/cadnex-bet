/** Logged-out landing with an age gate and a live ticker of simulated matches. */
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Orbs } from '../../components/Ambient';
import { Crest } from '../../components/Crest';
import { gentle } from '../../components/motion';
import { scoreOf } from '../../components/match';
import { LiveDot, Pill, PillLink } from '../../components/ui';
import { useLive } from '../../store/live';
import { useLiveIds } from '../../store/selectors';
import { useSession } from '../../store/session';
import { DemoBadge, Logo } from '../shell/Shell';

function Ticker() {
  const ids = useLiveIds();
  const events = useLive((s) => s.events);
  const items = ids.map((id) => events[id]).filter(Boolean);
  if (!items.length) return <div className="h-14" />;
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]" aria-label="Live matches">
      <motion.div className="flex w-max gap-3" animate={{ x: ['0%', '-50%'] }} transition={{ duration: Math.max(30, items.length * 6), repeat: Infinity, ease: 'linear' }}>
        {row.map((ev, i) => {
          const [a, b] = scoreOf(ev);
          return (
            <div key={`${ev.id}-${i}`} className="glass flex h-12 shrink-0 items-center gap-2.5 rounded-full pl-2 pr-4">
              <Crest p={ev.home} sport={ev.sport} size={28} />
              <span className="text-[13px] font-medium">{ev.home.short}</span>
              <span className="mono text-[13px]">{a}–{b}</span>
              <span className="text-[13px] font-medium">{ev.away.short}</span>
              <Crest p={ev.away} sport={ev.sport} size={28} />
              <span className="ml-1 inline-flex items-center gap-1 text-[11.5px] text-down"><LiveDot />{ev.clock}</span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

function AgeGate() {
  const update = useSession((s) => s.updateDevice);
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <Orbs palette="landing" intensity={0.8} />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={gentle} className="glass relative w-full max-w-[420px] rounded-[32px] p-8 text-center">
        <Logo className="justify-center" />
        <h1 className="mt-8 text-[30px] font-semibold leading-tight tracking-tighter2">Are you 18 <span className="text-mute">or older?</span></h1>
        <p className="mt-3 text-[14.5px] text-mute">CADNEX lets you bet on real matches with virtual funds only. It is for adults.</p>
        <div className="mt-8 flex flex-col gap-2">
          <Pill tone="lime" size="lg" onClick={() => void update({ ageConfirmed: true })}>Yes, I'm 18 or older</Pill>
          <Pill tone="ghost" onClick={() => { window.location.href = 'about:blank'; }}>No, leave</Pill>
        </div>
      </motion.div>
    </div>
  );
}

export function Landing() {
  const confirmed = useSession((s) => s.device.ageConfirmed);
  const liveCount = useLiveIds().length;
  if (!confirmed) return <AgeGate />;
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Orbs palette="landing" />
      <div className="relative mx-auto flex min-h-dvh max-w-[1100px] flex-col px-6 pb-10 pt-[max(20px,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <DemoBadge className="hidden sm:inline-flex" />
            <Link to="/login" className="rounded-full px-4 py-2 text-[14px] text-mute hover:text-ink">Log in</Link>
          </div>
        </header>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={gentle} className="mt-[12vh] max-w-[720px]">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface/70 px-3 py-1.5 text-[13px] text-mute backdrop-blur"><LiveDot />{liveCount ? `${liveCount} real match${liveCount === 1 ? '' : 'es'} in play right now` : 'Live scores from real matches'}</span>
          <h1 className="mt-6 text-[52px] font-semibold leading-[0.95] tracking-tightest md:text-[84px]">
            Real matches,<br /><span className="text-mute">virtual money.</span>
          </h1>
          <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-mute">
            Bet on real football, NBA, tennis and cricket with a demo wallet. Scores update live, prices move with the game, and bets settle on the real result. No real money, ever.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PillLink to="/signup" tone="lime" className="!h-14 !px-7 !text-[16px]">Create a free account</PillLink>
            <PillLink to="/live" className="!h-14 !px-7 !text-[16px]">Watch live matches</PillLink>
          </div>
        </motion.div>
        <div className="mt-auto pt-16">
          <Ticker />
          <p className="mt-6 text-[12px] text-faint">Scores and fixtures from ESPN’s public data. CADNEX uses virtual money only and has no affiliation with ESPN or any league, team or player. 18+.</p>
        </div>
      </div>
    </div>
  );
}
