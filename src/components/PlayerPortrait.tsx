/**
 * Tennis players: their photo re-printed as a halftone dot portrait. The dots print in row by
 * row the first time it appears, and a faint scanner line passes over it now and then.
 * Until the photo is ready (or if there isn't one) the player's monogram shows instead.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import type { Participant } from '../engine/types';
import { drawHalftone, prepareHalftone, Prepared } from '../lib/halftone';
import { isPlaceholderName, playerImage, playerPhoto, PlayerPhotoInfo } from '../lib/players';

/** portraits already printed this session appear at once next time */
const printed = new Set<string>();

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** a stable 0..1 per player, so scanner passes are staggered across the page */
function phase(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export const portraitCells = (size: number) => Math.max(16, Math.min(44, Math.round(size * 0.62)));

export function PlayerPortrait({ p, size, className = '', fallback }: { p: Participant; size: number; className?: string; fallback: ReactNode }) {
  const holder = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<PlayerPhotoInfo | null>(null);
  const [art, setArt] = useState<Prepared | null>(null);
  const placeholder = isPlaceholderName(p.name);

  // look the player up once the crest is near the screen
  useEffect(() => {
    if (placeholder) return;
    const el = holder.current;
    if (!el) return;
    let live = true;
    const go = () => {
      playerPhoto(p.name, p.id).then(async (found) => {
        if (!live || !found) return;
        const img = await playerImage(found);
        if (!live || !img) return;
        const prepared = prepareHalftone(img, portraitCells(size));
        if (!live || !prepared) return;
        setInfo(found);
        setArt(prepared);
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      go();
      return () => { live = false; };
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        go();
      }
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [p.name, p.id, size, placeholder]);

  // print the dots in
  useEffect(() => {
    const c = canvas.current;
    if (!c || !art) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    c.width = c.height = px;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const key = `${p.name}|${size}`;
    const draw = (progress: number) => {
      ctx.clearRect(0, 0, px, px);
      drawHalftone(ctx, art, px / 2, px / 2, px, { progress, paper: '#141418', highlight: '#B5F23D' });
    };
    if (printed.has(key) || reducedMotion()) {
      draw(1);
      return;
    }
    printed.add(key);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      draw(1 - (1 - t) ** 2);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [art, size, p.name]);

  if (placeholder) {
    return (
      <span
        className={`portrait-tbd inline-flex shrink-0 items-center justify-center rounded-full font-mono text-mute ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
        role="img"
        aria-label="Player to be decided"
      >
        ?
      </span>
    );
  }

  return (
    <span
      ref={holder}
      className={`portrait relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      title={info?.credit ? `${p.name} · ${info.credit}` : p.name}
    >
      {art ? (
        <>
          <canvas ref={canvas} className="h-full w-full rounded-full" role="img" aria-label={`${p.name}, photo`} />
          {size >= 32 && <span className="portrait-scan" aria-hidden style={{ animationDelay: `${(phase(p.name) * -9).toFixed(2)}s` }} />}
        </>
      ) : (
        fallback
      )}
    </span>
  );
}

/** The player's photo details (null until known, or when there's no photo). */
export function usePlayerPhoto(p: Participant): PlayerPhotoInfo | null {
  const [info, setInfo] = useState<PlayerPhotoInfo | null>(null);
  useEffect(() => {
    let live = true;
    setInfo(null);
    if (!isPlaceholderName(p.name)) playerPhoto(p.name, p.id).then((v) => { if (live) setInfo(v); });
    return () => { live = false; };
  }, [p.name, p.id]);
  return info;
}

/** Credit lines for the photos shown (their licences ask for the author to be named). */
export function PhotoCredits({ players, className = '' }: { players: Participant[]; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 text-center text-[11px] leading-snug text-faint ${className}`}>
      {players.map((pl) => <Credit key={pl.id + pl.name} p={pl} />)}
    </div>
  );
}

function Credit({ p }: { p: Participant }) {
  const info = usePlayerPhoto(p);
  if (!info?.credit) return null;
  const text = `${p.name} — ${info.credit.replace(/^Photo: /, '')}`;
  return info.source ? (
    <a href={info.source} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-mute hover:underline">{text}</a>
  ) : (
    <span>{text}</span>
  );
}
