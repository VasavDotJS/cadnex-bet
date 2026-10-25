/**
 * Share a bet as a moving story: a live preview, a couple of privacy switches, and buttons
 * that hand an MP4 to Instagram Stories or WhatsApp Status through the phone's share sheet.
 * The video is made in the background as soon as the sheet opens, so the share button works
 * on the first tap (iOS only allows sharing straight from a tap).
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Download, Link2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { Sheet } from '../components/Sheet';
import { press, spring } from '../components/motion';
import { formatMoney } from '../lib/money';
import { formatOdds } from '../lib/odds';
import { useLive } from '../store/live';
import { useSession } from '../store/session';
import { useSlip } from '../store/slip';
import { useUi } from '../store/ui';
import { shareUrl } from './link';
import { Assets, drawStory, DURATION, H, loadAssets, Story, StoryOptions, storyFromBet, storyFromSlip, W } from './story';
import { preloadLogos } from './logos';
import { drawMatchStory, matchStoryFrom } from './matchStory';
import { makeStoryFile, StoryFile } from './video';

type Source = { kind: 'bet'; betId: string } | { kind: 'slip' } | { kind: 'event'; eventId: string };

/** Whatever is being shared, reduced to what the sheet needs: a way to draw it and where it links. */
interface Card {
  key: string;
  link: string;
  name: string;
  glow: string;
  amounts: boolean;
  caption: string;
  footnote: string;
  logos: (string | undefined)[];
  draw(ctx: CanvasRenderingContext2D, t: number, a: Assets, o: StoryOptions): void;
}

const VIOLET = 'rgb(124 108 246 / 0.4)';
const LIMEGLOW = 'rgb(181 242 61 / 0.35)';

function betCard(story: Story): Card {
  const won = story.status === 'WON' || story.status === 'CASHED_OUT';
  return {
    key: `${story.status}|${story.odds}|${story.ret}|${story.legs.map((l) => l.result + (l.live?.score ?? '')).join(',')}`,
    link: story.link,
    name: `cadnex-${story.status.toLowerCase()}`,
    glow: won ? LIMEGLOW : VIOLET,
    amounts: !!story.stake,
    caption: `Copy my bet on CADNEX 👉 ${story.link}`,
    logos: story.legs.flatMap((l) => [l.home.logo, l.away.logo]),
    footnote: 'Friends who scan the code or open the link get your picks in their own slip, at the current prices.',
    draw: (ctx, t, a, o) => drawStory(ctx, t, story, a, o),
  };
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
};

export const useShare = create<{ source: Source | null; open(s: Source): void; close(): void }>((set) => ({
  source: null,
  open: (source) => set({ source }),
  close: () => set({ source: null }),
}));

/** Build the card for the current source from live app state. */
function useCard(source: Source | null): Card | null {
  const bets = useSession((s) => s.bets);
  const user = useSession((s) => s.user);
  const fmt = useSession((s) => s.settings?.oddsFormat ?? 'decimal');
  const sels = useSlip((s) => s.sels);
  const events = useLive((s) => s.events);
  const [beat, setBeat] = useState(0);
  // refresh live scores in the preview every couple of seconds, not on every tick
  useEffect(() => {
    if (!source) return;
    const id = setInterval(() => setBeat((b) => b + 1), 2000);
    return () => clearInterval(id);
  }, [source]);
  return useMemo(() => {
    if (!source) return null;
    const name = user?.username ?? '';
    const link = (picks: Parameters<typeof shareUrl>[1]) => shareUrl(name, picks);
    const odds = (o: number) => formatOdds(o, fmt);
    if (source.kind === 'event') {
      const ev = events[source.eventId];
      if (!ev) return null;
      const url = `${window.location.origin}/#/event/${encodeURIComponent(ev.id)}`;
      const m = matchStoryFrom(ev, odds, url);
      const title = `${ev.home.name} v ${ev.away.name}`;
      const glow = m.phase === 'FT' && m.winner !== null ? (m.winner === 0 ? m.home.color : m.away.color) : m.home.color;
      return {
        key: m.key,
        link: url,
        name: `cadnex-${m.home.short}-${m.away.short}`.toLowerCase(),
        glow: rgba(glow, 0.45),
        amounts: false,
        caption: m.phase === 'LIVE' ? `${title} is live, ${m.score?.join('–')} 🔴 Follow it on CADNEX 👉 ${url}` : m.phase === 'FT' ? `${title} finished ${m.score?.join('–')} ⚽ on CADNEX 👉 ${url}` : `${title} · ${m.date} ${m.time} 🔥 Get your picks in on CADNEX 👉 ${url}`,
        footnote: 'The code and link open this match on CADNEX, with live score and prices.',
        logos: [m.home.logo, m.away.logo],
        draw: (ctx, t, a) => drawMatchStory(ctx, t, m, a),
      };
    }
    if (source.kind === 'bet') {
      const bet = bets.find((b) => b.id === source.betId);
      const s = bet ? storyFromBet(bet, events, odds, (m, c) => formatMoney(m, c), name, link) : null;
      return s ? betCard(s) : null;
    }
    const s = sels.length ? storyFromSlip(sels, events, odds, name, link) : null;
    return s ? betCard(s) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, bets, user, fmt, sels, beat]);
}

function Preview({ card, assets, opts }: { card: Card; assets: Assets; opts: StoryOptions }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ card, opts });
  live.current = { card, opts };
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = c.clientWidth;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(((cssW * H) / W) * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const scale = c.width / W;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const LOOP = DURATION + 1.2; // hold the finished card a moment before replaying
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / 40) return;
      last = now;
      const t = reduced ? DURATION : ((now - start) / 1000) % LOOP;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      live.current.card.draw(ctx, t, assets, live.current.opts);
      // fade to black and back at the loop point
      const fade = t > LOOP - 0.35 ? (t - (LOOP - 0.35)) / 0.35 : t < 0.2 ? 1 - t / 0.2 : 0;
      if (fade > 0) {
        ctx.fillStyle = `rgba(10,10,12,${fade})`;
        ctx.fillRect(0, 0, W, H);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [assets]);
  return <canvas ref={ref} className="block h-auto w-full" aria-label="Animated story preview" />;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on} className="flex h-12 w-full items-center justify-between gap-3 rounded-[16px] bg-surface2 px-4 text-[14.5px]">
      <span>{label}</span>
      <span className={`relative h-[26px] w-[44px] rounded-full transition-colors ${on ? 'bg-lime' : 'bg-surface3'}`}>
        <motion.span layout transition={spring} className={`absolute top-[3px] h-5 w-5 rounded-full shadow ${on ? 'right-[3px] bg-onlime' : 'left-[3px] bg-white'}`} />
      </span>
    </button>
  );
}

export function canShareFiles(f: File): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

export function download(f: File) {
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function ShareStorySheet() {
  const source = useShare((s) => s.source);
  const close = useShare((s) => s.close);
  const card = useCard(source);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [opts, setOpts] = useState<StoryOptions>({ showAmounts: true, showUser: true });
  const [file, setFile] = useState<StoryFile | null>(null);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const gen = useRef(0);

  useEffect(() => {
    if (source && !assets) void loadAssets().then(setAssets);
  }, [source, assets]);

  // make the file in the background; redo it when the switches change
  const storyKey = card?.key ?? '';
  useEffect(() => {
    if (!source || !card || !assets) return;
    const my = ++gen.current;
    setFile(null);
    setProgress(0);
    const snapshot = card;
    const o = opts;
    const t = setTimeout(async () => {
      await preloadLogos(snapshot.logos);
      if (gen.current !== my) return;
      void makeStoryFile((ctx, time) => snapshot.draw(ctx, time, assets, o), (p) => { if (gen.current === my) setProgress(p); }, snapshot.name)
        .then((f) => { if (gen.current === my) setFile(f); });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, assets, opts.showAmounts, opts.showUser, storyKey]);

  useEffect(() => {
    if (!source) { gen.current++; setFile(null); setCopied(false); }
  }, [source]);

  const shareable = file ? canShareFiles(file.file) : false;
  const tip = (where: 'instagram' | 'whatsapp') =>
    useUi.getState().toast(
      where === 'instagram'
        ? { tone: 'neutral', title: 'Pick Instagram, then Story', body: 'Tip: add a Link sticker with your copied link so friends can tap through.' }
        : { tone: 'neutral', title: 'Pick WhatsApp, then My status', body: 'Your link is in the caption.' },
      6500,
    );
  const share = async (where: 'instagram' | 'whatsapp') => {
    if (!file || !card) return;
    try {
      await navigator.share({ files: [file.file], text: where === 'whatsapp' ? card.caption : undefined, title: 'CADNEX' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') useUi.getState().toast({ tone: 'error', title: 'Sharing did not open', body: 'Save the video and post it from your gallery instead.' });
      return;
    }
    tip(where);
  };
  const copy = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      useUi.getState().toast({ tone: 'neutral', title: 'Your link', body: card.link }, 9000);
    }
  };

  const hasAmounts = !!card?.amounts;
  const isMatch = source?.kind === 'event';
  const busy = !file;
  return (
    <Sheet open={!!source && !!card} onClose={close} tall title={<>Share <span className="text-mute">{isMatch ? 'match' : 'story'}</span></>} label="Share as a story">
      {card && (
        <div className="flex flex-col items-center gap-5 pb-2">
          <div className="relative w-[min(62vw,272px)]">
            <div className="pointer-events-none absolute -inset-8 rounded-[60px] opacity-70 blur-2xl" style={{ background: `radial-gradient(closest-side, ${card.glow}, transparent)` }} />
            <div className="relative overflow-hidden rounded-[30px] bg-[#0A0A0C]" style={{ boxShadow: '0 0 0 1px rgb(255 255 255 / 0.08), 0 30px 60px -20px rgb(0 0 0 / 0.7)' }}>
              {assets ? <Preview card={card} assets={assets} opts={opts} /> : <div className="skeleton aspect-[9/16] w-full" />}
            </div>
          </div>

          <div className="h-5 w-full max-w-[272px]">
            <AnimatePresence mode="wait" initial={false}>
              {busy ? (
                <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface3"><motion.div className="h-full rounded-full bg-lime" animate={{ width: `${Math.round(progress * 100)}%` }} transition={{ duration: 0.2 }} /></div>
                  <span className="mono text-[12px] text-mute">{progress > 0 ? `${Math.round(progress * 100)}%` : 'Preparing'}</span>
                </motion.div>
              ) : (
                <motion.p key="ready" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-1.5 text-[12.5px] text-mute">
                  <Sparkles size={13} className="text-lime" />{file?.kind === 'video' ? 'Your 6-second story is ready' : 'Your story image is ready'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="grid w-full gap-2">
            {hasAmounts && <Toggle label="Show stake and returns" on={opts.showAmounts} onChange={(v) => setOpts({ ...opts, showAmounts: v })} />}
            {!isMatch && <Toggle label="Show my username" on={opts.showUser} onChange={(v) => setOpts({ ...opts, showUser: v })} />}
          </div>

          {shareable || busy ? (
            <div className="grid w-full grid-cols-2 gap-2">
              <motion.button whileTap={press} disabled={busy} onClick={() => void share('instagram')} className="relative flex h-[60px] items-center justify-center gap-2 overflow-hidden rounded-[20px] text-[15px] font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(120deg, #6d4bf5 0%, #c13584 45%, #f56040 80%, #fcaf45 100%)' }}>
                <StoryRing />Instagram Story
              </motion.button>
              <motion.button whileTap={press} disabled={busy} onClick={() => void share('whatsapp')} className="flex h-[60px] items-center justify-center gap-2 rounded-[20px] text-[15px] font-semibold text-[#0b2b1a] disabled:opacity-50" style={{ background: 'linear-gradient(120deg, #3ddc84 0%, #25d366 60%, #1ebe5a 100%)' }}>
                <StatusRing />WhatsApp Status
              </motion.button>
            </div>
          ) : (
            <motion.button whileTap={press} onClick={() => file && download(file.file)} className="flex h-[60px] w-full items-center justify-center gap-2 rounded-[20px] bg-lime text-[15px] font-semibold text-onlime">
              <Download size={18} />Download {file?.kind === 'video' ? 'video' : 'image'}
            </motion.button>
          )}
          <div className="grid w-full grid-cols-2 gap-2">
            <motion.button whileTap={press} disabled={busy} onClick={() => file && download(file.file)} className="flex h-12 items-center justify-center gap-2 rounded-[16px] bg-surface2 text-[14px] disabled:opacity-50"><Download size={16} />Save {file?.kind === 'image' ? 'image' : 'video'}</motion.button>
            <motion.button whileTap={press} onClick={() => void copy()} className="flex h-12 items-center justify-center gap-2 rounded-[16px] bg-surface2 text-[14px]">{copied ? <><Check size={16} className="text-up" />Copied</> : <><Link2 size={16} />Copy link</>}</motion.button>
          </div>
          <p className="max-w-[40ch] text-center text-[12px] leading-relaxed text-faint">{card.footnote}</p>
        </div>
      )}
    </Sheet>
  );
}

/** A small "story ring" glyph (a dashed circle), drawn by us — no brand logos. */
function StoryRing() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="10" r="3.2" fill="currentColor" />
    </svg>
  );
}
function StatusRing() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="7 3.5" />
      <path d="M10 6v4l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
