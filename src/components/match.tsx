/** Match list rows, live cards and market rows. */
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventPublic, Market } from '../engine/types';
import { mainMarket, useLive } from '../store/live';
import { Crest } from './Crest';
import { DotMatrix } from './DotMatrix';
import { LiveWave } from './instruments';
import { spring } from './motion';
import { OddsButton, useOddsFmt } from './OddsButton';
import { countdown, kickoffLabel, LiveDot, useNow } from './ui';

export function scoreOf(ev: EventPublic): [string, string] {
  return ev.scoreText ?? [String(ev.score[0]), String(ev.score[1])];
}

function shortLabel(ev: EventPublic, code: string, idx: number): string {
  if (code === 'X') return 'X';
  if (ev.sport === 'football') return idx === 0 ? '1' : '2';
  return idx === 0 ? ev.home.short : ev.away.short;
}

/** Status line: live clock, countdown or kickoff time. */
export function EventStatus({ ev, now }: { ev: EventPublic; now: number }) {
  if (ev.status === 'LIVE')
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-down">
        <LiveDot /> <span className="num">{ev.clock}</span>
      </span>
    );
  if (ev.status === 'FINISHED') return <span className="text-[12px] text-mute">{ev.result?.void ? ev.period : ev.sport === 'football' ? 'FT' : ev.sport === 'cricket' ? 'Result' : 'Final'}</span>;
  const ms = ev.startTime - now;
  if (ms < 3_600_000) return <span className="num text-[12px] text-mute">Starts in {countdown(ms)}</span>;
  return <span className="num text-[12px] text-mute">{kickoffLabel(ev.startTime, now)}</span>;
}

export const MatchRow = memo(function MatchRow({ id, showLeague = false }: { id: string; showLeague?: boolean }) {
  const ev = useLive((s) => s.events[id]);
  // seconds only for an imminent kick-off countdown; otherwise the label changes by the minute
  const now = useNow(ev?.status === 'SCHEDULED' && ev.startTime - Date.now() < 3_660_000 ? 1000 : 60_000);
  if (!ev) return null;
  const mm = mainMarket(ev);
  const [sh, sa] = scoreOf(ev);
  const showScore = ev.status !== 'SCHEDULED';
  return (
    <div className="match-row flex flex-col gap-3 rounded-[24px] bg-surface px-4 py-3.5 sm:flex-row sm:items-center" style={{ boxShadow: 'inset 0 1px 0 rgb(var(--edge) / var(--edge-a))' }}>
      <Link to={`/event/${ev.id}`} className="flex min-w-0 flex-1 flex-col gap-2" aria-label={`${ev.home.name} v ${ev.away.name}`}>
        <div className="flex items-center gap-2">
          <EventStatus ev={ev} now={now} />
          {showLeague && <span className="truncate text-[12px] text-mute">· {ev.leagueName}</span>}
        </div>
        {[0, 1].map((i) => {
          const p = i === 0 ? ev.home : ev.away;
          const sc = i === 0 ? sh : sa;
          return (
            <div key={i} className="flex items-center gap-2.5">
              <Crest p={p} sport={ev.sport} size={24} />
              <p className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{p.name}</p>
              {showScore && <span className={`mono text-[14.5px] ${ev.status === 'LIVE' ? 'text-ink' : 'text-mute'}`}>{sc}</span>}
            </div>
          );
        })}
      </Link>
      {mm && ev.status !== 'FINISHED' ? (
        <div className={`grid shrink-0 gap-1.5 ${mm.selections.length === 3 ? 'grid-cols-3 sm:w-[190px]' : 'grid-cols-2 sm:w-[136px]'}`}>
          {mm.selections.map((s, i) => (
            <OddsButton key={s.id} ev={ev} m={mm} s={s} label={shortLabel(ev, s.code, i)} compact />
          ))}
        </div>
      ) : (
        <Link to={`/event/${ev.id}`} aria-label="Open match" className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface2 text-mute sm:inline-flex">
          <ChevronRight size={18} strokeWidth={1.5} />
        </Link>
      )}
    </div>
  );
});

/** Live card for carousels. A full-width sweep plays when a major incident lands. */
export const LiveCard = memo(function LiveCard({ id }: { id: string }) {
  const ev = useLive((s) => s.events[id]);
  const lastMajor = useRef<string | null>(null);
  const [sweep, setSweep] = useState<string | null>(null);
  const major = ev?.incidents.find((i) => i.major && i.kind !== 'end');
  useEffect(() => {
    if (!major) return;
    if (lastMajor.current && lastMajor.current !== major.id) {
      setSweep(major.text.split('—')[0].trim().split(' ').slice(0, 3).join(' '));
      const t = setTimeout(() => setSweep(null), 1800);
      lastMajor.current = major.id;
      return () => clearTimeout(t);
    }
    lastMajor.current = major.id;
  }, [major]);
  if (!ev) return null;
  const mm = mainMarket(ev);
  const [sh, sa] = scoreOf(ev);
  const numeric = /^\d+$/.test(sh) && /^\d+$/.test(sa);
  return (
    <motion.div whileTap={{ scale: 0.99 }} className="card relative flex w-[300px] shrink-0 flex-col overflow-hidden p-4 md:w-[320px]">
      <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-magenta/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-deepblue/30 blur-3xl" />
      <AnimatePresence>
        {sweep && (
          <motion.div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-y-0 w-full bg-gradient-to-r from-transparent via-lime/35 to-transparent" initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 1.1, ease: 'easeInOut' }} />
            <span className="relative rounded-full bg-lime px-3 py-1 text-[12px] font-semibold text-onlime">{sweep}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <Link to={`/event/${ev.id}`} className="relative flex flex-col">
        <div className="flex items-center justify-between">
          <span className="truncate text-[12px] text-mute">{ev.leagueName}</span>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-down"><LiveDot /><span className="num">{ev.clock}</span></span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            <Crest p={ev.home} sport={ev.sport} size={40} />
            <span className="w-full truncate text-[13px] font-medium">{ev.home.short}</span>
          </div>
          <div className="flex items-center gap-2 px-1">
            {numeric ? (
              <>
                <DotMatrix text={sh} dot={4} />
                <span className="text-mute">:</span>
                <DotMatrix text={sa} dot={4} />
              </>
            ) : (
              <div className="mono flex flex-col items-center text-[13px] leading-tight">
                <span>{sh}</span>
                <span className="text-mute">{sa}</span>
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            <Crest p={ev.away} sport={ev.sport} size={40} />
            <span className="w-full truncate text-[13px] font-medium">{ev.away.short}</span>
          </div>
        </div>
        <LiveWave pressure={ev.pressure} live className="mt-2" />
      </Link>
      {mm && (
        <div className={`relative mt-1 grid gap-1.5 ${mm.selections.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {mm.selections.map((s, i) => (
            <OddsButton key={s.id} ev={ev} m={mm} s={s} label={shortLabel(ev, s.code, i)} compact />
          ))}
        </div>
      )}
    </motion.div>
  );
});

/** D. Market presentation: inline buttons for short markets, asset-style rows for long ones. */
export function MarketBlock({ ev, m, defaultOpen = true }: { ev: EventPublic; m: Market; defaultOpen?: boolean }) {
  const fmt = useOddsFmt();
  const [open, setOpen] = useState(defaultOpen);
  const long = m.selections.length > 4;
  const settled = m.status === 'SETTLED' || m.status === 'VOID';
  return (
    <div className="rounded-[24px] bg-surface p-4" style={{ boxShadow: 'inset 0 1px 0 rgb(var(--edge) / var(--edge-a))' }}>
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-[14.5px] font-medium">{m.name}</span>
        <span className="flex items-center gap-2">
          {settled ? <span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] text-mute">Settled</span> : m.status !== 'OPEN' ? <span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] text-mute">Suspended</span> : null}
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring} className="text-mute"><ChevronRight size={16} strokeWidth={1.5} /></motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            {long ? (
              <div className="mt-3 flex flex-col divide-y divide-[rgb(var(--line)/0.06)]">
                {m.selections.map((s) => {
                  const delta = s.prevOdds && s.odds && s.prevOdds !== s.odds ? ((s.odds - s.prevOdds) / s.prevOdds) * 100 : 0;
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-2">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-[12px] font-medium text-mute">{s.label.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '·'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px]">{s.label}</p>
                        {delta !== 0 && !settled && (
                          <p className={`num text-[11.5px] ${delta > 0 ? 'text-up' : 'text-down'}`}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}% · was {fmt(s.prevOdds)}</p>
                        )}
                      </div>
                      <OddsButton ev={ev} m={m} s={s} className="w-[84px] shrink-0" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`mt-3 grid gap-2 ${m.selections.length === 3 ? 'grid-cols-3' : m.selections.length === 4 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                {m.selections.map((s) => (
                  <OddsButton key={s.id} ev={ev} m={m} s={s} label={s.label} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
