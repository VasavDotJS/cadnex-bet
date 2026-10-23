import { useReducedMotion as useOsReduced } from 'framer-motion';
import { useSession } from '../store/session';

export const spring = { type: 'spring', stiffness: 320, damping: 32, mass: 1 } as const;
export const gentle = { type: 'spring', stiffness: 200, damping: 28, mass: 1 } as const;
export const snappy = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const;

/** Reduced motion from the OS, overridable in Settings. */
export function useReduced(): boolean {
  const os = useOsReduced();
  const pref = useSession((s) => s.settings?.reducedMotion ?? 'system');
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return !!os;
}

export const press = { scale: 0.97 };
