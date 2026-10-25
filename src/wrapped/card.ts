/**
 * The shareable Wrapped card: a 6-second 1080×1920 animation of the period's headline
 * numbers and the player's personality, exported through the same MP4 pipeline as
 * bet stories. Kept inside the area Instagram and WhatsApp don't cover.
 */
import { formatMoney } from '../lib/money';
import { Assets, clamp, H, outBack, outCubic, rand, rr, rolling, span, tracked, W } from '../share/story';
import type { Wrapped } from './stats';

const INK = '#F4F4F6';
const MUTE = 'rgba(244,244,246,0.55)';
const LIME = '#B5F23D';

export interface CardStat { label: string; value: string; tone?: 'up' | 'down' }

export function cardStats(w: Wrapped): CardStat[] {
  const s: CardStat[] = [
    { label: 'Bets placed', value: String(w.placed) },
    { label: 'Win rate', value: w.winRate === null ? '—' : `${Math.round(w.winRate * 100)}%` },
    { label: 'Net result', value: w.settled ? formatMoney(w.net, w.currency, { sign: true, compact: true }) : '—', tone: w.net > 0n ? 'up' : w.net < 0n ? 'down' : undefined },
    { label: 'Biggest win', value: w.biggestWin ? formatMoney(w.biggestWin.profit, w.currency, { sign: true, compact: true }) : '—', tone: w.biggestWin ? 'up' : undefined },
    { label: 'Longest odds landed', value: w.longestOdds ? w.longestOdds.odds.toFixed(2) : '—' },
    { label: 'Best streak', value: w.bestStreak ? `${w.bestStreak} in a row` : '—' },
  ];
  return s;
}

const fmtRange = (w: Wrapped) => {
  const f = (t: number) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${f(w.from)} – ${f(w.to)}`;
};

export function drawWrappedCard(ctx: CanvasRenderingContext2D, t: number, w: Wrapped, a: Assets, user: string): void {
  const { sans, mono } = a;
  const [c1, c2] = w.persona.colors;

  // background: persona colours drifting over ink
  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, W, H);
  const orb = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };
  const intro = outCubic(span(t, 0, 0.9));
  orb(180 + Math.sin(t * 0.7) * 80, 420 + Math.cos(t * 0.5) * 60, 980, c1, 0.75 * intro);
  orb(940 + Math.cos(t * 0.6) * 70, 1500 + Math.sin(t * 0.45) * 60, 900, c2, 0.55 * intro);
  if (a.grain) {
    ctx.fillStyle = a.grain;
    ctx.fillRect(0, 0, W, H);
  }

  // header
  ctx.save();
  ctx.globalAlpha = outCubic(span(t, 0.05, 0.7));
  const sc = 54 / 443;
  ctx.save();
  ctx.translate(90, 262);
  ctx.scale(sc, sc);
  ctx.translate(-554, -533);
  ctx.fillStyle = INK;
  ctx.fill(a.mark, 'evenodd');
  ctx.restore();
  ctx.font = `600 28px ${sans}`;
  ctx.fillStyle = INK;
  tracked(ctx, w.period === 'week' ? 'MY WEEK, WRAPPED' : 'MY MONTH, WRAPPED', W - 90, 290, 5, 'right');
  ctx.font = `500 26px ${sans}`;
  ctx.fillStyle = MUTE;
  ctx.textAlign = 'right';
  ctx.fillText(`${user ? `@${user} · ` : ''}${fmtRange(w)}`, W - 90, 330);
  ctx.textAlign = 'left';
  ctx.restore();

  // the personality, revealed
  const pp = span(t, 0.35, 1.3);
  ctx.save();
  ctx.globalAlpha = outCubic(pp);
  ctx.font = `500 34px ${sans}`;
  ctx.fillStyle = MUTE;
  ctx.fillText('My CADNEX personality', 90, 460);
  let size = 132;
  ctx.font = `700 ${size}px ${sans}`;
  while (ctx.measureText(w.persona.name).width > W - 180 && size > 80) {
    size -= 4;
    ctx.font = `700 ${size}px ${sans}`;
  }
  const g = ctx.createLinearGradient(90, 0, W - 90, 0);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.55, c1 === LIME ? '#E9FFC2' : '#FFFFFF');
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.translate(0, (1 - outBack(pp)) * 60);
  ctx.fillText(w.persona.name, 84, 600);
  ctx.font = `400 32px ${sans}`;
  ctx.fillStyle = 'rgba(244,244,246,0.75)';
  // wrap the one-liner onto two lines if needed
  const words = w.persona.line.split(' ');
  let line = '';
  let y = 670;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > W - 180) {
      ctx.fillText(line, 90, y);
      line = word;
      y += 44;
    } else line = test;
  }
  if (line) ctx.fillText(line, 90, y);
  ctx.restore();

  // stat tiles: 2 columns × 3 rows
  const stats = cardStats(w);
  const gx = 72;
  const gy = w.team ? 860 : 800;
  const gap = 20;
  const tw = (W - gx * 2 - gap) / 2;
  const th = 196;
  stats.forEach((st, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = gx + col * (tw + gap);
    const ty = gy + row * (th + gap);
    const p = span(t, 0.9 + i * 0.14, 1.6 + i * 0.14);
    ctx.save();
    ctx.globalAlpha = outCubic(p);
    ctx.translate(0, (1 - outBack(p)) * 60);
    rr(ctx, x, ty, tw, th, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `500 28px ${sans}`;
    ctx.fillStyle = MUTE;
    ctx.fillText(st.label, x + 34, ty + 58);
    let vs = 72;
    ctx.font = `650 ${vs}px ${/[0-9]/.test(st.value) && !/[a-z]/i.test(st.value) ? mono : sans}`;
    while (ctx.measureText(st.value).width > tw - 68 && vs > 36) {
      vs -= 4;
      ctx.font = `650 ${vs}px ${sans}`;
    }
    ctx.fillStyle = st.tone === 'up' ? LIME : st.tone === 'down' ? '#FF8FA3' : INK;
    rolling(ctx, st.value, x + 34, ty + 148, vs, span(t, 1.1 + i * 0.14, 2.6 + i * 0.14), 'left');
    ctx.restore();
  });

  // favourite team, as a pill under the personality
  if (w.team) {
    const p = span(t, 0.8, 1.4);
    ctx.save();
    ctx.globalAlpha = outCubic(p);
    const text = `Ride or die · ${w.team.name} ×${w.team.n}`;
    ctx.font = `600 32px ${sans}`;
    const pw = ctx.measureText(text).width + 56;
    rr(ctx, 84, 762, pw, 64, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(text, 112, 805);
    ctx.restore();
  }

  // sparkles drifting up
  const r = rand(7);
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const speed = 40 + r() * 80;
    const y = H - ((t * speed + r() * H) % H);
    const s = 2 + r() * 4;
    ctx.globalAlpha = clamp(0.15 + 0.5 * Math.sin(t * 2 + i)) * intro;
    ctx.fillStyle = i % 3 ? '#FFFFFF' : c2;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // footer call to action
  ctx.save();
  ctx.globalAlpha = outCubic(span(t, 2.4, 3.1));
  ctx.font = `500 30px ${sans}`;
  ctx.fillStyle = MUTE;
  ctx.textAlign = 'center';
  ctx.fillText('Get your Wrapped on', W / 2, 1582);
  ctx.font = `600 40px ${mono}`;
  ctx.fillStyle = LIME;
  ctx.fillText('cadnex.vercel.app', W / 2, 1634);
  ctx.restore();
}
