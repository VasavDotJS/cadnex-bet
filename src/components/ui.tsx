/** Small shared building blocks: pills, chips, icon wells, headings, tabs, avatars. */
import { motion } from 'framer-motion';
import { CharacterAvatar, characterFor } from './avatars';
import { ComponentProps, ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { press, spring } from './motion';

type Tone = 'primary' | 'lime' | 'ghost' | 'soft' | 'danger';

const toneClass: Record<Tone, string> = {
  primary: 'bg-pill text-onpill',
  lime: 'bg-lime text-onlime',
  ghost: 'bg-transparent text-ink hover:bg-surface2',
  soft: 'bg-surface2 text-ink hover:bg-surface3',
  danger: 'bg-down/15 text-down hover:bg-down/20',
};

export function Pill({ tone = 'soft', className = '', children, size = 'md', ...rest }: ComponentProps<typeof motion.button> & { tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'h-9 px-3.5 text-[13px]' : size === 'lg' ? 'h-14 px-6 text-[16px]' : 'h-11 px-5 text-[14px]';
  return (
    <motion.button whileTap={rest.disabled ? undefined : press} transition={spring} className={`inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sz} ${toneClass[tone]} ${className}`} {...rest}>
      {children as ReactNode}
    </motion.button>
  );
}

export function PillLink({ to, tone = 'soft', className = '', children }: { to: string; tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium transition-colors active:scale-[0.97] ${toneClass[tone]} ${className}`}>
      {children}
    </Link>
  );
}

/** Circular icon well, used inside pill actions and for quick actions. */
export function Well({ children, size = 40, className = '' }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`} style={{ width: size, height: size }}>
      {children}
    </span>
  );
}

export function IconButton({ label, children, className = '', ...rest }: ComponentProps<typeof motion.button> & { label: string }) {
  return (
    <motion.button aria-label={label} title={label} whileTap={press} transition={spring} className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-surface2 ${className}`} {...rest}>
      {children as ReactNode}
    </motion.button>
  );
}

export function Chip({ children, className = '', active = false, onClick }: { children: ReactNode; className?: string; active?: boolean; onClick?: () => void }) {
  const cls = `inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] ${active ? 'bg-pill text-onpill' : 'bg-surface2 text-mute'} ${className}`;
  if (onClick) {
    return (
      <motion.button whileTap={press} onClick={onClick} className={`${cls} min-h-[32px] transition-colors ${active ? '' : 'hover:text-ink'}`} aria-pressed={active}>
        {children}
      </motion.button>
    );
  }
  return <span className={cls}>{children}</span>;
}

/** Two-tone editorial heading: first part in ink, second in grey. */
export function TwoTone({ a, b, as = 'h2', className = '', size = 'md' }: { a: string; b: string; as?: 'h1' | 'h2' | 'h3'; className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const Tag = as;
  const sz = size === 'xl' ? 'text-[44px] leading-[0.95] md:text-[60px]' : size === 'lg' ? 'text-[32px] leading-[1]' : size === 'sm' ? 'text-[19px] leading-tight' : 'text-[24px] leading-[1.05]';
  return (
    <Tag className={`font-semibold tracking-tighter2 ${sz} ${className}`}>
      <span className="text-ink">{a}</span> <span className="text-mute">{b}</span>
    </Tag>
  );
}

export function SectionHead({ a, b, action }: { a: string; b: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <TwoTone a={a} b={b} size="sm" />
      {action}
    </div>
  );
}

export function LiveDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`} aria-hidden>
      <span className="breathe absolute inset-0 rounded-full bg-down" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-down/80" />
    </span>
  );
}

export function LiveTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-down/12 px-2 py-0.5 text-[11px] font-medium text-down">
      <LiveDot /> Live
    </span>
  );
}

export function Avatar({ seed, name, size = 40, still }: { seed: number; name: string; size?: number; still?: boolean }) {
  const character = characterFor(seed);
  if (character) return <CharacterAvatar c={character} size={size} still={still ?? size < 24} phase={(seed * 0.37) % 4} />;
  const h1 = seed % 360;
  const h2 = (seed * 7 + 140) % 360;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `radial-gradient(120% 120% at 20% 15%, hsl(${h1} 85% 66%), hsl(${h2} 70% 42%) 70%)` }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Tabs with a sliding indicator and optional count badges. */
export function Tabs<T extends string>({ tabs, value, onChange, id, className = '', variant = 'segmented' }: {
  tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; id: string; className?: string; variant?: 'segmented' | 'underline';
}) {
  return (
    <div role="tablist" className={`flex ${variant === 'segmented' ? 'gap-1 rounded-full bg-surface2 p-1' : 'gap-5'} ${className}`}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`relative flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[13.5px] font-medium transition-colors ${variant === 'segmented' ? 'rounded-full' : 'flex-none px-0'} ${on ? (variant === 'segmented' ? 'text-onpill' : 'text-ink') : 'text-mute hover:text-ink'}`}
          >
            {on && variant === 'segmented' && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-full bg-pill" transition={spring} />}
            {on && variant === 'underline' && <motion.span layoutId={`tab-${id}`} className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-ink" transition={spring} />}
            <span className="relative">{t.label}</span>
            {t.count !== undefined && (
              <span className={`relative inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] num ${on && variant === 'segmented' ? 'bg-onpill/15 text-onpill' : 'bg-surface3 text-ink'}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function countdown(ms: number): string {
  if (ms <= 0) return 'Starting';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function kickoffLabel(t: number, now = Date.now()): string {
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return time;
  const tm = new Date(now + 86_400_000);
  if (d.toDateString() === tm.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed hair px-6 py-12 text-center">
      <p className="text-[16px] font-medium">{title}</p>
      {body && <p className="max-w-[34ch] text-[14px] text-mute">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-inner ${className}`} />;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full transition-colors ${on ? 'bg-lime' : 'bg-surface3'}`}>
      <motion.span layout transition={spring} className={`absolute h-6 w-6 rounded-full shadow ${on ? 'right-1 bg-onlime' : 'left-1 bg-ink/80'}`} />
    </button>
  );
}
