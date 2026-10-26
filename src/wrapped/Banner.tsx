import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { press } from '../components/motion';
import { useSession } from '../store/session';
import { useWrapped } from './store';

/** Home-screen invitation: a small, animated card that opens the recap. */
export function WrappedBanner() {
  const bets = useSession((s) => s.bets);
  const open = useWrapped((s) => s.open);
  const weekCount = useMemo(() => bets.filter((b) => b.placedAt > Date.now() - 7 * 86_400_000).length, [bets]);
  const monthCount = useMemo(() => bets.filter((b) => b.placedAt > Date.now() - 30 * 86_400_000).length, [bets]);
  if (!monthCount) return null;
  return (
    <motion.div layout className="relative mx-4 overflow-hidden rounded-[24px] p-4 text-white md:mx-0">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, #7C6CF6, #F45BB5 55%, #F59E0B)' }} />
      <div className="spin-slow absolute -inset-1/2 opacity-30" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.8), transparent 25%)' }} />
      <div className="relative flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-white/80">CADNEX WRAPPED</p>
          <p className="mt-0.5 text-[18px] font-semibold leading-tight tracking-tight">Your {weekCount ? 'week' : 'month'} in bets is ready</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {weekCount > 0 && <motion.button whileTap={press} onClick={() => open('week')} className="rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-black">Week</motion.button>}
          <motion.button whileTap={press} onClick={() => open('month')} className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${weekCount ? 'bg-black/25 text-white' : 'bg-white text-black'}`}>Month</motion.button>
        </div>
      </div>
    </motion.div>
  );
}
