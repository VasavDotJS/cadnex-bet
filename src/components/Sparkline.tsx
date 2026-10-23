/** Smooth instrument-style line: no axes, no grid. */
import { motion } from 'framer-motion';
import { useId, useMemo } from 'react';

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

export function Sparkline({
  values, width = 300, height = 80, stroke = 'rgb(var(--up))', fill = true, strokeWidth = 2, className = '', baseline,
}: { values: number[]; width?: number; height?: number; stroke?: string; fill?: boolean; strokeWidth?: number; className?: string; baseline?: number }) {
  const id = 'sp' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const { d, area, last, zeroY } = useMemo(() => {
    const v = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
    let min = Math.min(...v, baseline ?? Infinity);
    let max = Math.max(...v, baseline ?? -Infinity);
    if (max - min < 1e-9) { max += 1; min -= 1; }
    const pad = strokeWidth * 2;
    const pts: [number, number][] = v.map((y, i) => [pad + (i / (v.length - 1)) * (width - pad * 2), pad + (1 - (y - min) / (max - min)) * (height - pad * 2)]);
    const path = smoothPath(pts);
    return {
      d: path,
      area: `${path} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`,
      last: pts[pts.length - 1],
      zeroY: baseline !== undefined ? pad + (1 - (baseline - min) / (max - min)) * (height - pad * 2) : null,
    };
  }, [values, width, height, strokeWidth, baseline]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {zeroY !== null && <line x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
      {fill && <path d={area} fill={`url(#${id})`} />}
      <motion.path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={false} animate={{ d }} transition={{ duration: 0.6 }} />
      <circle cx={last[0]} cy={last[1]} r={strokeWidth * 1.6} fill={stroke} />
    </svg>
  );
}
