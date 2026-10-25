/** Dot-matrix numerals for live scores and clocks. Characters change with a soft dissolve. */
import { AnimatePresence, motion } from 'framer-motion';
import { memo } from 'react';
import { GLYPHS } from './glyphs';
import { useReduced } from './motion';

const Char = memo(function Char({ ch, dot, faint }: { ch: string; dot: number; faint: boolean }) {
  const g = GLYPHS[ch] ?? GLYPHS[' '];
  const w = g[0].length;
  const pitch = dot * 1.45;
  const W = w * pitch;
  const H = 7 * pitch;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      {g.flatMap((row, y) =>
        row.split('').map((b, x) =>
          b === '1' ? (
            <circle key={`${x}-${y}`} cx={x * pitch + pitch / 2} cy={y * pitch + pitch / 2} r={dot / 2} fill="currentColor" />
          ) : faint ? (
            <circle key={`${x}-${y}`} cx={x * pitch + pitch / 2} cy={y * pitch + pitch / 2} r={dot / 2} fill="currentColor" opacity={0.08} />
          ) : null,
        ),
      )}
    </svg>
  );
});

export function DotMatrix({ text, dot = 5, faint = true, className = '', label, still = false }: { text: string; dot?: number; faint?: boolean; className?: string; label?: string; still?: boolean }) {
  const reduced = useReduced() || still;
  const chars = text.split('');
  return (
    <span className={`inline-flex items-end ${className}`} style={{ gap: dot * 0.9 }} role="img" aria-label={label ?? text}>
      {chars.map((ch, i) => (
        <span key={i} className="relative inline-block" style={{ height: dot * 1.45 * 7 }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch}
              className="block"
              initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)', scale: 1.08 }}
              animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)', scale: 0.92 }}
              transition={{ duration: reduced ? 0 : 0.45 }}
            >
              {GLYPHS[ch] ? <Char ch={ch} dot={dot} faint={faint} /> : <span className="font-mono" style={{ fontSize: dot * 7 }}>{ch}</span>}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
