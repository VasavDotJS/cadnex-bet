/**
 * Tennis players: their photo as a scanned halftone print (see lib/scanprint). The first time
 * a print appears, a scanner light passes down it once. Until the photo is ready, or when
 * there isn't one, a blank paper chip with the player's initials shows instead.
 */
import { useEffect, useRef, useState } from 'react';
import type { Participant } from '../engine/types';
import { isPlaceholderName, playerImage, playerPhoto, PlayerPhotoInfo } from '../lib/players';
import { scanPrint } from '../lib/scanprint';

/** finished prints by player and pixel size, so remounts are instant */
const prints = new Map<string, HTMLCanvasElement | null>();
/** prints already revealed this session appear without the scanner pass next time */
const revealed = new Set<string>();

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const radius = (size: number) => Math.round(size * 0.22);

/** The paper chip shown while loading or when there's no photo. */
function PaperChip({ p, size, className }: { p: Participant; size: number; className: string }) {
  return (
    <span
      className={`print-chip inline-flex shrink-0 items-center justify-center font-semibold ${className}`}
      style={{ width: size, height: size, borderRadius: radius(size), fontSize: Math.round(size * 0.36) }}
      role="img"
      aria-label={p.name}
    >
      {initials(p.name)}
    </span>
  );
}

export function PlayerPortrait({ p, size, className = '' }: { p: Participant; size: number; className?: string }) {
  const holder = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<PlayerPhotoInfo | null>(null);
  const [print, setPrint] = useState<HTMLCanvasElement | null>(null);
  const [reveal, setReveal] = useState(false);
  const placeholder = isPlaceholderName(p.name);

  // look the player up once the crest is near the screen, then make the print
  useEffect(() => {
    if (placeholder) return;
    const el = holder.current;
    if (!el) return;
    let live = true;
    const px = Math.round(size * Math.min(3, window.devicePixelRatio || 1));
    const key = `${p.name}|${px}`;
    const go = () => {
      playerPhoto(p.name, p.id).then(async (found) => {
        if (!live || !found) return;
        let made = prints.get(key);
        if (made === undefined) {
          const img = await playerImage(found);
          if (!live || !img) return;
          made = scanPrint(img, { size: px, seed: p.name });
          prints.set(key, made);
        }
        if (!live || !made) return;
        setInfo(found);
        setReveal(!revealed.has(key) && !reducedMotion());
        revealed.add(key);
        setPrint(made);
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

  useEffect(() => {
    const c = canvas.current;
    if (!c || !print) return;
    c.width = print.width;
    c.height = print.height;
    c.getContext('2d')?.drawImage(print, 0, 0);
  }, [print]);

  if (placeholder) {
    return (
      <span
        className={`print-tbd inline-flex shrink-0 items-center justify-center font-mono text-mute ${className}`}
        style={{ width: size, height: size, borderRadius: radius(size), fontSize: Math.round(size * 0.42) }}
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
      className={`print relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius: radius(size) }}
      title={info?.credit ? `${p.name} · ${info.credit}` : p.name}
    >
      {print ? (
        <>
          <canvas ref={canvas} className={`h-full w-full ${reveal ? 'print-reveal' : ''}`} style={{ borderRadius: radius(size) }} role="img" aria-label={`${p.name}, photo`} />
          {reveal && size >= 32 && <span className="print-bar" aria-hidden />}
        </>
      ) : (
        <PaperChip p={p} size={size} className="" />
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
