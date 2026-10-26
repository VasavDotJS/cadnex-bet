/**
 * Player photos for tennis: a freely licensed photo from Wikipedia/Wikimedia Commons (with
 * its author and licence, for the credit line), or ESPN's official headshot, or nothing.
 * Server-only. Results are cached by the CDN, so each player is looked up rarely.
 */

const UA = 'CADNEX/1.0 (https://github.com/VasavDotJS/cadnex-bet)';
const WIKI = 'https://en.wikipedia.org';
/** licences that allow showing the photo with a credit */
const FREE = /^(cc[ -]by(-sa)?[ -]?[\d.]*|cc0|cc-zero|public domain|pd)/i;

export interface PlayerPhoto {
  /** the image itself (Wikimedia or ESPN), to be fetched through /api/photo */
  url: string;
  /** "Photo: author · licence" for Wikimedia photos */
  credit?: string;
  /** where the photo and its licence are described */
  source?: string;
}

export class UpstreamBusy extends Error {}

async function json(url: string): Promise<unknown | null> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (r.status === 429 || r.status >= 500) throw new UpstreamBusy(`HTTP ${r.status}`);
  if (!r.ok) return null;
  return r.json();
}

const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

interface Summary { type?: string; title?: string; description?: string; originalimage?: { source?: string }; thumbnail?: { source?: string } }

/** The Wikipedia article for a tennis player of this name, if there is one. */
async function article(name: string): Promise<Summary | null> {
  for (const title of [name, `${name} (tennis)`]) {
    const s = (await json(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)) as Summary | null;
    if (s && s.type !== 'disambiguation' && /tennis/i.test(s.description ?? '')) return s;
  }
  return null;
}

/** The Commons file behind an article's lead image, with a sized copy, author and licence. */
async function commonsFile(imageUrl: string): Promise<PlayerPhoto | null> {
  const m = /\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/.exec(new URL(imageUrl).pathname);
  if (!m) return null;
  const file = decodeURIComponent(m[1]);
  const q = `${WIKI}/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=480&titles=${encodeURIComponent(`File:${file}`)}`;
  const data = (await json(q)) as { query?: { pages?: { imageinfo?: { thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }[] } } | null;
  const info = data?.query?.pages?.[0]?.imageinfo?.[0];
  const url = info?.thumburl ?? info?.url;
  if (!info || !url) return null;
  const meta = info.extmetadata ?? {};
  const licence = strip(meta.LicenseShortName?.value ?? '');
  if (!FREE.test(licence)) return null; // only photos we're allowed to show
  const author = strip(meta.Artist?.value ?? '').slice(0, 80) || 'Unknown';
  const source = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s"<>]+$/.test(info.descriptionurl ?? '') ? info.descriptionurl : undefined;
  return { url, credit: `Photo: ${author} · ${licence} · Wikimedia Commons`, source };
}

async function espnHeadshot(id: string): Promise<PlayerPhoto | null> {
  const url = `https://a.espncdn.com/i/headshots/tennis/players/full/${id}.png`;
  const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CADNEX/1.0)' }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  return r?.ok && (r.headers.get('content-type') ?? '').startsWith('image/') ? { url } : null;
}

export async function findPlayerPhoto(name: string, espnId?: string): Promise<PlayerPhoto | null> {
  const s = await article(name);
  const lead = s?.originalimage?.source ?? s?.thumbnail?.source;
  if (lead) {
    const photo = await commonsFile(lead);
    if (photo) return photo;
  }
  return espnId ? espnHeadshot(espnId) : null;
}

/** Hosts and paths /api/photo will fetch: Commons files and ESPN tennis headshots only. */
export function allowedPhoto(u: string | null): URL | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' || url.search || url.pathname.includes('..')) return null;
    if (/^(upload|thumb)\.wikimedia\.org$/.test(url.hostname) && /^\/wikipedia\/commons\/(thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/[^/]+(\/\d{2,4}px-[^/]+)?$/i.test(url.pathname) && /\.(jpe?g|png|webp)$/i.test(url.pathname)) return url;
    if (/^a\d?\.espncdn\.com$/.test(url.hostname) && /^\/i\/headshots\/tennis\/players\/full\/\d{1,10}\.png$/.test(url.pathname)) return url;
    return null;
  } catch {
    return null;
  }
}

/** Names as the feed gives them: letters (any script), spaces, dots, hyphens, apostrophes. */
export const PLAYER_NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,59}$/u;
