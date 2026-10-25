/**
 * CADNEX Wrapped: a full-screen, tap-through recap of the week or month, in the spirit of
 * Spotify Wrapped. Tap right/left to move, hold to pause, swipe down or ✕ to close.
 * The last slide turns the recap into a 6-second video for Instagram Stories and WhatsApp.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Download, RotateCcw, Share2, X } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { CdnxMark } from '../components/Brand';
import { SportGlyph } from '../components/SportGlyph';
import { press } from '../components/motion';
import { leagueById, SPORTS } from '../data/leagues';
import { formatMoney } from '../lib/money';
import { canShareFiles, download } from '../share/ShareStory';
import { Assets, loadAssets } from '../share/story';
import { makeStoryFile, StoryFile } from '../share/video';
import { useLive } from '../store/live';
import { useSession } from '../store/session';
import { useUi } from '../store/ui';
import { drawWrappedCard } from './card';
import { computeWrapped, Period, Wrapped } from './stats';

export const useWrapped = create<{ period: Period | null; open(p: Period): void; close(): void }>((set) => ({
  period: null,
  open: (period) => set({ period }),
  close: () => set({ period: null }),
}));

const SLIDE_MS = 6000;
const ease = [0.2, 0.8, 0.2, 1] as const;

// ───────────── little animation helpers ─────────────

function useCountUp(target: number, ms = 1400, delay = 250) {
  const [v, setV] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { setV(target); return; }
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      setV(target * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay, reduced]);
  return v;
}

const Rise = ({ children, d = 0, className = '' }: { children: ReactNode; d?: number; className?: string }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, delay: d, ease }}>{children}</motion.div>
);

/** Two big blurred blobs drifting behind a slide. */
function Blobs({ a, b, base }: { a: string; b: string; base: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: base }}>
      <motion.div className="absolute h-[90vmax] w-[90vmax] rounded-full opacity-80 blur-[90px]" style={{ background: a, left: '-35vmax', top: '-30vmax' }} animate={{ x: ['0%', '12%', '-4%', '0%'], y: ['0%', '8%', '14%', '0%'], scale: [1, 1.12, 0.96, 1] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute h-[80vmax] w-[80vmax] rounded-full opacity-70 blur-[100px]" style={{ background: b, right: '-35vmax', bottom: '-35vmax' }} animate={{ x: ['0%', '-10%', '6%', '0%'], y: ['0%', '-12%', '-4%', '0%'], scale: [1, 0.92, 1.1, 1] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
      <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '3px 3px' }} />
    </div>
  );
}

/** Endless band of outlined words, Wrapped-style. */
function Marquee({ text, reverse = false, className = '' }: { text: string; reverse?: boolean; className?: string }) {
  const row = Array.from({ length: 8 }, () => text).join('  •  ');
  return (
    <div className={`pointer-events-none overflow-hidden whitespace-nowrap ${className}`}>
      <motion.div className="inline-block" animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}>
        <span>{row}  •  {row}</span>
      </motion.div>
    </div>
  );
}

function Confetti({ colors }: { colors: string[] }) {
  const bits = useMemo(() => Array.from({ length: 46 }, (_, i) => ({ i, x: Math.random() * 100, d: Math.random() * 0.6, r: (Math.random() - 0.5) * 720, s: 6 + Math.random() * 8, dur: 2.2 + Math.random() * 1.6 })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b) => (
        <motion.span key={b.i} className="absolute top-[-20px] rounded-[2px]" style={{ left: `${b.x}%`, width: b.s, height: b.s * 0.5, background: colors[b.i % colors.length] }} initial={{ y: 0, rotate: 0, opacity: 1 }} animate={{ y: '110vh', rotate: b.r, opacity: [1, 1, 0.6] }} transition={{ duration: b.dur, delay: 0.5 + b.d, ease: 'easeIn' }} />
      ))}
    </div>
  );
}

// ───────────── slides ─────────────

interface SlideDef { key: string; bg: [string, string, string]; dark?: boolean; render: () => ReactNode }

const big = 'font-semibold tracking-[-0.05em] leading-[0.88]';

function Count({ value, className = '' }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={`num ${className}`}>{Math.round(v)}</span>;
}

function MoneyCount({ minor, code, sign = false, className = '' }: { minor: bigint; code: string; sign?: boolean; className?: string }) {
  const v = useCountUp(Number(minor), 1600, 350);
  return <span className={`num ${className}`}>{formatMoney(BigInt(Math.round(v)), code, { sign })}</span>;
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 120;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 300 300" className="h-[min(62vw,300px)] w-[min(62vw,300px)] -rotate-90">
      <circle cx="150" cy="150" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="26" />
      <motion.circle cx="150" cy="150" r={r} fill="none" stroke={color} strokeWidth="26" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 1.8, delay: 0.4, ease }} />
    </svg>
  );
}

function teamColor(name: string, events: ReturnType<typeof useLive.getState>['events']): string {
  for (const e of Object.values(events)) {
    if (e.home.name === name) return e.home.colors[0].startsWith('#') ? e.home.colors[0] : `#${e.home.colors[0]}`;
    if (e.away.name === name) return e.away.colors[0].startsWith('#') ? e.away.colors[0] : `#${e.away.colors[0]}`;
  }
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 45%)`;
}

function buildSlides(w: Wrapped, user: string, teamHex: string | null, summary: ReactNode): SlideDef[] {
  const label = w.period === 'week' ? 'week' : 'month';
  const range = `${new Date(w.from).toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${new Date(w.to).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
  const slides: SlideDef[] = [];

  slides.push({
    key: 'intro',
    bg: ['#7C6CF6', '#F45BB5', '#1a103d'],
    render: () => (
      <div className="relative flex h-full flex-col justify-center">
        <Marquee text={`YOUR ${label.toUpperCase()}`} className="absolute left-0 right-0 top-[14%] text-[64px] font-black text-transparent [-webkit-text-stroke:1.5px_rgba(255,255,255,0.35)]" />
        <Marquee text="WRAPPED" reverse className="absolute bottom-[12%] left-0 right-0 text-[64px] font-black text-transparent [-webkit-text-stroke:1.5px_rgba(255,255,255,0.35)]" />
        <div className="px-7">
          <Rise><p className="text-[18px] font-medium text-white/75">{user ? `@${user}, ` : ''}it’s time.</p></Rise>
          <Rise d={0.15}><h1 className={`${big} mt-3 text-[clamp(64px,19vw,120px)]`}>Your {label},</h1></Rise>
          <Rise d={0.3}><h1 className={`${big} text-[clamp(64px,19vw,120px)] text-[#B5F23D]`}>wrapped.</h1></Rise>
          <Rise d={0.55}><p className="mt-6 text-[16px] text-white/70">{range} · tap to begin</p></Rise>
        </div>
      </div>
    ),
  });

  if (!w.placed) {
    slides.push({
      key: 'quiet',
      bg: ['#3B5BDB', '#7C6CF6', '#0d1236'],
      render: () => (
        <div className="flex h-full flex-col justify-center px-7">
          <Rise><p className="text-[20px] text-white/75">This {label} was…</p></Rise>
          <Rise d={0.2}><h2 className={`${big} mt-3 text-[clamp(56px,16vw,104px)]`}>quiet.</h2></Rise>
          <Rise d={0.45}><p className="mt-6 max-w-[30ch] text-[18px] leading-relaxed text-white/80">No bets yet. Back a team tonight and your next Wrapped will have stories to tell.</p></Rise>
        </div>
      ),
    });
    return slides;
  }

  slides.push({
    key: 'count',
    bg: ['#B5F23D', '#E9FFC2', '#B5F23D'],
    dark: true,
    render: () => (
      <div className="flex h-full flex-col justify-center px-7 text-[#0C1004]">
        <Rise><p className="text-[22px] font-medium">This {label} you placed</p></Rise>
        <Rise d={0.1}><p className={`${big} mt-2 text-[clamp(140px,48vw,260px)]`}><Count value={w.placed} /></p></Rise>
        <Rise d={0.3}><p className="text-[30px] font-semibold tracking-tight">bet{w.placed === 1 ? '' : 's'}</p></Rise>
        <Rise d={0.6} className="mt-8 flex flex-wrap gap-2">
          {w.sports.slice(0, 4).map((s) => (
            <span key={s.id} className="inline-flex items-center gap-2 rounded-full bg-black/10 px-4 py-2 text-[15px] font-medium"><SportGlyph sport={s.id} size={16} />{SPORTS.find((x) => x.id === s.id)?.name} · {s.n}</span>
          ))}
        </Rise>
      </div>
    ),
  });

  if (w.team && teamHex) {
    const team = w.team;
    slides.push({
      key: 'team',
      bg: [teamHex, '#0A0A0C', '#111'],
      render: () => (
        <div className="flex h-full flex-col items-center justify-center px-7 text-center">
          <Rise><p className="text-[22px] text-white/80">Your team this {label}</p></Rise>
          <motion.div initial={{ scale: 0.3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 14, delay: 0.25 }} className="my-8 flex h-[min(52vw,240px)] w-[min(52vw,240px)] items-center justify-center rounded-full text-[min(16vw,76px)] font-black tracking-tight shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]" style={{ background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), transparent 55%), ${teamHex}` }}>
            {(team.name.includes(' ') ? team.name.split(' ').map((p) => p[0]).join('') : team.name).slice(0, 3).toUpperCase()}
          </motion.div>
          <Rise d={0.45}><h2 className={`${big} text-[clamp(44px,13vw,84px)]`}>{team.name}</h2></Rise>
          <Rise d={0.65}><p className="mt-4 text-[18px] text-white/80">You backed them <b className="text-white">{team.n} times</b>. Ride or die.</p></Rise>
        </div>
      ),
    });
  } else if (w.topLeague) {
    const lg = leagueById(w.topLeague.id);
    slides.push({
      key: 'league',
      bg: ['#3B5BDB', '#7C6CF6', '#0d1236'],
      render: () => (
        <div className="flex h-full flex-col justify-center px-7">
          <Rise><p className="text-[22px] text-white/80">You lived in</p></Rise>
          <Rise d={0.2}><h2 className={`${big} mt-3 text-[clamp(52px,15vw,100px)]`}>{lg.name}</h2></Rise>
          <Rise d={0.45}><p className="mt-5 text-[18px] text-white/80">{w.topLeague!.n} of your picks came from there.</p></Rise>
        </div>
      ),
    });
  }

  if (w.winRate !== null) {
    const pct = w.winRate;
    slides.push({
      key: 'rate',
      bg: ['#7C6CF6', '#3B5BDB', '#120d33'],
      render: () => (
        <div className="flex h-full flex-col items-center justify-center px-7 text-center">
          <Rise><p className="text-[22px] text-white/80">Your hit rate</p></Rise>
          <div className="relative my-6">
            <Ring pct={pct} color="#B5F23D" />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className={`${big} text-[clamp(64px,18vw,96px)]`}><Count value={Math.round(pct * 100)} />%</p>
            </div>
          </div>
          <Rise d={0.7}><p className="text-[20px]"><b className="text-[#B5F23D]">{w.won} won</b> · {w.lost} lost</p></Rise>
          {w.bestStreak >= 2 && <Rise d={0.9}><p className="mt-3 text-[17px] text-white/80">Best run: <b className="text-white">{w.bestStreak} wins in a row</b> 🔥</p></Rise>}
        </div>
      ),
    });
  }

  if (w.biggestWin) {
    const bw = w.biggestWin;
    slides.push({
      key: 'win',
      bg: ['#B5F23D', '#22C55E', '#0b1a06'],
      render: () => (
        <div className="relative flex h-full flex-col justify-center px-7">
          <Confetti colors={['#B5F23D', '#FFFFFF', '#7C6CF6', '#F45BB5']} />
          <Rise><p className="text-[22px] text-white/85">Your biggest win</p></Rise>
          <Rise d={0.15}><p className={`${big} mt-3 text-[clamp(60px,17vw,112px)] text-[#E9FFC2]`}><MoneyCount minor={bw.profit} code={w.currency} sign /></p></Rise>
          <Rise d={0.45}><p className="mt-5 text-[22px] font-semibold">{bw.label}</p></Rise>
          <Rise d={0.55}><p className="mt-1 text-[17px] text-white/75">{bw.match} · odds <span className="num">{bw.odds.toFixed(2)}</span></p></Rise>
        </div>
      ),
    });
  } else if (w.closeCall) {
    const cc = w.closeCall;
    slides.push({
      key: 'close',
      bg: ['#F59E0B', '#F43F5E', '#2b0d10'],
      render: () => (
        <div className="flex h-full flex-col justify-center px-7">
          <Rise><p className="text-[22px] text-white/85">So. Close.</p></Rise>
          <Rise d={0.2}><h2 className={`${big} mt-3 text-[clamp(52px,15vw,96px)]`}>{cc.legs - 1} of {cc.legs}</h2></Rise>
          <Rise d={0.45}><p className="mt-5 max-w-[28ch] text-[19px] text-white/85">A {cc.match} missed by a single leg. It happens to the best.</p></Rise>
        </div>
      ),
    });
  }

  if (w.longestOdds && w.longestOdds.odds >= 2.5) {
    const lo = w.longestOdds;
    slides.push({
      key: 'odds',
      bg: ['#F45BB5', '#7C6CF6', '#2a0b22'],
      render: () => (
        <div className="flex h-full flex-col justify-center px-7">
          <Rise><p className="text-[22px] text-white/85">The longest odds you landed</p></Rise>
          <motion.p initial={{ opacity: 0, scale: 1.6, filter: 'blur(16px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 0.9, delay: 0.2, ease }} className={`${big} mono mt-3 origin-left text-[clamp(96px,30vw,180px)]`}>{lo.odds.toFixed(2)}</motion.p>
          <Rise d={0.6}><p className="mt-4 text-[19px] text-white/85">{lo.label}. Bold.</p></Rise>
        </div>
      ),
    });
  }

  // a habit worth calling out
  const habit = w.nightShare >= 0.4
    ? { k: 'night', top: 'After dark is your time', big: `${Math.round(w.nightShare * 100)}%`, sub: 'of your bets went on after 9 pm. Night owl energy.', bg: ['#3B5BDB', '#0d1236', '#060816'] as [string, string, string] }
    : w.liveShare >= 0.3
      ? { k: 'live', top: 'You play it live', big: `${Math.round(w.liveShare * 100)}%`, sub: 'of your picks were made with the match already on.', bg: ['#F43F5E', '#7C6CF6', '#1f0a14'] as [string, string, string] }
      : w.busiestDay
        ? { k: 'day', top: 'Your favourite day', big: w.busiestDay, sub: `You placed more bets on ${w.busiestDay}s than any other day.`, bg: ['#F59E0B', '#F45BB5', '#25120a'] as [string, string, string] }
        : null;
  if (habit) {
    slides.push({
      key: habit.k,
      bg: habit.bg,
      render: () => (
        <div className="flex h-full flex-col justify-center px-7">
          <Rise><p className="text-[22px] text-white/85">{habit.top}</p></Rise>
          <Rise d={0.2}><p className={`${big} mt-3 text-[clamp(72px,22vw,140px)]`}>{habit.big}</p></Rise>
          <Rise d={0.45}><p className="mt-4 max-w-[30ch] text-[19px] text-white/85">{habit.sub}</p></Rise>
        </div>
      ),
    });
  }

  if (w.settled) {
    const up = w.net >= 0n;
    slides.push({
      key: 'net',
      bg: up ? ['#22C55E', '#B5F23D', '#06140a'] : ['#7C6CF6', '#F43F5E', '#150b1f'],
      render: () => (
        <div className="flex h-full flex-col justify-center px-7">
          <Rise><p className="text-[22px] text-white/85">Bottom line</p></Rise>
          <Rise d={0.15}><p className={`${big} mt-3 text-[clamp(56px,16vw,108px)] ${up ? 'text-[#E9FFC2]' : ''}`}><MoneyCount minor={w.net} code={w.currency} sign /></p></Rise>
          <Rise d={0.45}><p className="mt-5 max-w-[30ch] text-[19px] text-white/85">{up ? `In profit for the ${label}. Virtual money, very real bragging rights.` : 'Down this time, and it’s only virtual. Shake it off; next week’s a clean sheet.'}</p></Rise>
        </div>
      ),
    });
  }

  slides.push({
    key: 'persona',
    bg: [w.persona.colors[0], w.persona.colors[1], '#0A0A0C'],
    render: () => (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <Rise><p className="text-[20px] text-white/85">Your CADNEX personality is…</p></Rise>
        <motion.div initial={{ rotateY: 180, scale: 0.7, opacity: 0 }} animate={{ rotateY: 0, scale: 1, opacity: 1 }} transition={{ duration: 1.1, delay: 0.7, ease }} style={{ transformPerspective: 900 }} className="relative mt-7 w-full max-w-[340px] overflow-hidden rounded-[34px] p-7 text-left shadow-[0_40px_90px_-30px_rgba(0,0,0,0.75)]">
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${w.persona.colors[0]}, ${w.persona.colors[1]})` }} />
          <motion.div className="absolute -inset-1/2 opacity-40" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.7), transparent 30%)' }} animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} />
          <div className="absolute inset-[2px] rounded-[32px] bg-[#0A0A0C]/80 backdrop-blur-xl" />
          <div className="relative">
            <p className="text-[12px] font-semibold tracking-[0.24em] text-white/60">PERSONALITY</p>
            <h2 className="mt-3 bg-clip-text text-[42px] font-bold leading-[0.95] tracking-[-0.04em] text-transparent" style={{ backgroundImage: `linear-gradient(90deg, #fff, ${w.persona.colors[1]})` }}>{w.persona.name}</h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-white/80">{w.persona.line}</p>
            <div className="mt-5 flex flex-col gap-2">
              {w.persona.traits.map((t, i) => (
                <motion.span key={t} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6 + i * 0.15 }} className="inline-flex w-fit rounded-full bg-white/10 px-3 py-1.5 text-[13px]">{t}</motion.span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    ),
  });

  slides.push({ key: 'summary', bg: [w.persona.colors[0], w.persona.colors[1], '#0A0A0C'], render: () => summary });
  return slides;
}

// ───────────── summary + sharing ─────────────

function Summary({ w, user, onReplay }: { w: Wrapped; user: string; onReplay: () => void }) {
  const [assets, setAssets] = useState<Assets | null>(null);
  const [file, setFile] = useState<StoryFile | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => { void loadAssets().then(setAssets); }, []);
  useEffect(() => {
    if (!assets) return;
    let live = true;
    void makeStoryFile((ctx, t) => drawWrappedCard(ctx, t, w, assets, user), (p) => live && setProgress(p), `cadnex-wrapped-${w.period}`).then((f) => live && setFile(f));
    return () => { live = false; };
  }, [assets, w, user]);
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file.file], text: `My ${w.period} on CADNEX: I'm ${w.persona.name}. Get yours 👉 https://cadnex.vercel.app`, title: 'CADNEX Wrapped' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') download(file.file);
    }
  };
  const tiles = [
    ['Bets', String(w.placed)],
    ['Win rate', w.winRate === null ? '—' : `${Math.round(w.winRate * 100)}%`],
    ['Net', w.settled ? formatMoney(w.net, w.currency, { sign: true, compact: true }) : '—'],
    ['Best odds', w.longestOdds ? w.longestOdds.odds.toFixed(2) : '—'],
  ];
  const canShare = file ? canShareFiles(file.file) : true;
  return (
    <div className="flex h-full flex-col justify-center gap-5 px-6" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <Rise>
        <div className="overflow-hidden rounded-[30px] bg-[#0A0A0C]/75 p-6 backdrop-blur-xl" style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 40px 80px -30px rgba(0,0,0,0.7)' }}>
          <div className="flex items-center justify-between">
            <CdnxMark className="h-[16px] text-white" />
            <span className="text-[11px] font-semibold tracking-[0.2em] text-white/60">{w.period === 'week' ? 'MY WEEK' : 'MY MONTH'}</span>
          </div>
          <p className="mt-5 text-[13px] text-white/60">I’m</p>
          <h2 className="bg-clip-text text-[36px] font-bold leading-none tracking-[-0.04em] text-transparent" style={{ backgroundImage: `linear-gradient(90deg, #fff, ${w.persona.colors[1]})` }}>{w.persona.name}</h2>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {tiles.map(([k, v], i) => (
              <motion.div key={k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }} className="rounded-[18px] bg-white/[0.07] p-3.5">
                <p className="text-[12px] text-white/55">{k}</p>
                <p className="num mt-1 text-[22px] font-semibold tracking-tight">{v}</p>
              </motion.div>
            ))}
          </div>
          {w.team && <p className="mt-4 text-[13.5px] text-white/70">Ride or die: <b className="text-white">{w.team.name}</b></p>}
        </div>
      </Rise>
      <Rise d={0.3} className="flex flex-col gap-2">
        <motion.button whileTap={press} disabled={!file} onClick={() => void (canShare ? share() : file && download(file.file))} className="relative flex h-14 items-center justify-center gap-2 overflow-hidden rounded-full bg-white text-[16px] font-semibold text-black disabled:opacity-80">
          {!file && <span className="absolute inset-y-0 left-0 bg-black/10 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />}
          <span className="relative inline-flex items-center gap-2">{file ? (canShare ? <><Share2 size={18} />Share my Wrapped</> : <><Download size={18} />Download video</>) : `Making your video… ${Math.round(progress * 100)}%`}</span>
        </motion.button>
        <div className="grid grid-cols-2 gap-2">
          <motion.button whileTap={press} onClick={onReplay} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white/12 text-[14px]"><RotateCcw size={16} />Replay</motion.button>
          <motion.button whileTap={press} disabled={!file} onClick={() => file && download(file.file)} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white/12 text-[14px] disabled:opacity-50"><Download size={16} />Save</motion.button>
        </div>
        <p className="text-center text-[12px] text-white/55">Share to Instagram Stories or WhatsApp Status from your phone’s share menu.</p>
      </Rise>
    </div>
  );
}

// ───────────── the player ─────────────

export function WrappedPlayer() {
  const period = useWrapped((s) => s.period);
  const close = useWrapped((s) => s.close);
  const bets = useSession((s) => s.bets);
  const wallet = useSession((s) => s.wallet);
  const user = useSession((s) => s.user);
  const events = useLive((s) => s.events);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const holdRef = useRef<{ at: number } | null>(null);

  const w = useMemo(() => (period && wallet ? computeWrapped(bets, period, wallet.currency) : null), [period, bets, wallet]);
  const teamHex = useMemo(() => (w?.team ? teamColor(w.team.name, events) : null), [w, events]);
  const slides = useMemo(() => (w ? buildSlides(w, user?.username ?? '', teamHex, <Summary w={w} user={user?.username ?? ''} onReplay={() => { setI(0); setRun((r) => r + 1); }} />) : []), [w, user, teamHex]);
  const last = slides.length - 1;

  useEffect(() => { if (period) { setI(0); setPaused(false); setRun((r) => r + 1); } }, [period]);
  const next = useCallback(() => setI((x) => Math.min(last, x + 1)), [last]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);


  useEffect(() => {
    if (!period) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [period, next, prev, close]);

  if (!period || !w) return null;
  const s = slides[i];
  return (
    <motion.div className="fixed inset-0 z-[150] flex items-stretch justify-center bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={`Your ${period}, wrapped`}>
      <div
        className="relative h-full w-full max-w-[520px] select-none overflow-hidden text-white"
        onPointerDown={() => { holdRef.current = { at: Date.now() }; setPaused(true); }}
        onPointerUp={(e) => {
          const held = holdRef.current ? Date.now() - holdRef.current.at : 0;
          holdRef.current = null;
          setPaused(false);
          if (held > 260 || i === last) return;
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          if (e.clientX - r.left < r.width * 0.3) prev();
          else next();
        }}
        onPointerCancel={() => { holdRef.current = null; setPaused(false); }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={`${s.key}-${run}`} className="absolute inset-0" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.55, ease }}>
            <Blobs a={s.bg[0]} b={s.bg[1]} base={s.bg[2]} />
            <div className="relative h-full pb-[max(24px,env(safe-area-inset-bottom))] pt-[calc(max(16px,env(safe-area-inset-top))+56px)]">{s.render()}</div>
          </motion.div>
        </AnimatePresence>

        {/* progress + header */}
        <div className="absolute inset-x-0 top-0 z-10 px-3 pt-[max(10px,env(safe-area-inset-top))]">
          <div className="flex gap-1">
            {slides.map((sl, k) => (
              <div key={sl.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
                {k < i && <div className="h-full w-full bg-white" />}
                {k === i && (
                  // the bar is the clock: when it fills, the next slide comes; holding pauses it
                  <div
                    key={`${i}-${run}`}
                    className="h-full bg-white"
                    style={{ animation: `wrapped-fill ${k === last ? 300 : SLIDE_MS}ms linear forwards`, animationPlayState: paused ? 'paused' : 'running' }}
                    onAnimationEnd={() => { if (k !== last) next(); }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between px-1">
            <div className={`flex items-center gap-2 ${s.dark ? 'text-[#0C1004]' : 'text-white'}`}>
              <CdnxMark className="h-[13px]" />
              <span className="text-[12px] font-semibold tracking-[0.18em] opacity-75">{period === 'week' ? 'WEEKLY' : 'MONTHLY'} WRAPPED</span>
            </div>
            <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => { e.stopPropagation(); close(); }} aria-label="Close" className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${s.dark ? 'bg-black/10 text-[#0C1004]' : 'bg-white/15 text-white'}`}><X size={18} /></button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

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
      <motion.div className="absolute -inset-1/2 opacity-30" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.8), transparent 25%)' }} animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} />
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

export function useOpenWrapped() {
  const open = useWrapped((s) => s.open);
  return (p: Period) => {
    if (!useSession.getState().wallet) { useUi.getState().toast({ tone: 'neutral', title: 'Log in to see your Wrapped' }); return; }
    open(p);
  };
}
