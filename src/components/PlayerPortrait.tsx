/**
 * Tennis players: their photo in black and white (see lib/bwphoto). Until the photo is ready,
 * or when there isn't one, a chip with the player's initials shows instead.
 */
import { useEffect, useRef, useState } from 'react';
import type { Participant } from '../engine/types';
import { isPlaceholderName, playerImage, playerPhoto, PlayerPhotoInfo } from '../lib/players';
import { bwPhoto } from '../lib/bwphoto';

/** finished prints by player and pixel size, so remounts are instant */
const prints = new Map<string, HTMLCanvasElement | null>();
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const radius = (size: number) => Math.round(size * 0.22);

/** The chip shown while loading or when there's no photo. */
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
          made = bwPhoto(img, px);
          prints.set(key, made);
        }
        if (!live || !made) return;
        setInfo(found);
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
          <canvas ref={canvas} className="h-full w-full" style={{ borderRadius: radius(size) }} role="img" aria-label={`${p.name}, photo`} />
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
