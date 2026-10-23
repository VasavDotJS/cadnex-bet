/** Money display. The rolling variant animates each digit like an odometer. */
import { motion } from 'framer-motion';
import { formatMoney, FormatOpts, Minor, moneyParts } from '../lib/money';
import { useReduced } from './motion';

export function Money({ amount, code, opts, className = '' }: { amount: Minor; code: string; opts?: FormatOpts; className?: string }) {
  return <span className={`num ${className}`}>{formatMoney(amount, code, opts)}</span>;
}

function Digit({ d, h }: { d: number; h: number }) {
  return (
    <span className="relative inline-block overflow-hidden" style={{ height: h, width: '0.62em' }}>
      <motion.span
        className="absolute left-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: -d * h }}
        transition={{ type: 'spring', stiffness: 140, damping: 22, mass: 1 }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block text-center" style={{ height: h, lineHeight: `${h}px`, width: '0.62em' }}>
            {i}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Big hero amount: symbol small and muted, digits roll on change. */
export function RollingMoney({ amount, code, size, hidden, className = '', symbolClass = 'text-mute', fracClass = 'text-mute', trim = true }: {
  amount: Minor; code: string; size: number; hidden?: boolean; className?: string; symbolClass?: string; fracClass?: string; trim?: boolean;
}) {
  const reduced = useReduced();
  const p = moneyParts(amount, code, { trim, hidden });
  const h = Math.round(size * 1.1);
  const sym = <span className={`${symbolClass} font-normal`} style={{ fontSize: size * 0.62, lineHeight: `${h * 0.9}px` }}>{p.symbol}</span>;
  return (
    <span className={`num inline-flex items-end whitespace-nowrap ${className}`} style={{ fontSize: size, lineHeight: `${h}px`, height: h, letterSpacing: '-0.035em' }} aria-label={formatMoney(amount, code, { hidden })}>
      {p.sign && <span>{p.sign}</span>}
      {!p.symbolAfter && <>{sym}<span style={{ width: size * 0.12 }} /></>}
      {hidden || reduced ? (
        <span>{p.int}</span>
      ) : (
        p.int.split('').map((ch, i) => (/\d/.test(ch) ? <Digit key={`${p.int.length - i}`} d={Number(ch)} h={h} /> : <span key={`s${p.int.length - i}`} className="inline-block" style={{ height: h, lineHeight: `${h}px` }}>{ch}</span>))
      )}
      {p.frac && <span className={fracClass} style={{ fontSize: size * 0.5, lineHeight: `${h * 0.86}px` }}>.{p.frac}</span>}
      {p.symbolAfter && <><span style={{ width: size * 0.14 }} />{sym}</>}
    </span>
  );
}
