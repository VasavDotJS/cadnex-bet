/**
 * Share links: everything a friend needs to copy a bet lives in the link itself, so it works
 * for anyone without an account lookup. Format (inside the app's hash route):
 *
 *   /#/s/<username>/<eventId>!<marketKey>!<code>,<eventId>!<marketKey>!<code>…
 *
 * Kept short on purpose so the QR code on a story stays easy to scan.
 */

export interface SharedPick {
  eventId: string;
  marketKey: string;
  code: string;
}

export interface SharedSlip {
  user: string;
  picks: SharedPick[];
}

const SAFE = /^[A-Za-z0-9._~-]+$/;
const enc = (s: string) => (SAFE.test(s) ? s : encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`));

export function sharePath(user: string, picks: SharedPick[]): string {
  const legs = picks.map((p) => [p.eventId, p.marketKey, p.code].map(enc).join('!')).join(',');
  return `/s/${enc(user || 'player')}/${legs}`;
}

export function shareUrl(user: string, picks: SharedPick[], origin = typeof window === 'undefined' ? 'https://cadnex.vercel.app' : window.location.origin): string {
  return `${origin}/#${sharePath(user, picks)}`;
}

/** Parse the part after /s/. Returns null if it isn't a valid share. */
export function parseShare(user: string | undefined, legs: string | undefined): SharedSlip | null {
  if (!legs) return null;
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const picks: SharedPick[] = [];
  for (const part of legs.split(',')) {
    const [eventId, marketKey, code] = part.split('!').map(dec);
    if (!eventId || !marketKey || !code) return null;
    picks.push({ eventId, marketKey, code });
  }
  if (!picks.length || picks.length > 20) return null;
  return { user: dec(user ?? 'player').slice(0, 24), picks };
}
