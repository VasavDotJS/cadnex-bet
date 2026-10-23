/** A tappable price. Flashes on movement, fills lime when in the slip, locks when suspended. */
import { AnimatePresence, motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EventPublic, Market, Selection } from '../engine/types';
import { formatOdds } from '../lib/odds';
import { useSession } from '../store/session';
import { MAX_SELECTIONS, SlipSel, useSlip } from '../store/slip';
import { useUi } from '../store/ui';
import { press, spring, useReduced } from './motion';

export function useOddsFmt(): (o: number) => string {
  const f = useSession((s) => s.settings?.oddsFormat ?? 'decimal');
  return (o: number) => formatOdds(o, f);
}

export function toSlipSel(ev: EventPublic, m: Market, s: Selection): SlipSel {
  return {
    id: s.id, eventId: ev.id, marketKey: m.key, code: s.code, sport: ev.sport, leagueId: ev.leagueId, home: ev.home.name, away: ev.away.name,
    marketName: m.name, label: s.label, odds: s.odds, startTime: ev.startTime,
  };
}

export function OddsButton({ ev, m, s, label, compact = false, className = '' }: { ev: EventPublic; m: Market; s: Selection; label?: string; compact?: boolean; className?: string }) {
  const fmt = useOddsFmt();
  const reduced = useReduced();
  const inSlip = useSlip((st) => st.sels.some((x) => x.id === s.id));
  const count = useSlip((st) => st.sels.length);
  const prev = useRef(s.odds);
  const [flash, setFlash] = useState<null | 'up' | 'down'>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (s.odds && prev.current && s.odds !== prev.current) {
      setFlash(s.odds > prev.current ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 1200);
      prev.current = s.odds;
      return () => clearTimeout(t);
    }
    prev.current = s.odds;
  }, [s.odds]);

  const settled = m.status === 'SETTLED' || m.status === 'VOID';
  const unavailable = settled || m.status !== 'OPEN' || !!m.closed || !!s.locked || !(s.odds > 1) || ev.status === 'FINISHED';

  const onClick = () => {
    if (unavailable) return;
    if (!inSlip && count >= MAX_SELECTIONS) {
      useUi.getState().toast({ tone: 'error', title: `The slip holds up to ${MAX_SELECTIONS} selections` });
      return;
    }
    const added = useSlip.getState().toggle(toSlipSel(ev, m, s));
    if (added && ref.current && !reduced) {
      const r = ref.current.getBoundingClientRect();
      useUi.getState().flyFrom(r.left + r.width / 2, r.top + r.height / 2, fmt(s.odds));
    }
    if (added && navigator.vibrate) navigator.vibrate(8);
  };

  if (settled) {
    const won = s.result === 'WON' || s.result === 'HALF_WON';
    const voided = s.result === 'VOID' || s.result === 'PUSH';
    return (
      <div className={`flex min-h-[48px] flex-col items-center justify-center rounded-[16px] px-2 ${won ? 'bg-lime/15 text-ink' : 'bg-surface2 text-faint'} ${className}`}>
        {label && <span className="max-w-full truncate text-[11.5px] text-mute">{label}</span>}
        <span className={`text-[12px] font-medium ${won ? 'text-up' : voided ? 'text-mute' : 'text-faint line-through'}`}>{won ? 'Won' : voided ? 'Void' : 'Lost'}</span>
      </div>
    );
  }

  const flashBg = flash === 'up' ? 'rgb(var(--up) / 0.18)' : flash === 'down' ? 'rgb(var(--down) / 0.18)' : 'rgb(0 0 0 / 0)';
  return (
    <motion.button
      ref={ref}
      whileTap={unavailable ? undefined : press}
      transition={spring}
      onClick={onClick}
      disabled={unavailable}
      aria-pressed={inSlip}
      aria-label={`${label ?? s.label} at ${fmt(s.odds)}${unavailable ? ', suspended' : ''}`}
      className={`relative flex min-h-[48px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[16px] px-2 transition-colors ${
        inSlip ? 'bg-lime text-onlime' : 'bg-surface2 text-ink hover:bg-surface3'
      } ${unavailable ? 'opacity-45' : ''} ${compact ? 'py-1.5' : 'py-2'} ${className}`}
    >
      <motion.span className="pointer-events-none absolute inset-0" animate={{ backgroundColor: flashBg }} transition={{ duration: flash ? 0.15 : 1.1 }} />
      {label && <span className={`relative max-w-full truncate text-[11.5px] leading-tight ${inSlip ? 'text-onlime/70' : 'text-mute'}`}>{label}</span>}
      <span className="relative flex h-[20px] items-center gap-1 overflow-hidden">
        {unavailable ? (
          <Lock size={13} strokeWidth={1.75} className="text-mute" aria-hidden />
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={s.odds}
              className="mono text-[15px] font-medium"
              initial={reduced ? { opacity: 0 } : { y: flash === 'down' ? -14 : 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: flash === 'down' ? 14 : -14, opacity: 0 }}
              transition={{ duration: 0.28 }}
            >
              {fmt(s.odds)}
            </motion.span>
          </AnimatePresence>
        )}
        {flash && !unavailable && <span className={`text-[10px] ${flash === 'up' ? 'text-up' : 'text-down'} ${inSlip ? '!text-onlime' : ''}`}>{flash === 'up' ? '▲' : '▼'}</span>}
      </span>
    </motion.button>
  );
}
