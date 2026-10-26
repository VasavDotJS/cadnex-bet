/**
 * The share story: a 1080×1920 animated card of a bet, drawn frame by frame on a canvas.
 * `drawStory(ctx, t, story, assets)` is a pure function of time, so the in-app preview and
 * the exported video are the same pictures.
 *
 * Layout keeps everything important between 260px and 1600px, clear of the bars
 * Instagram and WhatsApp draw over the top and bottom of a story.
 */
import qrcode from 'qrcode-generator';
import { MARK, SUB } from '../components/Brand';
import type { BetRow } from '../db/db';
import type { EventPublic } from '../engine/types';
import type { SlipSel } from '../store/slip';
import type { SharedPick } from './link';
import { logoFor } from '../lib/logo';
import { drawContained, logoImage } from './logos';
import { drawPrintDisc } from './portraits';

export const W = 1080;
export const H = 1920;
export const DURATION = 6; // seconds

export type StoryStatus = 'PICKS' | 'OPEN' | 'LIVE' | 'WON' | 'LOST' | 'CASHED_OUT' | 'VOID';

export interface StoryLeg {
  label: string;
  sub: string;
  odds: string;
  result: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  live?: { score: string; clock: string };
  home: { short: string; color: string; logo?: string; player?: string };
  away: { short: string; color: string; logo?: string; player?: string };
}

export interface Story {
  status: StoryStatus;
  kind: string; // "4-leg parlay"
  user: string;
  legs: StoryLeg[];
  more: number; // legs beyond the 12 we keep
  odds: string; // total odds, formatted
  stake?: string;
  ret?: string; // potential or actual return
  retLabel: string;
  link: string;
  picks: SharedPick[];
}

export interface StoryOptions {
  showAmounts: boolean;
  showUser: boolean;
}

const MAX_LEGS = 12;

function hex(c: string | undefined, fallback: string): string {
  if (!c) return fallback;
  const h = c.startsWith('#') ? c : `#${c}`;
  return /^#[0-9a-f]{6}$/i.test(h) ? h : fallback;
}

function hue(s: string): string {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 42%)`;
}

const shortOf = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || name.slice(0, 3).toUpperCase();

function legFrom(
  l: { eventId: string; label: string; marketName: string; home: string; away: string; odds: number; result?: string; sport?: string },
  ev: EventPublic | undefined,
  fmtOdds: (o: number) => string,
): StoryLeg {
  const tennis = (ev?.sport ?? l.sport) === 'tennis';
  const r = l.result === 'WON' || l.result === 'HALF_WON' ? 'WON' : l.result === 'LOST' || l.result === 'HALF_LOST' ? 'LOST' : l.result === 'VOID' ? 'VOID' : 'PENDING';
  const leg: StoryLeg = {
    label: l.label,
    sub: `${l.marketName} · ${l.home} v ${l.away}`,
    odds: fmtOdds(l.odds),
    result: r,
    home: { short: ev?.home.short?.slice(0, 3).toUpperCase() || shortOf(l.home), color: hex(ev?.home.colors?.[0], hue(l.home)), logo: ev?.home.logo ?? logoFor(l.home), player: tennis ? l.home : undefined },
    away: { short: ev?.away.short?.slice(0, 3).toUpperCase() || shortOf(l.away), color: hex(ev?.away.colors?.[0], hue(l.away)), logo: ev?.away.logo ?? logoFor(l.away), player: tennis ? l.away : undefined },
  };
  if (r === 'PENDING' && ev?.status === 'LIVE') {
    const s = ev.scoreText ?? [String(ev.score[0]), String(ev.score[1])];
    leg.live = { score: `${s[0]}–${s[1]}`, clock: ev.clock || 'Live' };
  }
  return leg;
}

function betKind(bet: { type: string; systemType?: string; legs: unknown[] }): string {
  if (bet.type === 'SINGLE') return 'Single';
  if (bet.type === 'PARLAY') return `${bet.legs.length}-leg parlay`;
  return `System ${bet.systemType ? bet.systemType[0].toUpperCase() + bet.systemType.slice(1) : ''}`.trim();
}

/** A placed bet → story. */
export function storyFromBet(
  bet: BetRow,
  events: Record<string, EventPublic>,
  fmtOdds: (o: number) => string,
  fmtMoney: (minor: bigint, code: string) => string,
  user: string,
  link: (picks: SharedPick[]) => string,
): Story {
  const legs = bet.legs.map((l) => legFrom(l, events[l.eventId], fmtOdds));
  const open = bet.status === 'OPEN' || bet.status === 'PARTIALLY_CASHED_OUT';
  const status: StoryStatus = open ? (legs.some((l) => l.live) ? 'LIVE' : 'OPEN') : bet.status === 'CASHED_OUT' ? 'CASHED_OUT' : bet.status === 'WON' ? 'WON' : bet.status === 'VOID' ? 'VOID' : 'LOST';
  const returned = BigInt(bet.returnMinor ?? '0') + (bet.status === 'CASHED_OUT' ? 0n : BigInt(bet.cashedOutMinor));
  const picks = bet.legs.map((l) => ({ eventId: l.eventId, marketKey: l.marketKey, code: l.code }));
  return {
    status,
    kind: betKind(bet),
    user,
    legs: legs.slice(0, MAX_LEGS),
    more: Math.max(0, legs.length - MAX_LEGS),
    odds: fmtOdds(bet.totalOdds),
    stake: fmtMoney(BigInt(bet.stakeMinor), bet.currency),
    ret: fmtMoney(open ? BigInt(bet.potentialReturnMinor) : returned, bet.currency),
    retLabel: open ? 'To return' : status === 'CASHED_OUT' ? 'Cashed out' : status === 'WON' ? 'Won' : 'Returned',
    link: link(picks),
    picks,
  };
}

/** Selections in the slip (not placed yet) → story of "my picks". */
export function storyFromSlip(sels: SlipSel[], events: Record<string, EventPublic>, fmtOdds: (o: number) => string, user: string, link: (picks: SharedPick[]) => string): Story {
  const legs = sels.map((s) => legFrom({ ...s, result: 'PENDING' }, events[s.eventId], fmtOdds));
  const total = sels.reduce((a, s) => a * s.odds, 1);
  const picks = sels.map((s) => ({ eventId: s.eventId, marketKey: s.marketKey, code: s.code }));
  return {
    status: legs.some((l) => l.live) ? 'LIVE' : 'PICKS',
    kind: sels.length === 1 ? 'My pick' : `${sels.length} picks`,
    user,
    legs: legs.slice(0, MAX_LEGS),
    more: Math.max(0, legs.length - MAX_LEGS),
    odds: fmtOdds(total),
    retLabel: 'Combined odds',
    link: link(picks),
    picks,
  };
}

// ───────────────────────────── assets ─────────────────────────────

export interface Assets {
  sans: string;
  mono: string;
  mark: Path2D;
  sub: Path2D;
  qr: { n: number; dark: boolean[] } | null;
  qrFor: string;
  grain: CanvasPattern | null;
}

function cssFont(v: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const f = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return f || fallback;
}

export async function loadAssets(): Promise<Assets> {
  const sans = cssFont('--font-geist-sans', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif');
  const mono = cssFont('--font-geist-mono', 'ui-monospace, SFMono-Regular, Menlo, monospace');
  try {
    await Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 48px ${sans}`)).concat([document.fonts.load(`500 48px ${mono}`)]));
  } catch {
    /* system fonts then */
  }
  let grain: CanvasPattern | null = null;
  try {
    const g = document.createElement('canvas');
    g.width = g.height = 160;
    const gx = g.getContext('2d');
    if (gx) {
      const img = gx.createImageData(160, 160);
      let s = 7;
      for (let i = 0; i < img.data.length; i += 4) {
        s = (s * 16807) % 2147483647;
        const v = s % 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 10;
      }
      gx.putImageData(img, 0, 0);
      grain = gx.createPattern(g, 'repeat');
    }
  } catch {
    grain = null;
  }
  return { sans, mono, mark: new Path2D(MARK), sub: new Path2D(SUB), qr: null, qrFor: '', grain };
}

function qrFor(assets: Assets, text: string) {
  if (assets.qrFor === text) return assets.qr;
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const dark: boolean[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark.push(q.isDark(r, c));
    assets.qr = { n, dark };
  } catch {
    assets.qr = null;
  }
  assets.qrFor = text;
  return assets.qr;
}

// ───────────────────────────── easing ─────────────────────────────

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
export const outQuint = (p: number) => 1 - Math.pow(1 - p, 5);
export const outBack = (p: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

const LIME = '#B5F23D';
const VIOLET = '#7C6CF6';
const LAVENDER = '#B9A8FF';
const RED = '#F43F5E';
const INK = '#F4F4F6';
const MUTE = 'rgba(244,244,246,0.52)';
const FAINT = 'rgba(244,244,246,0.28)';

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Ticket outline: rounded card with two half-moon notches at the tear line. */
function ticket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, tearY: number, nr: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, tearY - nr);
  ctx.arc(x + w, tearY, nr, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, tearY + nr);
  ctx.arc(x, tearY, nr, Math.PI / 2, -Math.PI / 2, true);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

/** Text with even letter spacing (canvas letterSpacing isn't everywhere yet). */
export function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'left' | 'center' | 'right' = 'left') {
  const widths = [...text].map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = prev;
}

/**
 * Slot-machine digits: every digit spins down into place, left to right.
 * Non-digits fade in. `p` runs 0 → 1.
 */
export function rolling(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, p: number, align: 'left' | 'right' | 'center') {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const lineH = size * 1.08;
  const prevAlign = ctx.textAlign;
  const prevBase = ctx.textBaseline;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const n = chars.length;
  chars.forEach((c, i) => {
    const q = outQuint(clamp((p - (i / Math.max(1, n)) * 0.35) / 0.65));
    const d = c.charCodeAt(0) - 48;
    if (d >= 0 && d <= 9) {
      const spins = 8 + i * 2;
      const pos = d + (1 - q) * spins; // counts down into the final digit
      const k = Math.floor(pos);
      const f = pos - k;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - 4, y - size * 0.92, widths[i] + 8, lineH);
      ctx.clip();
      ctx.globalAlpha *= clamp(q * 3);
      ctx.fillText(String(k % 10), cx, y - f * lineH);
      if (f > 0.001) ctx.fillText(String((k + 1) % 10), cx, y + (1 - f) * lineH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha *= q;
      ctx.fillText(c, cx, y + (1 - q) * size * 0.3);
      ctx.restore();
    }
    cx += widths[i];
  });
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBase;
}

export function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const chipFor = (leg: StoryLeg) => leg.result !== 'PENDING' || !!leg.live;

// ───────────────────────────── the frame ─────────────────────────────

const STATUS_COPY: Record<StoryStatus, { eyebrow: string; tone: string }> = {
  PICKS: { eyebrow: 'MY PICKS', tone: LAVENDER },
  OPEN: { eyebrow: 'BET PLACED', tone: LAVENDER },
  LIVE: { eyebrow: 'LIVE NOW', tone: RED },
  WON: { eyebrow: 'WINNER', tone: LIME },
  LOST: { eyebrow: 'SETTLED', tone: MUTE },
  CASHED_OUT: { eyebrow: 'CASHED OUT', tone: LIME },
  VOID: { eyebrow: 'VOID', tone: MUTE },
};

export function drawStory(ctx: CanvasRenderingContext2D, t: number, s: Story, a: Assets, o: StoryOptions): void {
  const { sans, mono } = a;
  const won = s.status === 'WON' || s.status === 'CASHED_OUT';
  const live = s.status === 'LIVE';
  const accent = won ? LIME : live ? RED : VIOLET;

  // ── background: deep ink with slow-moving light
  ctx.save();
  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, W, H);
  const orb = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const intro = outCubic(span(t, 0, 0.9));
  orb(220 + Math.sin(t * 0.6) * 60, 360 + Math.cos(t * 0.5) * 40, 900, 'rgba(124,108,246,0.55)', 0.9 * intro);
  orb(900 + Math.cos(t * 0.45) * 70, 1520 + Math.sin(t * 0.55) * 50, 820, won ? 'rgba(181,242,61,0.42)' : 'rgba(181,242,61,0.22)', intro);
  orb(980, 380 + Math.sin(t * 0.7) * 30, 520, live ? 'rgba(244,63,94,0.35)' : 'rgba(244,91,181,0.22)', intro);
  ctx.globalAlpha = 1;
  if (a.grain) {
    ctx.fillStyle = a.grain;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  // ── header: CDNX mark and the "virtual funds" tag
  const head = outCubic(span(t, 0.05, 0.75));
  ctx.save();
  ctx.globalAlpha = head;
  ctx.translate(0, (1 - head) * -24);
  const markH = 58;
  const sc = markH / 443;
  ctx.save();
  ctx.translate(90, 268);
  ctx.scale(sc, sc);
  ctx.translate(-554, -533);
  ctx.fillStyle = INK;
  ctx.fill(a.mark, 'evenodd');
  ctx.restore();
  ctx.font = `500 26px ${sans}`;
  ctx.fillStyle = FAINT;
  tracked(ctx, 'VIRTUAL FUNDS · 18+', W - 90, 310, 3, 'right');
  ctx.restore();

  // ── eyebrow + headline
  const copy = STATUS_COPY[s.status];
  const eb = outCubic(span(t, 0.35, 1.0));
  ctx.save();
  ctx.globalAlpha = eb;
  ctx.font = `600 30px ${sans}`;
  const ebY = 440;
  if (live) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.fillStyle = `rgba(244,63,94,${0.25 + 0.35 * pulse})`;
    ctx.beginPath();
    ctx.arc(103, ebY - 10, 13 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(103, ebY - 10, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = copy.tone;
  tracked(ctx, copy.eyebrow, live ? 128 : 90, ebY, 6);
  ctx.fillStyle = MUTE;
  ctx.font = `500 30px ${sans}`;
  const who = o.showUser && s.user ? `@${s.user} · ${s.kind}` : s.kind;
  ctx.textAlign = 'right';
  ctx.fillText(fit(ctx, who, 520), W - 90, ebY);
  ctx.textAlign = 'left';
  ctx.restore();

  // headline: the payout for a win, the odds otherwise
  const big = won && o.showAmounts && s.ret ? `+${s.ret}` : s.odds;
  const bigLabel = won && o.showAmounts && s.ret ? s.retLabel : s.status === 'PICKS' ? 'Combined odds' : 'Total odds';
  const hp = span(t, 0.55, 2.1);
  ctx.save();
  if (won) {
    // a bloom of light behind the number as it lands
    const burst = span(t, 1.7, 3.2);
    const g = ctx.createRadialGradient(330, 560, 0, 330, 560, 520 * (0.6 + burst * 0.6));
    g.addColorStop(0, `rgba(181,242,61,${0.32 * (1 - burst * 0.55)})`);
    g.addColorStop(1, 'rgba(181,242,61,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  let size = 196;
  ctx.font = `600 ${size}px ${won ? sans : mono}`;
  while (ctx.measureText(big).width > W - 180 && size > 90) {
    size -= 6;
    ctx.font = `600 ${size}px ${won ? sans : mono}`;
  }
  ctx.fillStyle = won ? LIME : INK;
  rolling(ctx, big, 84, 650, size, hp, 'left');
  ctx.globalAlpha = outCubic(span(t, 0.9, 1.6));
  ctx.font = `500 32px ${sans}`;
  ctx.fillStyle = MUTE;
  ctx.fillText(bigLabel, 92, 708);
  ctx.restore();

  // ── the ticket: as many rows as fit above the QR band, the rest summarised
  const cardX = 72;
  const cardW = W - 144;
  const cardY = 760;
  const LIMIT = 1356;
  const footH = o.showAmounts && s.stake ? 150 : 110;
  const fixed = 36 + 52 + footH;
  let shown = Math.min(s.legs.length, 4);
  let hidden = s.legs.length - shown + s.more;
  let rowH = 150;
  for (;;) {
    const moreH = hidden ? 56 : 0;
    rowH = Math.min(150, (LIMIT - cardY - fixed - moreH) / shown);
    if (rowH >= 100 || shown === 1) break;
    shown--;
    hidden++;
  }
  const legs = s.legs.slice(0, shown);
  const f = clamp(rowH / 150, 0.72, 1);
  const listH = legs.length * rowH + (hidden ? 56 : 0);
  const tearY = cardY + 36 + listH + 26;
  const cardH = 36 + listH + 52 + footH;
  const rise = outBack(span(t, 0.45, 1.35));
  const cardAlpha = outCubic(span(t, 0.45, 1.0));
  ctx.save();
  ctx.globalAlpha = cardAlpha;
  ctx.translate(0, (1 - rise) * 260);
  const cx0 = cardX + cardW / 2;
  const cy0 = cardY + cardH / 2;
  const tilt = (1 - rise) * 0.06;
  ctx.translate(cx0, cy0);
  ctx.transform(1, tilt * 0.4, 0, 1, 0, 0);
  ctx.scale(0.94 + 0.06 * rise, 0.94 + 0.06 * rise);
  ctx.translate(-cx0, -cy0);

  // drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 40;
  ticket(ctx, cardX, cardY, cardW, cardH, 56, tearY, 26);
  ctx.fillStyle = 'rgba(22,22,27,0.92)';
  ctx.fill();
  ctx.restore();

  // glass body
  ticket(ctx, cardX, cardY, cardW, cardH, 56, tearY, 26);
  const body = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
  body.addColorStop(0, 'rgba(255,255,255,0.09)');
  body.addColorStop(0.35, 'rgba(255,255,255,0.035)');
  body.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = body;
  ctx.fill();

  // living border: a slow ring of brand colour travelling round the edge
  ctx.save();
  ticket(ctx, cardX, cardY, cardW, cardH, 56, tearY, 26);
  ctx.lineWidth = 2.5;
  const ang = t * 0.9;
  const ctxConic = ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
  if (ctxConic.createConicGradient) {
    const cg = ctxConic.createConicGradient(ang, cx0, cy0);
    cg.addColorStop(0, 'rgba(255,255,255,0.10)');
    cg.addColorStop(0.18, won ? 'rgba(181,242,61,0.85)' : 'rgba(185,168,255,0.85)');
    cg.addColorStop(0.32, 'rgba(255,255,255,0.10)');
    cg.addColorStop(0.62, 'rgba(255,255,255,0.06)');
    cg.addColorStop(0.78, won ? 'rgba(124,108,246,0.6)' : 'rgba(181,242,61,0.55)');
    cg.addColorStop(0.92, 'rgba(255,255,255,0.08)');
    cg.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.strokeStyle = cg;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  }
  ctx.stroke();
  ctx.restore();

  // rows
  const rowX = cardX + 48;
  const rowW = cardW - 96;
  legs.forEach((leg, i) => {
    const y = cardY + 36 + i * rowH;
    const lp = outCubic(span(t, 0.85 + i * 0.13, 1.45 + i * 0.13));
    ctx.save();
    ctx.globalAlpha *= lp;
    ctx.translate((1 - lp) * 80, 0);
    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(rowX, y, rowW, 2);
    }
    // crests: the clubs' logos on glass discs, or two discs in the team colours
    const cy = y + rowH / 2;
    const disc = (x: number, team: StoryLeg['home']) => {
      const R = 27 * f;
      ctx.beginPath();
      ctx.arc(x, cy, R + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#16161B';
      ctx.fill();
      if (drawPrintDisc(ctx, team.player, x, cy, R)) return;
      const img = logoImage(team.logo);
      if (img) {
        ctx.beginPath();
        ctx.arc(x, cy, R, 0, Math.PI * 2);
        const bg = ctx.createRadialGradient(x, cy - R * 0.4, 0, x, cy, R);
        bg.addColorStop(0, 'rgba(255,255,255,0.20)');
        bg.addColorStop(1, 'rgba(255,255,255,0.07)');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.save();
        ctx.shadowColor = 'rgba(255,255,255,0.35)';
        ctx.shadowBlur = 3;
        drawContained(ctx, img, x, cy, R * 1.45);
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.arc(x, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = team.color;
      ctx.fill();
      const hl = ctx.createLinearGradient(0, cy - R, 0, cy + R);
      hl.addColorStop(0, 'rgba(255,255,255,0.28)');
      hl.addColorStop(0.6, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `700 ${Math.round((team.short.length > 2 ? 17 : 20) * f)}px ${sans}`;
      ctx.textAlign = 'center';
      ctx.fillText(team.short, x, cy + 7 * f);
      ctx.textAlign = 'left';
    };
    disc(rowX + 31 * f, leg.home);
    disc(rowX + 84 * f, leg.away);

    // right side: odds, and the leg's state
    ctx.font = `500 ${Math.round(44 * f)}px ${mono}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(leg.odds, rowX + rowW, cy - (chipFor(leg) ? 14 * f : -14 * f));
    const oddsW = ctx.measureText(leg.odds).width;
    ctx.textAlign = 'left';
    let chip = '';
    let chipBg = '';
    let chipFg = '';
    if (leg.result === 'WON') [chip, chipBg, chipFg] = ['WON', 'rgba(181,242,61,0.18)', LIME];
    else if (leg.result === 'LOST') [chip, chipBg, chipFg] = ['LOST', 'rgba(244,63,94,0.14)', RED];
    else if (leg.result === 'VOID') [chip, chipBg, chipFg] = ['VOID', 'rgba(255,255,255,0.08)', MUTE];
    else if (leg.live) [chip, chipBg, chipFg] = [`${leg.live.score}  ${leg.live.clock}`, 'rgba(244,63,94,0.14)', '#FF8FA3'];
    if (chip) {
      const cf = Math.max(f, 0.92);
      ctx.font = `600 ${Math.round(24 * cf)}px ${leg.live ? mono : sans}`;
      const cw = ctx.measureText(chip).width + 36 + (leg.live ? 18 : 0);
      const chx = rowX + rowW - cw;
      const chy = cy + 8 * f;
      rr(ctx, chx, chy, cw, 42 * cf, 21 * cf);
      ctx.fillStyle = chipBg;
      ctx.fill();
      if (leg.live) {
        const pulse = 0.55 + 0.45 * Math.sin(t * 6 + i);
        ctx.fillStyle = `rgba(244,63,94,${pulse})`;
        ctx.beginPath();
        ctx.arc(chx + 22, chy + 21 * cf, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = chipFg;
      ctx.fillText(chip, chx + 18 + (leg.live ? 18 : 0), chy + 30 * cf);
    }

    const tx = rowX + 140 * f;
    const chipW = chip ? ctx.measureText(chip).width + 60 : 0;
    ctx.font = `600 ${Math.round(40 * f)}px ${sans}`;
    ctx.fillStyle = leg.result === 'LOST' ? MUTE : INK;
    ctx.fillText(fit(ctx, leg.label, rowW - 140 * f - oddsW - 32), tx, cy - 6 * f);
    ctx.font = `400 ${Math.round(27 * f)}px ${sans}`;
    ctx.fillStyle = MUTE;
    ctx.fillText(fit(ctx, leg.sub, rowW - 140 * f - Math.max(oddsW, chipW) - 32), tx, cy + 36 * f);
    ctx.restore();
  });
  if (hidden) {
    const y = cardY + 36 + legs.length * rowH;
    ctx.save();
    ctx.globalAlpha *= outCubic(span(t, 1.5, 2.0));
    ctx.font = `500 30px ${sans}`;
    ctx.fillStyle = MUTE;
    ctx.fillText(`+ ${hidden} more leg${hidden > 1 ? 's' : ''}`, rowX + 140 * f, y + 40);
    ctx.restore();
  }

  // perforation
  ctx.save();
  ctx.setLineDash([3, 14]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(cardX + 46, tearY);
  ctx.lineTo(cardX + cardW - 46, tearY);
  ctx.stroke();
  ctx.restore();

  // footer: stake → return, or the odds line for picks
  const fy = tearY + 30;
  const fp = span(t, 1.35, 2.6);
  ctx.save();
  ctx.globalAlpha *= outCubic(span(t, 1.2, 1.7));
  if (o.showAmounts && s.stake) {
    ctx.font = `500 28px ${sans}`;
    ctx.fillStyle = MUTE;
    ctx.fillText('Stake', rowX, fy + 30);
    ctx.textAlign = 'right';
    ctx.fillText(s.retLabel, rowX + rowW, fy + 30);
    ctx.textAlign = 'left';
    ctx.font = `600 54px ${sans}`;
    ctx.fillStyle = INK;
    rolling(ctx, s.stake, rowX, fy + 96, 54, fp, 'left');
    ctx.fillStyle = won ? LIME : INK;
    rolling(ctx, s.ret ?? '', rowX + rowW, fy + 96, 54, fp, 'right');
    // arrow between them
    const ax = cardX + cardW / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax - 26, fy + 78);
    ctx.lineTo(ax + 22, fy + 78);
    ctx.moveTo(ax + 8, fy + 64);
    ctx.lineTo(ax + 22, fy + 78);
    ctx.lineTo(ax + 8, fy + 92);
    ctx.stroke();
  } else {
    ctx.font = `500 30px ${sans}`;
    ctx.fillStyle = MUTE;
    ctx.fillText(s.status === 'PICKS' || !s.stake ? `${s.picks.length} selection${s.picks.length > 1 ? 's' : ''}` : s.kind, rowX, fy + 44);
    ctx.textAlign = 'right';
    ctx.font = `600 44px ${mono}`;
    ctx.fillStyle = INK;
    ctx.fillText(s.odds, rowX + rowW, fy + 48);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // a sheen of light sweeping across the ticket, twice
  const sweep = (start: number) => {
    const p = span(t, start, start + 0.9);
    if (p <= 0 || p >= 1) return;
    ctx.save();
    ticket(ctx, cardX, cardY, cardW, cardH, 56, tearY, 26);
    ctx.clip();
    const sx = cardX - 400 + p * (cardW + 800);
    const g = ctx.createLinearGradient(sx - 220, cardY, sx + 220, cardY + 260);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.13 * Math.sin(p * Math.PI)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.restore();
  };
  sweep(2.2);
  sweep(4.4);
  ctx.restore(); // end card transform

  // ── confetti for winners
  if (won) {
    const r = rand(42);
    const colors = [LIME, '#FFFFFF', LAVENDER, VIOLET];
    for (let i = 0; i < 90; i++) {
      const delay = 1.85 + r() * 0.5;
      const life = t - delay;
      if (life <= 0) { r(); r(); r(); r(); r(); continue; }
      const x0 = W * (0.15 + r() * 0.7);
      const vx = (r() - 0.5) * 900;
      const vy = -900 - r() * 900;
      const spin = (r() - 0.5) * 12;
      const sz = 10 + r() * 14;
      const x = x0 + vx * life;
      const y = 700 + vy * life + 1500 * life * life;
      if (y > H + 40) continue;
      ctx.save();
      ctx.globalAlpha = clamp(1.6 - life * 0.45);
      ctx.translate(x, y);
      ctx.rotate(spin * life);
      ctx.scale(1, Math.cos(life * 9 + i));
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2);
      ctx.restore();
    }
  }

  // ── QR + call to action (kept inside the safe area)
  const qp = outCubic(span(t, 1.9, 2.6));
  const qrY = Math.min(cardY + cardH + 64, 1404);
  ctx.save();
  ctx.globalAlpha = qp;
  ctx.translate(0, (1 - qp) * 30);
  const q = qrFor(a, s.link);
  const qs = 216;
  const qx = 90;
  rr(ctx, qx, qrY, qs, qs, 34);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  if (q) {
    const pad = 20;
    const cell = (qs - pad * 2) / q.n;
    ctx.fillStyle = '#0A0A0C';
    const finder = (r0: number, c0: number) => r0 <= 6 && c0 <= 6;
    const isFinder = (r: number, c: number) => finder(r, c) || finder(r, c - (q.n - 7)) || finder(r - (q.n - 7), c);
    for (let r = 0; r < q.n; r++) {
      for (let c = 0; c < q.n; c++) {
        if (!q.dark[r * q.n + c] || isFinder(r, c)) continue;
        rr(ctx, qx + pad + c * cell + cell * 0.08, qrY + pad + r * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.3);
        ctx.fill();
      }
    }
    // the three corner eyes, drawn as soft squares
    for (const [r0, c0] of [[0, 0], [0, q.n - 7], [q.n - 7, 0]]) {
      const ex = qx + pad + c0 * cell;
      const ey = qrY + pad + r0 * cell;
      rr(ctx, ex, ey, cell * 7, cell * 7, cell * 2);
      ctx.fillStyle = '#0A0A0C';
      ctx.fill();
      rr(ctx, ex + cell, ey + cell, cell * 5, cell * 5, cell * 1.5);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      rr(ctx, ex + cell * 2, ey + cell * 2, cell * 3, cell * 3, cell);
      ctx.fillStyle = '#0A0A0C';
      ctx.fill();
    }
  }
  const tx = qx + qs + 44;
  ctx.font = `600 46px ${sans}`;
  ctx.fillStyle = INK;
  ctx.fillText('Copy this bet', tx, qrY + 84);
  ctx.font = `400 30px ${sans}`;
  ctx.fillStyle = MUTE;
  ctx.fillText('Scan, or tap the link', tx, qrY + 132);
  ctx.font = `500 30px ${mono}`;
  ctx.fillStyle = accent === RED ? '#FF8FA3' : won ? LIME : LAVENDER;
  ctx.fillText(new URL(s.link).host, tx, qrY + 180);
  ctx.restore();

  // ── signature
  ctx.save();
  ctx.globalAlpha = outCubic(span(t, 2.2, 2.9)) * 0.9;
  const lockH = 34;
  const ls = lockH / 602;
  const lockW = 1645 * ls;
  ctx.translate(W / 2 - lockW / 2, 1700);
  ctx.scale(ls, ls);
  ctx.translate(-554, -533);
  ctx.fillStyle = 'rgba(244,244,246,0.38)';
  ctx.fill(a.mark, 'evenodd');
  ctx.fill(a.sub, 'evenodd');
  ctx.restore();
}
