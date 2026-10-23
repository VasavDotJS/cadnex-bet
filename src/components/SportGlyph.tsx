/** Thin-stroke sport marks drawn for CADNEX (1.5px, consistent with Lucide). */
import type { SportId } from '../data/types';

export function SportGlyph({ sport, size = 20, className = '' }: { sport: SportId; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, 'aria-hidden': true };
  switch (sport) {
    case 'football':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z" />
          <path d="M12 3v4.5M15.6 10.1l4.7-1.6M14.2 14.3l2.9 3.9M9.8 14.3l-2.9 3.9M8.4 10.1L3.7 8.5" />
        </svg>
      );
    case 'basketball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18" />
          <path d="M5.6 5.6c2.6 2.4 3.4 4.4 3.4 6.4s-.8 4-3.4 6.4M18.4 5.6C15.8 8 15 10 15 12s.8 4 3.4 6.4" />
        </svg>
      );
    case 'tennis':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M5.2 5.8c3.4 3.2 3.4 9.2 0 12.4M18.8 5.8c-3.4 3.2-3.4 9.2 0 12.4" />
        </svg>
      );
    case 'cricket':
      return (
        <svg {...common}>
          <path d="M4.5 19.5l9.8-9.8 2.5 2.5-9.8 9.8a1.8 1.8 0 01-2.5-2.5z" />
          <path d="M14.3 9.7l2.6-2.6M16 6l2 2" />
          <circle cx="18.5" cy="17.5" r="2" />
        </svg>
      );
    case 'esports':
      return (
        <svg {...common}>
          <path d="M7 8h10a4 4 0 014 4v2.5a2.5 2.5 0 01-4.4 1.6L15 14H9l-1.6 2.1A2.5 2.5 0 013 14.5V12a4 4 0 014-4z" />
          <path d="M8 11v2M7 12h2" />
          <circle cx="15.5" cy="11.5" r=".6" fill="currentColor" />
          <circle cx="17" cy="13" r=".6" fill="currentColor" />
        </svg>
      );
  }
}
