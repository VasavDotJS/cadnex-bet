/**
 * Server-rendered building blocks for the public pages (home, guides): structured data, the
 * header and footer. No client JavaScript: these pages are plain, fast HTML for people and
 * search engines alike.
 */
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { CdnxMark } from '../components/Brand';
import { GUIDES } from './guides';
import { SITE_NAME } from './site';

/** A JSON-LD block (with this page's CSP nonce). */
export async function JsonLd({ data }: { data: object }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export const pill = 'inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-colors';
export const pillLime = `${pill} bg-lime text-onlime hover:brightness-105`;
export const pillSoft = `${pill} bg-surface2 text-ink hover:bg-surface3`;

export function SeoHeader() {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-5 pt-[max(20px,env(safe-area-inset-top))] md:px-8">
      <a href="/" className="inline-flex items-center text-ink" aria-label={`${SITE_NAME} home`}><CdnxMark className="h-[18px]" /></a>
      <nav aria-label="Main" className="flex items-center gap-1 text-[14px]">
        <a href="/guides" className="hidden rounded-full px-3.5 py-2 text-mute hover:text-ink sm:inline-flex">Guides</a>
        <a href="/#/live" className="hidden rounded-full px-3.5 py-2 text-mute hover:text-ink sm:inline-flex">Live odds</a>
        <a href="/#/login" className="rounded-full px-3.5 py-2 text-mute hover:text-ink">Log in</a>
        <a href="/#/signup" className="inline-flex h-10 items-center rounded-full bg-lime px-4 font-medium text-onlime">Play free</a>
      </nav>
    </header>
  );
}

export function SeoFooter() {
  return (
    <footer className="relative mx-auto w-full max-w-[1100px] px-5 pb-12 pt-16 text-[13px] text-mute md:px-8">
      <div className="grid gap-8 border-t hair pt-10 sm:grid-cols-3">
        <div>
          <CdnxMark className="h-[16px] text-ink" />
          <p className="mt-3 max-w-[32ch] leading-relaxed">Free demo sports betting on real matches, with virtual money only.</p>
        </div>
        <div>
          <p className="font-medium text-ink">Guides</p>
          <ul className="mt-3 flex flex-col gap-2">
            {GUIDES.map((g) => <li key={g.slug}><a href={`/guides/${g.slug}`} className="hover:text-ink">{g.h1}</a></li>)}
          </ul>
        </div>
        <div>
          <p className="font-medium text-ink">Play</p>
          <ul className="mt-3 flex flex-col gap-2">
            <li><a href="/#/signup" className="hover:text-ink">Create a free account</a></li>
            <li><a href="/#/live" className="hover:text-ink">Live matches and odds</a></li>
            <li><a href="/#/sports/football" className="hover:text-ink">Football fixtures</a></li>
            <li><a href="/#/help" className="hover:text-ink">Help and betting rules</a></li>
            <li><a href="/#/responsible" className="hover:text-ink">Responsible gaming</a></li>
          </ul>
        </div>
      </div>
      <p className="mt-10 max-w-[90ch] text-[12px] leading-relaxed text-mute">
        CADNEX is a free game for adults (18+) that uses virtual money only: you can’t deposit, withdraw or win real money or prizes. Fixtures and scores come from ESPN’s public data; prices are CADNEX’s own. CADNEX has no affiliation with ESPN or any league, team or player. If gambling with real money is causing you problems, free confidential help is available from GamCare (UK, 0808 8020 133) and the National Council on Problem Gambling (US, ncpgambling.org).
      </p>
    </footer>
  );
}

/** Soft background glow for the public pages (static: nothing animates). */
export function Glow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[720px] overflow-hidden">
      <div className="absolute -left-[15%] -top-[25%] h-[620px] w-[70%] rounded-full opacity-50" style={{ background: 'radial-gradient(closest-side, rgb(var(--violet)), transparent)' }} />
      <div className="absolute -right-[10%] top-[5%] h-[520px] w-[55%] rounded-full opacity-35" style={{ background: 'radial-gradient(closest-side, rgb(var(--magenta)), transparent)' }} />
      <div className="absolute left-[30%] top-[45%] h-[380px] w-[40%] rounded-full opacity-20" style={{ background: 'radial-gradient(closest-side, rgb(var(--lime)), transparent)' }} />
    </div>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="seo-prose">{children}</div>;
}
