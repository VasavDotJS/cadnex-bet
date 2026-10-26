/** Instrument-panel visuals: momentum dial, momentum bars, live wave, stat tiles, date strip. */
import { motion } from 'framer-motion';
import type { EventPublic, StatRow } from '../engine/types';
import { press, spring, useReduced } from './motion';

/** L. Radial dial: lit ticks show attacking pressure on the dominant side. */
export function MomentumDial({ ev, size = 220 }: { ev: EventPublic; size?: number }) {
  const ticks = 72;
  const m = ev.momentum;
  const lit = Math.round(ev.pressure * (ticks / 2));
  const homeSide = m >= 0;
  const r1 = 44, r2 = 49;
  const live = ev.status === 'LIVE';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r="38" fill="rgb(var(--surface-2))" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgb(var(--line) / 0.06)" />
        {Array.from({ length: ticks }, (_, i) => {
          // i=0 at top, clockwise. Right half (0..35) = away, left half (36..71) = home
          const ang = (i / ticks) * Math.PI * 2 - Math.PI / 2;
          const onRight = i < ticks / 2;
          const idxFromBottom = onRight ? ticks / 2 - 1 - i : i - ticks / 2;
          const active = live && (homeSide ? !onRight : onRight) && idxFromBottom < lit;
          const x1 = 50 + Math.cos(ang) * r1, y1 = 50 + Math.sin(ang) * r1;
          const x2 = 50 + Math.cos(ang) * r2, y2 = 50 + Math.sin(ang) * r2;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? 'rgb(var(--lime))' : 'rgb(var(--mute) / 0.25)'} strokeWidth={active ? 1.4 : 0.8} strokeLinecap="round" style={{ transition: 'stroke 600ms' }} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] text-mute">Pressure</span>
        <span className="num text-[30px] font-medium leading-none tracking-tighter2">{live ? Math.round(ev.pressure * 100) : 0}<span className="text-[15px] text-mute">%</span></span>
        <span className="mt-1 text-[12px] font-medium">{live ? (Math.abs(m) < 0.08 ? 'Even' : homeSide ? ev.home.short : ev.away.short) : ev.status === 'FINISHED' ? 'Full time' : 'Not started'}</span>
      </div>
      <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[11px] text-mute">{ev.home.short}</span>
      <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[11px] text-mute">{ev.away.short}</span>
    </div>
  );
}

/** L. Slim vertical bars: home above the line, away below. */
export function MomentumBars({ values, height = 96 }: { values: number[]; height?: number }) {
  const v = values.slice(-36);
  const n = Math.max(v.length, 12);
  return (
    <div className="flex w-full items-center gap-[3px]" style={{ height }} aria-label="Momentum over time" role="img">
      {Array.from({ length: n }, (_, i) => {
        const x = v[i - (n - v.length)];
        if (x === undefined) return <span key={i} className="h-[2px] flex-1 rounded-full bg-mute/15" />;
        const h = Math.max(3, Math.abs(x) * (height / 2 - 4));
        return (
          <span key={i} className="relative flex h-full flex-1 flex-col items-center justify-center">
            <motion.span
              className={`w-full max-w-[6px] rounded-full ${x >= 0 ? 'bg-lime' : 'bg-lavender'}`}
              initial={false}
              animate={{ height: h, y: x >= 0 ? -h / 2 : h / 2 }}
              transition={spring}
            />
          </span>
        );
      })}
    </div>
  );
}

/** L. A wave line under the score; amplitude follows pressure. */
export function LiveWave({ pressure, live, className = '' }: { pressure: number; live: boolean; className?: string }) {
  const reduced = useReduced();
  const amp = live ? 3 + pressure * 9 : 1.5;
  const pts: string[] = [];
  for (let x = 0; x <= 400; x += 2) pts.push(`${x},${(16 + Math.sin((2 * Math.PI * x) / 50) * amp * (0.6 + 0.4 * Math.sin((2 * Math.PI * x) / 200))).toFixed(2)}`);
  const d = `M${pts.join(' L')}`;
  return (
    <div className={`relative h-8 overflow-hidden ${className}`} aria-hidden>
      {/* a CSS animation (runs on the compositor), not a per-frame JS one */}
      <svg viewBox="0 0 400 32" preserveAspectRatio="none" className={`absolute inset-y-0 left-0 h-full w-[200%] ${reduced || !live ? '' : 'marquee'}`} style={{ animationDuration: '6s' }}>
        <path d={d} fill="none" stroke="rgb(var(--lime))" strokeOpacity={live ? 0.9 : 0.3} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const TILE_GLOW = ['var(--magenta)', 'var(--deepblue)', 'var(--amber)', 'var(--violet)', 'var(--lime)', 'var(--lavender)'];

function fmtStat(v: number, fmt?: StatRow['fmt']): string {
  if (fmt === 'pct') return `${Math.round(v)}`;
  if (fmt === 'dec1') return v.toFixed(1);
  if (fmt === 'dec2') return v.toFixed(2);
  return String(Math.round(v));
}

/** K. Gradient stat tiles with mini indicators. */
export function StatTiles({ ev }: { ev: EventPublic }) {
  const rows = ev.stats.slice(0, 6);
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {rows.map((r, i) => {
        const total = r.home + r.away;
        const share = total > 0 ? r.home / total : 0.5;
        const glow = TILE_GLOW[i % TILE_GLOW.length];
        const kind = i % 3;
        return (
          <div key={r.key} className="relative overflow-hidden rounded-[22px] bg-surface2 p-4">
            <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-40 blur-2xl" style={{ background: `rgb(${glow})` }} />
            <p className="relative text-[12px] text-mute">{r.label}</p>
            <div className="relative mt-2 flex items-baseline justify-between">
              <span className="num text-[24px] font-medium tracking-tighter2">{fmtStat(r.home, r.fmt)}<span className="text-[13px] text-mute">{r.fmt === 'pct' ? '%' : ''}</span></span>
              <span className="num text-[15px] text-mute">{fmtStat(r.away, r.fmt)}{r.fmt === 'pct' ? '%' : ''}</span>
            </div>
            {kind === 0 && (
              <div className="relative mt-3 h-[3px] rounded-full bg-mute/20">
                <motion.div className="absolute inset-y-0 left-0 rounded-full bg-ink" initial={false} animate={{ width: `${share * 100}%` }} transition={spring} />
                <motion.span className="absolute -top-[5px] h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-lime" initial={false} animate={{ left: `calc(${share * 100}% - 5px)` }} transition={spring} />
              </div>
            )}
            {kind === 1 && (
              <div className="relative mt-3 flex gap-1.5">
                {Array.from({ length: 10 }, (_, k) => (
                  <span key={k} className={`h-1.5 w-1.5 rounded-full transition-colors ${k < Math.round(share * 10) ? 'bg-ink' : 'bg-mute/25'}`} />
                ))}
              </div>
            )}
            {kind === 2 && (
              <div className="relative mt-2.5 flex h-4 items-end gap-[2px]">
                {Array.from({ length: 22 }, (_, k) => (
                  <span key={k} className={`w-[2px] rounded-full ${k / 22 < share ? 'bg-ink' : 'bg-mute/25'}`} style={{ height: k % 5 === 0 ? 16 : 9 }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Head-to-head stat bars (secondary detail list). */
export function StatBars({ rows }: { rows: StatRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) => {
        const total = r.home + r.away;
        const share = total > 0 ? r.home / total : 0.5;
        return (
          <div key={r.key}>
            <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
              <span className="num font-medium">{fmtStat(r.home, r.fmt)}{r.fmt === 'pct' ? '%' : ''}</span>
              <span className="text-mute">{r.label}</span>
              <span className="num font-medium">{fmtStat(r.away, r.fmt)}{r.fmt === 'pct' ? '%' : ''}</span>
            </div>
            <div className="flex h-[4px] gap-1">
              <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-mute/15">
                <motion.div className="h-full rounded-full bg-lime" initial={false} animate={{ width: `${share * 100}%` }} transition={spring} />
              </div>
              <div className="flex flex-1 overflow-hidden rounded-full bg-mute/15">
                <motion.div className="h-full rounded-full bg-lavender" initial={false} animate={{ width: `${(1 - share) * 100}%` }} transition={spring} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** J. Day selector: circular day buttons, the selected day filled. */
export function DateStrip({ value, onChange }: { value: number; onChange: (dayOffset: number) => void }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today.getTime() + i * 86_400_000);
        const on = i === value;
        return (
          <motion.button
            key={i}
            whileTap={press}
            onClick={() => onChange(i)}
            aria-pressed={on}
            aria-label={d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
            className="flex shrink-0 flex-col items-center gap-1.5"
          >
            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-[13px] font-medium transition-colors ${on ? 'border-transparent bg-pill text-onpill' : 'hair text-ink hover:bg-surface2'}`}>
              {i === 0 ? 'Now' : d.toLocaleDateString([], { weekday: 'narrow' })}
            </span>
            <span className={`num text-[11px] ${on ? 'text-ink' : 'text-mute'}`}>{d.getDate()}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
