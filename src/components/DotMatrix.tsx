/** Dot-matrix numerals for live scores and clocks. Characters change with a soft dissolve. */
import { AnimatePresence, motion } from 'framer-motion';
import { memo } from 'react';
import { useReduced } from './motion';

const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0'],
  '.': ['0', '0', '0', '0', '0', '0', '1'],
  "'": ['1', '1', '0', '0', '0', '0', '0'],
  '-': ['000', '000', '000', '111', '000', '000', '000'],
  '–': ['0000', '0000', '0000', '1111', '0000', '0000', '0000'],
  '+': ['000', '000', '010', '111', '010', '000', '000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
};

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
