/**
 * Match stories: a 6-second 1080×1920 animation of a fixture, for Instagram Stories and
 * WhatsApp Status. Three looks from the same canvas:
 *   PRE  – a matchday poster: crests slam in, a lightning "VS", kick-off time and prices.
 *   LIVE – a stadium scoreboard: dot-matrix score lighting up, running clock, scorers,
 *          the momentum wave and live prices.
 *   FT   – the result: the winner lit up, final score and who scored.
 * The background is split diagonally in the two teams' colours.
 */
import qrcode from 'qrcode-generator';
import { GLYPHS } from '../components/glyphs';
import type { EventPublic } from '../engine/types';
import { Assets, clamp, H, outBack, outCubic, rand, rr, span, tracked, W } from './story';

export type MatchPhase = 'PRE' | 'LIVE' | 'FT';

export interface MatchSide { name: string; short: string; color: string; ink: string }
export interface MatchStory {
  phase: MatchPhase;
  shield: boolean;
  league: string;
  venue: string;
  date: string; // "Sat 25 Oct"
  time: string; // "20:30"
  countdown: string | null; // "in 2h 14m"
  home: MatchSide;
  away: MatchSide;
  score: [string, string] | null;
  clock: string;
  scorers: { side: 0 | 1; who: string; clock: string; red?: boolean }[];
  momentum: number[];
  stats: { label: string; home: string; away: string; share: number }[];
  odds: { label: string; odds: string }[];
  winner: 0 | 1 | null;
  link: string;
  key: string;
}

const hex = (c: string | undefined, fb: string) => {
  if (!c) return fb;
  const h = c.startsWith('#') ? c : `#${c}`;
  return /^#[0-9a-f]{6}$/i.test(h) ? h : fb;
};
function lum(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkFor = (bg: string) => (lum(bg) > 0.45 ? '#0B0B0D' : '#FFFFFF');

function monogram(name: string, short: string, sport: string): string {
  if (sport === 'tennis') {
    const parts = name.split(' ');
    return (parts[0][0] + (parts[parts.length - 1][0] ?? '')).toUpperCase();
  }
  const s = (short || name).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return s.slice(0, 3);
}

function countdown(ms: number): string | null {
  if (ms <= 0) return null;
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `in ${d} day${d > 1 ? 's' : ''}`;
}

export function matchStoryFrom(ev: EventPublic, fmtOdds: (o: number) => string, link: string, now = Date.now()): MatchStory {
  const phase: MatchPhase = ev.status === 'FINISHED' ? 'FT' : ev.status === 'LIVE' || ev.status === 'SUSPENDED' ? 'LIVE' : 'PRE';
  const hc = hex(ev.home.colors?.[0], '#7C6CF6');
  const ac = hex(ev.away.colors?.[0], '#F45BB5');
  const main = ev.markets.find((m) => ['1x2', 'mw', 'ml', 'match'].includes(m.key)) ?? [...ev.markets].sort((a, b) => a.order - b.order)[0];
  const odds = phase === 'FT' || !main ? [] : main.selections.slice(0, 3).map((s) => ({
    label: s.code === 'X' ? 'Draw' : s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label,
    odds: fmtOdds(s.odds),
  }));
  const scorers = ev.incidents
    .filter((i) => (i.kind === 'goal' || i.kind === 'red') && i.side !== undefined)
    .map((i) => ({ side: i.side as 0 | 1, clock: i.clock, red: i.kind === 'red', who: (i.text.split(/\s[—-]\s/)[1] ?? i.text).replace(/\s*\(.*\)$/, '').slice(0, 20) }))
    .slice(-8);
  const d = new Date(ev.startTime);
  const score = phase === 'PRE' ? null : ((ev.scoreText ?? [String(ev.score[0]), String(ev.score[1])]) as [string, string]);
  const winner = phase === 'FT' ? (ev.result?.winner ?? (ev.score[0] > ev.score[1] ? 0 : ev.score[1] > ev.score[0] ? 1 : null)) : null;
  return {
    phase,
    shield: ev.sport === 'football' || ev.sport === 'cricket',
    league: ev.leagueName,
    venue: ev.venue,
    date: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    countdown: phase === 'PRE' ? countdown(ev.startTime - now) : null,
    home: { name: ev.home.name, short: monogram(ev.home.name, ev.home.short, ev.sport), color: hc, ink: inkFor(hc) },
    away: { name: ev.away.name, short: monogram(ev.away.name, ev.away.short, ev.sport), color: ac, ink: inkFor(ac) },
    score,
    clock: phase === 'FT' ? 'FULL TIME' : ev.clock || ev.period || 'LIVE',
    scorers,
    momentum: ev.momentumHistory.slice(-60),
    stats: ev.stats
      .filter((r) => r.home + r.away > 0)
      .slice(0, 3)
      .map((r) => {
        const f = (v: number) => (r.fmt === 'pct' ? `${Math.round(v <= 1 ? v * 100 : v)}%` : r.fmt === 'dec1' ? v.toFixed(1) : r.fmt === 'dec2' ? v.toFixed(2) : String(Math.round(v)));
        return { label: r.label, home: f(r.home), away: f(r.away), share: r.home / (r.home + r.away) };
      }),
    odds,
    winner,
    link,
    key: `${phase}|${score?.join('-')}|${ev.clock}|${odds.map((o) => o.odds).join(',')}`,
  };
}

// ───────────── drawing ─────────────

const INK = '#F4F4F6';
const MUTE = 'rgba(244,244,246,0.6)';
const LIME = '#B5F23D';
const RED = '#F43F5E';

function shieldPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.86, cy - r * 0.82);
  ctx.quadraticCurveTo(cx, cy - r * 1.02, cx + r * 0.86, cy - r * 0.82);
  ctx.lineTo(cx + r * 0.86, cy + r * 0.05);
  ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 0.72, cx, cy + r * 1.02);
  ctx.quadraticCurveTo(cx - r * 0.8, cy + r * 0.72, cx - r * 0.86, cy + r * 0.05);
  ctx.closePath();
}

function crest(ctx: CanvasRenderingContext2D, a: Assets, side: MatchSide, cx: number, cy: number, r: number, shield: boolean, glow: number) {
  // halo
  if (glow > 0) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.2);
    g.addColorStop(0, side.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.55 * glow;
    ctx.fillStyle = g;
    ctx.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  if (shield) shieldPath(ctx, cx, cy, r);
  else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
  ctx.fillStyle = side.color;
  ctx.fill();
  ctx.restore();
  // inner rim + gloss
  if (shield) shieldPath(ctx, cx, cy, r);
  else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
  ctx.save();
  ctx.clip();
  const gl = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  gl.addColorStop(0, 'rgba(255,255,255,0.38)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  gl.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = gl;
  ctx.fillRect(cx - r, cy - r * 1.1, r * 2, r * 2.2);
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  if (shield) shieldPath(ctx, cx, cy, r * 0.9);
  else { ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); }
  ctx.stroke();
  ctx.fillStyle = side.ink;
  ctx.font = `800 ${Math.round(r * (side.short.length > 2 ? 0.52 : 0.66))}px ${a.sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(side.short, cx, cy + (shield ? r * 0.02 : r * 0.04));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** Dot-matrix text; dots light up left to right as `p` goes 0 → 1. */
function matrix(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, dot: number, p: number, color: string, glowColor: string) {
  const pitch = dot * 1.5;
  const glyphs = [...text].map((ch) => GLYPHS[ch] ?? GLYPHS[' ']);
  const widths = glyphs.map((g) => g[0].length * pitch);
  const gap = pitch * 1.4;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (glyphs.length - 1);
  let x = cx - total / 2;
  const cols = glyphs.reduce((a, g) => a + g[0].length, 0);
  let col = 0;
  for (const g of glyphs) {
    for (let c = 0; c < g[0].length; c++, col++) {
      const lit = clamp((p * (cols + 6) - col) / 6);
      for (let r = 0; r < g.length; r++) {
        const on = g[r][c] === '1';
        const px = x + c * pitch + pitch / 2;
        const py = top + r * pitch + pitch / 2;
        ctx.beginPath();
        ctx.arc(px, py, dot / 2, 0, Math.PI * 2);
        if (on && lit > 0) {
          ctx.fillStyle = color;
          ctx.globalAlpha = lit;
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = dot * 1.6 * lit;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fill();
        }
      }
    }
    x += g[0].length * pitch + gap;
  }
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, start: number, min: number, max: number, family: string): number {
  let s = start;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > max && s > min) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

export function drawMatchStory(ctx: CanvasRenderingContext2D, t: number, m: MatchStory, a: Assets): void {
  const { sans, mono } = a;
  const live = m.phase === 'LIVE';
  const ft = m.phase === 'FT';

  // ── background: the two clubs, split on a diagonal, sinking into ink
  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, W, H);
  const reveal = outCubic(span(t, 0, 0.9));
  const sweepOff = (1 - reveal) * 900;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-sweepOff, 0);
  ctx.lineTo(W + 260 - sweepOff, 0);
  ctx.lineTo(-sweepOff - 260, H * 0.62);
  ctx.closePath();
  const hg = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.5);
  hg.addColorStop(0, m.home.color);
  hg.addColorStop(1, 'rgba(10,10,12,0)');
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W + sweepOff, H);
  ctx.lineTo(-260 + sweepOff, H);
  ctx.lineTo(W + 260 + sweepOff, H * 0.38);
  ctx.closePath();
  const ag = ctx.createLinearGradient(W, H, W * 0.4, H * 0.5);
  ag.addColorStop(0, m.away.color);
  ag.addColorStop(1, 'rgba(10,10,12,0)');
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.restore();
  // soft vignette to keep text readable
  const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.15, W / 2, H * 0.5, H * 0.75);
  vg.addColorStop(0, 'rgba(10,10,12,0.15)');
  vg.addColorStop(1, 'rgba(10,10,12,0.75)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // the diagonal seam: a bright line that travels along the split
  ctx.save();
  const seam = (t * 0.35) % 1;
  const sx = W * (1.15 - seam * 1.3);
  const sy = H * (0.36 + seam * 0.3);
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 380);
  sg.addColorStop(0, 'rgba(255,255,255,0.22)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = sg;
  ctx.fillRect(sx - 400, sy - 400, 800, 800);
  ctx.restore();
  if (a.grain) {
    ctx.fillStyle = a.grain;
    ctx.fillRect(0, 0, W, H);
  }

  // ── header: mark, league and the phase pill
  ctx.save();
  ctx.globalAlpha = outCubic(span(t, 0.1, 0.7));
  const sc = 50 / 443;
  ctx.save();
  ctx.translate(90, 262);
  ctx.scale(sc, sc);
  ctx.translate(-554, -533);
  ctx.fillStyle = INK;
  ctx.fill(a.mark, 'evenodd');
  ctx.restore();
  const pill = live ? 'LIVE' : ft ? 'FULL TIME' : 'MATCHDAY';
  ctx.font = `700 26px ${sans}`;
  const pw = ctx.measureText(pill).width + 34 + (live ? 30 : 0) + (pill.length - 1) * 4;
  const px = W - 90 - pw;
  rr(ctx, px, 256, pw, 54, 27);
  ctx.fillStyle = live ? 'rgba(244,63,94,0.22)' : ft ? 'rgba(255,255,255,0.14)' : 'rgba(181,242,61,0.2)';
  ctx.fill();
  if (live) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.fillStyle = `rgba(244,63,94,${0.35 + 0.5 * pulse})`;
    ctx.beginPath();
    ctx.arc(px + 30, 283, 9 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = live ? '#FF8FA3' : ft ? INK : LIME;
  tracked(ctx, pill, px + 17 + (live ? 30 : 0), 293, 4);
  ctx.font = `500 30px ${sans}`;
  ctx.fillStyle = MUTE;
  ctx.fillText(m.league, 90, 372);
  ctx.restore();

  // ── layout: a poster before kick-off, a scoreboard once it starts
  const pre = m.phase === 'PRE';
  const cy = pre ? 600 : 515;
  const r = pre ? 150 : 104;
  const cx0 = pre ? 250 : 220;

  // crests slam in from each side
  const hp = span(t, 0.25, 1.05);
  const apx = span(t, 0.38, 1.18);
  const hx = cx0 - (1 - outBack(hp)) * 420;
  const ax = W - cx0 + (1 - outBack(apx)) * 420;
  const wonGlow = (side: 0 | 1) => (ft ? (m.winner === side ? 1 : m.winner === null ? 0.5 : 0.12) : 0.7) * outCubic(span(t, 1.0, 1.8));
  ctx.save();
  ctx.globalAlpha = clamp(hp * 2) * (ft && m.winner === 1 ? 0.55 : 1);
  crest(ctx, a, m.home, hx, cy, r, m.shield, wonGlow(0));
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = clamp(apx * 2) * (ft && m.winner === 0 ? 0.55 : 1);
  crest(ctx, a, m.away, ax, cy, r, m.shield, wonGlow(1));
  ctx.restore();

  // team names under the crests
  ctx.save();
  ctx.globalAlpha = outCubic(span(t, 0.8, 1.4));
  ctx.textAlign = 'center';
  for (const [side, x, i] of [[m.home, cx0, 0], [m.away, W - cx0, 1]] as const) {
    fitFont(ctx, side.name, 700, pre ? 46 : 40, 26, pre ? 400 : 380, sans);
    ctx.fillStyle = ft && m.winner !== null && m.winner !== i ? MUTE : INK;
    ctx.fillText(side.name, x, cy + r + (pre ? 82 : 66));
  }
  ctx.textAlign = 'left';
  ctx.restore();

  if (pre) {
    // lightning VS
    const vp = span(t, 1.0, 1.4);
    const flash = Math.max(0, 1 - Math.abs(t - 1.15) * 6);
    if (flash > 0) {
      const fg = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, 900);
      fg.addColorStop(0, `rgba(214,255,140,${flash * 0.32})`);
      fg.addColorStop(1, 'rgba(214,255,140,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    ctx.globalAlpha = outCubic(vp);
    ctx.translate(W / 2, cy + 10);
    const s = 1 + (1 - outBack(vp)) * 0.8;
    ctx.scale(s, s);
    ctx.font = `900 104px ${sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = LIME;
    ctx.shadowBlur = 40 + flash * 80;
    ctx.fillStyle = flash > 0.3 ? '#FFFFFF' : LIME;
    ctx.fillText('VS', 0, 0);
    ctx.restore();
    // kick-off
    const kp = span(t, 1.3, 2.0);
    ctx.save();
    ctx.globalAlpha = outCubic(kp);
    ctx.translate(0, (1 - outCubic(kp)) * 40);
    ctx.textAlign = 'center';
    ctx.font = `500 32px ${sans}`;
    ctx.fillStyle = MUTE;
    const where = `${m.date}${m.venue ? ` · ${m.venue}` : ''}`;
    fitFont(ctx, where, 500, 32, 24, W - 180, sans);
    ctx.fillText(where, W / 2, 1000);
    // the time, with any AM/PM set small beside it
    const [, hhmm, ampm] = /^([\d:.]+)\s*(.*)$/.exec(m.time) ?? [m.time, m.time, ''];
    ctx.font = `600 184px ${mono}`;
    const tw = ctx.measureText(hhmm).width;
    ctx.font = `600 56px ${sans}`;
    const sw = ampm ? ctx.measureText(ampm).width + 18 : 0;
    const tx = W / 2 - (tw + sw) / 2;
    ctx.textAlign = 'left';
    ctx.font = `600 184px ${mono}`;
    ctx.fillStyle = INK;
    ctx.fillText(hhmm, tx, 1178);
    if (ampm) {
      ctx.font = `600 56px ${sans}`;
      ctx.fillStyle = MUTE;
      ctx.fillText(ampm, tx + tw + 18, 1178);
    }
    if (m.countdown) {
      ctx.textAlign = 'center';
      ctx.font = `600 34px ${sans}`;
      const label = `Kick-off ${m.countdown}`;
      const cw = ctx.measureText(label).width + 56;
      rr(ctx, W / 2 - cw / 2, 1214, cw, 66, 33);
      ctx.fillStyle = 'rgba(181,242,61,0.18)';
      ctx.fill();
      ctx.fillStyle = LIME;
      ctx.fillText(label, W / 2, 1258);
    }
    ctx.restore();
  } else {
    // clock between the crests
    const cp = outBack(span(t, 0.9, 1.4));
    ctx.save();
    ctx.globalAlpha = clamp(cp);
    ctx.translate(W / 2, cy);
    ctx.scale(cp, cp);
    ctx.font = `700 34px ${mono}`;
    const clk = ft ? 'FT' : m.clock;
    const cw = Math.max(110, ctx.measureText(clk).width + 56 + (live ? 26 : 0));
    rr(ctx, -cw / 2, -34, cw, 68, 34);
    ctx.fillStyle = live ? 'rgba(244,63,94,0.24)' : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = live ? 'rgba(244,63,94,0.45)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (live) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.fillStyle = `rgba(255,143,163,${0.5 + 0.5 * pulse})`;
      ctx.beginPath();
      ctx.arc(-cw / 2 + 30, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = live ? '#FF8FA3' : INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(clk, live ? 13 : 0, 2);
    ctx.restore();

    // the scoreboard: a dark glass panel with the score in lit dots
    const py = 760;
    const ph = 300;
    const bp = outCubic(span(t, 0.7, 1.3));
    ctx.save();
    ctx.globalAlpha = bp;
    ctx.translate(0, (1 - bp) * 50);
    rr(ctx, 90, py, W - 180, ph, 52);
    ctx.fillStyle = 'rgba(6,6,8,0.62)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // team-colour edges
    ctx.save();
    rr(ctx, 90, py, W - 180, ph, 52);
    ctx.clip();
    const eg = ctx.createLinearGradient(90, 0, W - 90, 0);
    eg.addColorStop(0, m.home.color);
    eg.addColorStop(0.18, 'rgba(0,0,0,0)');
    eg.addColorStop(0.82, 'rgba(0,0,0,0)');
    eg.addColorStop(1, m.away.color);
    ctx.globalAlpha = 0.35 * bp;
    ctx.fillStyle = eg;
    ctx.fillRect(90, py, W - 180, ph);
    ctx.restore();
    const score = `${m.score![0]}–${m.score![1]}`;
    const chars = [...score];
    const cols = chars.reduce((s, ch) => s + (GLYPHS[ch] ?? GLYPHS[' '])[0].length, 0);
    const dot = Math.min(21, (W - 180 - 110) / ((cols + 1.4 * (chars.length - 1)) * 1.5));
    const top = py + (ph - 7 * dot * 1.5) / 2;
    matrix(ctx, score, W / 2, top, dot, span(t, 1.05, 2.0), INK, live ? 'rgba(255,255,255,0.9)' : LIME);
    ctx.restore();

    // scorers, home on the left and away on the right
    const per = live ? 2 : 3;
    const left = m.scorers.filter((s) => s.side === 0).slice(-per);
    const right = m.scorers.filter((s) => s.side === 1).slice(-per);
    const sy = 1140;
    const drawList = (list: MatchStory['scorers'], x: number, align: 'left' | 'right', d0: number) => {
      list.forEach((s, i) => {
        const p = span(t, d0 + i * 0.12, d0 + 0.5 + i * 0.12);
        ctx.save();
        ctx.globalAlpha = outCubic(p);
        ctx.translate((align === 'left' ? -1 : 1) * (1 - outCubic(p)) * 40, 0);
        const y = sy + i * 54;
        const iconX = align === 'left' ? x : x - 24;
        if (s.red) {
          ctx.fillStyle = RED;
          rr(ctx, iconX + 2, y - 28, 20, 28, 4);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(iconX + 12, y - 11, 12, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(iconX + 12, y - 11, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#0A0A0C';
          ctx.fill();
        }
        ctx.font = `500 28px ${mono}`;
        const clw = ctx.measureText(s.clock).width;
        let name = s.who;
        ctx.font = `600 31px ${sans}`;
        while (ctx.measureText(name).width > 330 - clw && name.length > 4) name = name.slice(0, -2) + '…';
        ctx.textAlign = align;
        ctx.fillStyle = INK;
        const tx = align === 'left' ? x + 38 : x - 38;
        ctx.fillText(name, tx, y);
        const lw = ctx.measureText(name).width;
        ctx.font = `500 28px ${mono}`;
        ctx.fillStyle = MUTE;
        ctx.fillText(s.clock, align === 'left' ? tx + lw + 12 : tx - lw - 12, y);
        ctx.restore();
      });
    };
    drawList(left, 90, 'left', 1.8);
    drawList(right, W - 90, 'right', 1.9);

    // no scorers to show (basketball, tennis, a goalless game)
    // (or room left under them) fill the space with head-to-head stat bars
    const rows = Math.max(left.length, right.length);
    const wave = live && m.momentum.length > 4;
    const y0 = rows ? sy + rows * 54 + 34 : 1112;
    const room = Math.max(0, Math.floor(((wave ? 1250 : ft ? 1330 : 1370) - y0) / 74) + 1);
    if (m.stats.length && room > 0) {
      m.stats.slice(0, Math.min(room, 3)).forEach((st, i) => {
        const p = span(t, 1.8 + i * 0.15, 2.5 + i * 0.15);
        const y = y0 + i * 74;
        ctx.save();
        ctx.globalAlpha = outCubic(span(t, 1.7 + i * 0.15, 2.1 + i * 0.15));
        ctx.font = `600 30px ${mono}`;
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.fillText(st.home, 90, y + 4);
        ctx.textAlign = 'right';
        ctx.fillText(st.away, W - 90, y + 4);
        ctx.textAlign = 'center';
        ctx.font = `500 25px ${sans}`;
        ctx.fillStyle = MUTE;
        ctx.fillText(st.label, W / 2, y + 2);
        const bx = 90;
        const bw = W - 180;
        const by = y + 22;
        rr(ctx, bx, by, bw, 10, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
        const grow = outCubic(p);
        const hw = (bw / 2) * Math.min(1, st.share * 2) * grow;
        const aw = (bw / 2) * Math.min(1, (1 - st.share) * 2) * grow;
        ctx.fillStyle = m.home.color;
        rr(ctx, W / 2 - hw, by, hw, 10, 5);
        ctx.fill();
        ctx.fillStyle = m.away.color;
        rr(ctx, W / 2, by, aw, 10, 5);
        ctx.fill();
        ctx.restore();
      });
    }

    // momentum wave (live only): who has been on top, drawn left to right
    if (live && m.momentum.length > 4) {
      const mp = span(t, 2.0, 3.2);
      const top = 1290;
      const mh = 72;
      const n = m.momentum.length;
      const upto = Math.max(2, Math.floor(n * outCubic(mp)));
      const mid = top + mh / 2;
      ctx.save();
      ctx.globalAlpha = outCubic(span(t, 1.9, 2.3));
      ctx.font = `500 24px ${sans}`;
      ctx.fillStyle = MUTE;
      ctx.fillText('MOMENTUM', 90, top - 12);
      const pts = m.momentum.slice(0, upto).map((v, i) => [90 + (i / (n - 1)) * (W - 180), mid - clamp(v, -1, 1) * (mh / 2)] as const);
      for (const [side, color] of [[0, m.home.color], [1, m.away.color]] as const) {
        ctx.beginPath();
        ctx.moveTo(90, mid);
        for (const [x, y] of pts) ctx.lineTo(x, side === 0 ? Math.min(y, mid) : Math.max(y, mid));
        ctx.lineTo(pts[pts.length - 1][0], mid);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
      const [lx, ly] = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(lx, ly, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
    }

    if (ft) {
      const rp = span(t, 2.0, 2.6);
      const txt = m.winner === null ? 'Honours even' : `${m.winner === 0 ? m.home.name : m.away.name} win`;
      ctx.save();
      ctx.globalAlpha = outCubic(rp);
      ctx.textAlign = 'center';
      fitFont(ctx, txt, 700, 68, 40, W - 180, sans);
      ctx.fillStyle = m.winner === null ? INK : LIME;
      ctx.shadowColor = m.winner === null ? 'rgba(0,0,0,0)' : 'rgba(181,242,61,0.6)';
      ctx.shadowBlur = 40;
      ctx.fillText(txt, W / 2, 1400 + (1 - outCubic(rp)) * 30);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  // ── prices strip (before and during the match)
  if (m.odds.length) {
    const oy = m.phase === 'PRE' ? 1330 : 1394;
    const oh = m.phase === 'PRE' ? 112 : 96;
    const gap = 16;
    const ow = (W - 180 - gap * (m.odds.length - 1)) / m.odds.length;
    m.odds.forEach((o, i) => {
      const p = span(t, 2.1 + i * 0.1, 2.6 + i * 0.1);
      ctx.save();
      ctx.globalAlpha = outCubic(p);
      const x = 90 + i * (ow + gap);
      const y = oy + (1 - outBack(p)) * 40;
      rr(ctx, x, y, ow, oh, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      fitFont(ctx, o.label, 500, 26, 18, ow - 30, sans);
      ctx.fillStyle = MUTE;
      ctx.fillText(o.label, x + ow / 2, y + (oh > 100 ? 42 : 36));
      ctx.font = `600 ${oh > 100 ? 44 : 40}px ${mono}`;
      ctx.fillStyle = INK;
      ctx.fillText(o.odds, x + ow / 2, y + (oh > 100 ? 92 : 80));
      ctx.textAlign = 'left';
      ctx.restore();
    });
  }

  // a sheen across everything, once
  const sp = span(t, 3.0, 3.9);
  if (sp > 0 && sp < 1) {
    ctx.save();
    const sx = -400 + sp * (W + 800);
    const g = ctx.createLinearGradient(sx - 200, 0, sx + 200, 400);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.1 * Math.sin(sp * Math.PI)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // floating sparks in both colours
  const rnd = rand(11);
  for (let i = 0; i < 36; i++) {
    const x = rnd() * W;
    const speed = 30 + rnd() * 70;
    const y = H - ((t * speed + rnd() * H) % H);
    ctx.globalAlpha = clamp(0.12 + 0.4 * Math.sin(t * 2 + i)) * reveal;
    ctx.fillStyle = i % 2 ? m.home.color : m.away.color;
    ctx.beginPath();
    ctx.arc(x, y, 2 + rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── footer: QR to the match
  const qp = outCubic(span(t, 2.4, 3.0));
  ctx.save();
  ctx.globalAlpha = qp;
  const fy = 1522;
  rr(ctx, 90, fy - 4, W - 180, 150, 40);
  ctx.fillStyle = 'rgba(10,10,12,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = qp;
  qr(ctx, a, m.link, 110, fy + 14, 112);
  ctx.font = `600 38px ${sans}`;
  ctx.fillStyle = INK;
  ctx.fillText(live ? 'Watch it live' : ft ? 'Relive the match' : 'Bet on this match', 254, fy + 62);
  ctx.font = `500 28px ${mono}`;
  ctx.fillStyle = live ? '#FF8FA3' : LIME;
  ctx.fillText(new URL(m.link).host, 254, fy + 106);
  ctx.restore();
}

function qr(ctx: CanvasRenderingContext2D, a: Assets, text: string, x: number, y: number, size: number) {
  // reuse the QR the bet stories use (cached on the assets object)
  const anyA = a as Assets & { _mqr?: { text: string; n: number; dark: boolean[] } };
  if (!anyA._mqr || anyA._mqr.text !== text) {
    anyA._mqr = makeQr(text);
  }
  const q = anyA._mqr;
  rr(ctx, x, y, size, size, 18);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  if (!q || !q.n) return;
  const pad = 10;
  const cell = (size - pad * 2) / q.n;
  ctx.fillStyle = '#0A0A0C';
  for (let r = 0; r < q.n; r++) for (let c = 0; c < q.n; c++) if (q.dark[r * q.n + c]) ctx.fillRect(x + pad + c * cell, y + pad + r * cell, cell + 0.4, cell + 0.4);
}

function makeQr(text: string): { text: string; n: number; dark: boolean[] } {
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const dark: boolean[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark.push(q.isDark(r, c));
    return { text, n, dark };
  } catch {
    return { text, n: 0, dark: [] };
  }
}
