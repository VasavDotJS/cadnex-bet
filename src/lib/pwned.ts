/**
 * Breached-password check against Have I Been Pwned, using its k-anonymity range API:
 * only the first 5 characters of the password's SHA-1 hash leave the device, and the match
 * is made here. If the service can't be reached the check is skipped, never blocking sign-up.
 */
const API = 'https://api.pwnedpasswords.com/range/';

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** How many times the password appears in known breaches (0 if none or unknown). */
export async function breachCount(password: string, fetcher: typeof fetch = fetch): Promise<number> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetcher(API + prefix, { headers: { 'Add-Padding': 'true' }, signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return 0;
    for (const line of (await r.text()).split('\n')) {
      const [s, n] = line.trim().split(':');
      if (s === suffix) return Number(n) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Basic strength rules plus the breach check. Returns a reason to refuse, or null. */
export async function passwordProblem(password: string, context: string[] = [], fetcher?: typeof fetch): Promise<string | null> {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 128) return 'Use 128 characters or fewer.';
  if (/^(.)\1+$/.test(password)) return 'Avoid repeating one character.';
  const lower = password.toLowerCase();
  if (context.some((c) => c && c.length >= 4 && lower.includes(c.toLowerCase()))) return 'Don’t use your username in your password.';
  const seen = await breachCount(password, fetcher);
  if (seen > 0) return `This password has appeared in ${seen > 1000 ? 'thousands of' : seen.toLocaleString()} data breach${seen === 1 ? '' : 'es'}. Choose a different one.`;
  return null;
}
