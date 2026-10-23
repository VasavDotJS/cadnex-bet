/**
 * Money is sacred: every amount is an integer count of minor units held as a bigint.
 * Odds are integers scaled by 10,000 (oddsE4) so returns can be computed exactly.
 * No floating point ever touches a balance, stake or payout.
 */
import { currency } from './currencies';

export type Minor = bigint;
export const ODDS_SCALE = 10000n;

const POW10: bigint[] = Array.from({ length: 19 }, (_, i) => 10n ** BigInt(i));
export function pow10(n: number): bigint {
  return POW10[n];
}

/** Parse a user-typed decimal string ("1,234.5") into minor units. Returns null if invalid. */
export function parseAmount(input: string, code: string): Minor | null {
  const d = currency(code).decimals;
  const s = input.replace(/[,\s_]/g, '').trim();
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
  const [ip, fp = ''] = s.split('.');
  if (fp.length > d) return null;
  const intPart = BigInt(ip || '0');
  const frac = BigInt((fp + '0'.repeat(d)).slice(0, d) || '0');
  return intPart * pow10(d) + frac;
}

/** Whole units → minor units (for presets like +1,000). */
export function units(n: number | bigint, code: string): Minor {
  return BigInt(n) * pow10(currency(code).decimals);
}

/** USD amount (as a decimal string) → minor units of `code`, rounded up to at least 1 minor unit. */
export function usdToMinor(usd: string, code: string, round: 'up' | 'down' = 'up'): Minor {
  const usdMinor = parseAmount(usd, 'USD') ?? 0n;
  const v = convertMinor(usdMinor, 'USD', code, round);
  return v < 1n ? 1n : v;
}

const RATE_SCALE = 1_000_000_000_000n; // rates held as integers with 12 decimals
function rateScaled(code: string): bigint {
  return BigInt(Math.round(currency(code).usd * 1e12));
}

/** Exact conversion between currencies using the bundled demo FX table. */
export function convertMinor(amount: Minor, from: string, to: string, round: 'up' | 'down' = 'down'): Minor {
  if (from === to) return amount;
  const df = currency(from).decimals;
  const dt = currency(to).decimals;
  const num = amount * rateScaled(to) * pow10(dt);
  const den = rateScaled(from) * pow10(df);
  const q = num / den;
  if (round === 'up' && num % den !== 0n) return q + 1n;
  return q;
}

/** Display rate "1 FROM = x TO". */
export function fxRate(from: string, to: string): number {
  return currency(to).usd / currency(from).usd;
}

void RATE_SCALE;

export interface FormatOpts {
  /** drop trailing zero decimals (crypto heroes) */
  trim?: boolean;
  /** show + for positive values */
  sign?: boolean;
  /** hide digits (eye toggle) */
  hidden?: boolean;
  /** whole units only */
  noDecimals?: boolean;
  /** compact suffix (1.2K, 3.4M) for tight spaces */
  compact?: boolean;
}

const groupers = new Map<string, Intl.NumberFormat>();
function grouper(code: string): Intl.NumberFormat {
  const locale = code === 'INR' || code === 'NPR' ? 'en-IN' : 'en-US';
  let g = groupers.get(locale);
  if (!g) {
    g = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    groupers.set(locale, g);
  }
  return g;
}

export interface MoneyParts {
  symbol: string;
  symbolAfter: boolean;
  sign: string;
  int: string;
  frac: string; // without the dot; '' if none
}

export function moneyParts(amount: Minor, code: string, opts: FormatOpts = {}): MoneyParts {
  const cur = currency(code);
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const d = cur.decimals;
  const intPart = abs / pow10(d);
  let frac = d > 0 ? (abs % pow10(d)).toString().padStart(d, '0') : '';
  if (opts.noDecimals) frac = '';
  if (opts.trim && frac) {
    frac = frac.replace(/0+$/, '');
    if (cur.kind === 'fiat' && frac.length === 1) frac += '0';
  }
  let int = grouper(code).format(intPart);
  if (opts.compact && intPart >= 10000n) {
    const n = Number(intPart);
    const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, s] of units) {
      if (n >= v) {
        int = (n / v).toFixed(n / v >= 100 ? 0 : 1).replace(/\.0$/, '') + s;
        frac = '';
        break;
      }
    }
  }
  const symbolAfter = cur.symbol.length > 1 && /[A-Za-z]{2,}/.test(cur.symbol) ? true : cur.kind === 'crypto';
  const symbol = cur.kind === 'crypto' ? cur.code : cur.symbol;
  const sign = neg ? '−' : opts.sign && amount > 0n ? '+' : '';
  if (opts.hidden) return { symbol, symbolAfter, sign: '', int: '••••', frac: '' };
  return { symbol, symbolAfter, sign, int, frac };
}

export function formatMoney(amount: Minor, code: string, opts: FormatOpts = {}): string {
  const p = moneyParts(amount, code, opts);
  const num = p.frac ? `${p.int}.${p.frac}` : p.int;
  return p.symbolAfter ? `${p.sign}${num} ${p.symbol}` : `${p.sign}${p.symbol}${num}`;
}

/** Minor units → plain decimal string without grouping (for inputs). */
export function toPlain(amount: Minor, code: string): string {
  const d = currency(code).decimals;
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const i = abs / pow10(d);
  const f = d ? (abs % pow10(d)).toString().padStart(d, '0').replace(/0+$/, '') : '';
  return `${neg ? '-' : ''}${i}${f ? '.' + f : ''}`;
}

// ───────────────────────── odds maths ─────────────────────────

/** Decimal odds (e.g. 2.35) → oddsE4 integer. Odds are quoted to 2 dp so this is exact. */
export function toE4(decimal: number): bigint {
  return BigInt(Math.round(decimal * 100)) * 100n;
}

export function e4ToNumber(e4: bigint): number {
  return Number(e4) / 10000;
}

export type LegResult = 'PENDING' | 'WON' | 'LOST' | 'VOID' | 'PUSH' | 'HALF_WON' | 'HALF_LOST';

/** Effective multiplier (×10,000) a settled leg contributes. */
export function legMultiplierE4(result: LegResult, oddsE4: bigint): bigint {
  switch (result) {
    case 'WON': return oddsE4;
    case 'LOST': return 0n;
    case 'VOID':
    case 'PUSH': return ODDS_SCALE;
    case 'HALF_WON': return (oddsE4 + ODDS_SCALE) / 2n;
    case 'HALF_LOST': return ODDS_SCALE / 2n;
    case 'PENDING': return oddsE4;
  }
}

/** Return of a stake over a set of leg multipliers, floored to the minor unit. */
export function comboReturn(stake: Minor, multipliersE4: bigint[]): Minor {
  let num = stake;
  let den = 1n;
  for (const m of multipliersE4) {
    num *= m;
    den *= ODDS_SCALE;
  }
  return num / den;
}

/** Total odds of a combination, as oddsE4 (floored). */
export function comboOddsE4(oddsE4: bigint[]): bigint {
  let num = 1n;
  let den = 1n;
  for (const o of oddsE4) {
    num *= o;
    den *= ODDS_SCALE;
  }
  return (num * ODDS_SCALE) / den;
}

// ───────────────────────── system bets ─────────────────────────

export interface SystemType {
  id: string;
  name: string;
  legs: number; // required number of selections
  sizes: number[]; // combination sizes included (1 = singles)
}

export const SYSTEM_TYPES: SystemType[] = [
  { id: '2/3', name: '2 from 3', legs: 3, sizes: [2] },
  { id: '2/4', name: '2 from 4', legs: 4, sizes: [2] },
  { id: '3/4', name: '3 from 4', legs: 4, sizes: [3] },
  { id: 'trixie', name: 'Trixie', legs: 3, sizes: [2, 3] },
  { id: 'patent', name: 'Patent', legs: 3, sizes: [1, 2, 3] },
  { id: 'yankee', name: 'Yankee', legs: 4, sizes: [2, 3, 4] },
  { id: 'lucky15', name: 'Lucky 15', legs: 4, sizes: [1, 2, 3, 4] },
  { id: 'canadian', name: 'Canadian', legs: 5, sizes: [2, 3, 4, 5] },
  { id: 'lucky31', name: 'Lucky 31', legs: 5, sizes: [1, 2, 3, 4, 5] },
  { id: 'heinz', name: 'Heinz', legs: 6, sizes: [2, 3, 4, 5, 6] },
  { id: 'lucky63', name: 'Lucky 63', legs: 6, sizes: [1, 2, 3, 4, 5, 6] },
];

export function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const cur: T[] = [];
  const rec = (start: number) => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1); cur.pop(); }
  };
  rec(0);
  return out;
}

/** Lines (as index sets) for a system bet over n legs. */
export function systemLines(type: SystemType, n: number): number[][] {
  if (n !== type.legs) return [];
  const idx = Array.from({ length: n }, (_, i) => i);
  return type.sizes.flatMap((k) => combinations(idx, k));
}

/** Return of a system bet: unit stake on each line. */
export function systemReturn(unitStake: Minor, type: SystemType, legMultipliersE4: bigint[]): Minor {
  let total = 0n;
  for (const line of systemLines(type, legMultipliersE4.length)) {
    total += comboReturn(unitStake, line.map((i) => legMultipliersE4[i]));
  }
  return total;
}
