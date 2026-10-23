/** Ambient light: blurred orbs that drift slowly and react to winning, losing and live tension. */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useUi } from '../store/ui';
import { useReduced } from './motion';

type Palette = 'live' | 'wallet' | 'landing' | 'calm';

const PALETTES: Record<Palette, [string, string, string]> = {
  live: ['var(--magenta)', 'var(--deepblue)', 'var(--violet)'],
  wallet: ['var(--lavender)', 'var(--violet)', 'var(--deepblue)'],
  landing: ['var(--violet)', 'var(--magenta)', 'var(--lime)'],
  calm: ['var(--violet)', 'var(--deepblue)', 'var(--lavender)'],
};

export function Orbs({ palette = 'calm', intensity = 1, className = '' }: { palette?: Palette; intensity?: number; className?: string }) {
  const mood = useUi((s) => s.mood);
  const [a, b, c] = mood === 'win' ? ['var(--lime)', 'var(--lime)', PALETTES[palette][2]] : mood === 'loss' ? ['var(--down)', PALETTES[palette][1], PALETTES[palette][2]] : PALETTES[palette];
  const o = 0.5 * intensity;
  const base = 'orb transition-[background-color,opacity] duration-[1200ms]';
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className={base} style={{ width: '62%', height: '70%', left: '-12%', top: '-28%', animation: 'drift 18s ease-in-out infinite', backgroundColor: `rgb(${a})`, opacity: o }} />
      <div className={base} style={{ width: '55%', height: '64%', right: '-14%', top: '-8%', animation: 'drift 23s ease-in-out infinite reverse', backgroundColor: `rgb(${b})`, opacity: o * 0.8 }} />
      <div className={base} style={{ width: '40%', height: '46%', left: '28%', bottom: '-30%', animation: 'drift 27s ease-in-out infinite', backgroundColor: `rgb(${c})`, opacity: o * 0.55 }} />
    </div>
  );
}

/** A short, restrained particle burst from the balance card on wins. */
export function Celebration() {
  const n = useUi((s) => s.celebrate);
  const reduced = useReduced();
  const [burst, setBurst] = useState<number | null>(null);
  useEffect(() => {
    if (!n) return;
    setBurst(n);
    const t = setTimeout(() => setBurst(null), 1400);
    return () => clearTimeout(t);
  }, [n]);
  if (reduced) return null;
  return (
    <AnimatePresence>
      {burst && (
        <motion.div key={burst} className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="relative mt-40 h-0 w-0">
            {Array.from({ length: 18 }, (_, i) => {
              const ang = (i / 18) * Math.PI * 2;
              const dist = 70 + (i % 3) * 28;
              return (
                <motion.span
                  key={i}
                  className="absolute h-1.5 w-1.5 rounded-full bg-lime"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, opacity: 0, scale: 0.4 }}
                  transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
