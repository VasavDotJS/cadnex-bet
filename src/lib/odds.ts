/** Odds formats and display. Internally odds are always decimal. */
export type OddsFormat = 'decimal' | 'fractional' | 'american' | 'hongkong' | 'indonesian' | 'malay';

export const ODDS_FORMATS: { id: OddsFormat; name: string; sample: string }[] = [
  { id: 'decimal', name: 'Decimal', sample: '2.50' },
  { id: 'fractional', name: 'Fractional', sample: '3/2' },
  { id: 'american', name: 'American', sample: '+150' },
  { id: 'hongkong', name: 'Hong Kong', sample: '1.50' },
  { id: 'indonesian', name: 'Indonesian', sample: '+1.50' },
  { id: 'malay', name: 'Malay', sample: '-0.67' },
];

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

// common bookmaker fractions so 1.91 shows as 10/11 rather than 91/100
const NICE_FRACTIONS: [number, number][] = [
  [1, 100], [1, 50], [1, 33], [1, 25], [1, 20], [1, 16], [1, 14], [1, 12], [1, 10], [1, 9], [1, 8], [1, 7], [2, 13], [1, 6], [2, 11], [1, 5], [2, 9], [1, 4], [2, 7], [3, 10], [1, 3], [4, 11], [2, 5], [4, 9], [1, 2], [8, 15], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [11, 10], [6, 5], [5, 4], [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2], [5, 1], [11, 2], [6, 1], [13, 2], [7, 1], [15, 2], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [14, 1], [16, 1], [18, 1], [20, 1], [25, 1], [33, 1], [40, 1], [50, 1], [66, 1], [80, 1], [100, 1], [150, 1], [200, 1], [250, 1], [500, 1],
];

export function formatOdds(decimal: number, format: OddsFormat): string {
  if (!isFinite(decimal) || decimal <= 1) return '—';
  const p = decimal - 1;
  switch (format) {
    case 'decimal':
      return decimal.toFixed(2);
    case 'fractional': {
      let best = NICE_FRACTIONS[0];
      let bestErr = Infinity;
      for (const fr of NICE_FRACTIONS) {
        const err = Math.abs(fr[0] / fr[1] - p) / p;
        if (err < bestErr) { bestErr = err; best = fr; }
      }
      if (bestErr < 0.025) return `${best[0]}/${best[1]}`;
      const num = Math.round(p * 100);
      const g = gcd(num, 100);
      return `${num / g}/${100 / g}`;
    }
    case 'american':
      return p >= 1 ? `+${Math.round(p * 100)}` : `-${Math.round(100 / p)}`;
    case 'hongkong':
      return p.toFixed(2);
    case 'indonesian':
      return p >= 1 ? `+${p.toFixed(2)}` : `-${(1 / p).toFixed(2)}`;
    case 'malay':
      return p <= 1 ? p.toFixed(2) : `-${(1 / p).toFixed(2)}`;
  }
}

/** Round to a 2-dp price, clamped to the board's range. */
export function roundOdds(o: number): number {
  if (!isFinite(o)) return 1001;
  const c = Math.min(1001, Math.max(1.01, o));
  if (c < 4) return Math.round(c * 100) / 100;
  if (c < 10) return Math.round(c * 20) / 20;
  if (c < 30) return Math.round(c * 4) / 4;
  if (c < 100) return Math.round(c);
  return Math.max(101, Math.round((c - 1) / 50) * 50 + 1);
}
