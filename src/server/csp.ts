/** The Content-Security-Policy for app pages: scripts only with this request's nonce. */
const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ahgwdlcrerxpgdybzwsh.supabase.co').replace(/\/$/, '');
const SUPABASE_WS = SUPABASE.replace(/^https:/, 'wss:');
const PWNED = 'https://api.pwnedpasswords.com';

export function pageCsp(nonce: string, dev = process.env.NODE_ENV !== 'production'): string {
  return [
    "default-src 'self'",
    // no 'unsafe-inline' for scripts: only Next's own scripts, stamped with this nonce, and what they load
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // <style> elements need the nonce; React's style="" attributes are allowed separately
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self' blob: data: ${SUPABASE} ${SUPABASE_WS} ${PWNED}${dev ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
