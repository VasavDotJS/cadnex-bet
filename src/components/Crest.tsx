/**
 * Team crests: the club's official logo when the feed has one, otherwise a monogram in the
 * team's colours (or if the logo can't load). Tennis players get their photo in black and white.
 */
import { useState } from 'react';
import type { SportId } from '../data/types';
import { logoSrc } from '../lib/logo';
import type { Participant } from '../engine/types';
import { PlayerPortrait } from './PlayerPortrait';

function lum(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function monogram(p: Participant, sport: SportId): string {
  if (sport === 'tennis') {
    const parts = p.name.split(' ');
    return (parts[0][0] + (parts[parts.length - 1][0] ?? '')).toUpperCase();
  }
  const s = p.short.replace(/[^A-Za-z0-9]/g, '');
  return s.length <= 3 ? s : s.slice(0, 3);
}

/** Logos that failed once aren't retried for the rest of the session. */
const broken = new Set<string>();

export function Crest({ p, sport, size = 40, className = '' }: { p: Participant; sport: SportId; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (sport === 'tennis') {
    return <PlayerPortrait p={p} size={size} className={className} />;
  }
  if (p.logo && !failed && !broken.has(p.logo)) {
    const logo = p.logo;
    return (
      <span className={`crest-logo inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <img
          src={logoSrc(logo, size)}
          alt={`${p.name} logo`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-contain"
          onError={() => { broken.add(logo); setFailed(true); }}
        />
      </span>
    );
  }
  return <Monogram p={p} sport={sport} size={size} className={className} />;
}

function Monogram({ p, sport, size, className }: { p: Participant; sport: SportId; size: number; className: string }) {
  const [bg, fg0] = p.colors;
  const fg = contrast(bg, fg0) >= 2.4 ? fg0 : lum(bg) > 0.4 ? '#0B0B0D' : '#FFFFFF';
  const text = monogram(p, sport);
  const fs = text.length >= 3 ? 0.3 : 0.38;
  const shield = sport === 'football' || sport === 'cricket';
  const id = `g-${p.id}-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={`shrink-0 ${className}`} role="img" aria-label={`${p.name} crest`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {shield ? (
        <>
          <path d="M20 2.5 L35 7.5 V19 C35 28.5 28.6 34.6 20 37.5 C11.4 34.6 5 28.5 5 19 V7.5 Z" fill={bg} />
          <path d="M20 2.5 L35 7.5 V19 C35 28.5 28.6 34.6 20 37.5 C11.4 34.6 5 28.5 5 19 V7.5 Z" fill={`url(#${id})`} />
          <path d="M20 5.2 L32.4 9.4 V19 C32.4 26.9 27.3 32.2 20 34.8 C12.7 32.2 7.6 26.9 7.6 19 V9.4 Z" fill="none" stroke={fg} strokeOpacity="0.35" strokeWidth="0.8" />
        </>
      ) : (
        <>
          <circle cx="20" cy="20" r="18" fill={bg} />
          <circle cx="20" cy="20" r="18" fill={`url(#${id})`} />
          <circle cx="20" cy="20" r="15.6" fill="none" stroke={fg} strokeOpacity="0.3" strokeWidth="0.8" />
        </>
      )}
      <text x="20" y={shield ? 21.5 : 20.5} textAnchor="middle" dominantBaseline="middle" fill={fg} style={{ fontFamily: 'var(--font-geist-sans), Geist, system-ui, sans-serif' }} fontWeight={650} fontSize={40 * fs} letterSpacing="-0.02em">
        {text}
      </text>
    </svg>
  );
}
