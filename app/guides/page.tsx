/** All guides. */
import type { Metadata } from 'next';
import { GUIDES } from '../../src/seo/guides';
import { Glow, JsonLd, SeoFooter, SeoHeader } from '../../src/seo/parts';
import { abs, SITE_NAME } from '../../src/seo/site';

const TITLE = 'Sports Betting Guides for Beginners';
const DESCRIPTION = 'Free, plain-English guides to sports betting: how odds work, parlays and system bets, cash out, live betting and football markets. Practise with virtual money.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/guides' },
  openGraph: { type: 'website', title: TITLE, description: DESCRIPTION, url: '/guides', siteName: SITE_NAME },
};

export default function GuidesIndex() {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', name: TITLE, description: DESCRIPTION, url: abs('/guides'), hasPart: GUIDES.map((g) => ({ '@type': 'Article', headline: g.h1, url: abs(`/guides/${g.slug}`) })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: SITE_NAME, item: abs('/') }, { '@type': 'ListItem', position: 2, name: 'Guides', item: abs('/guides') }] },
    ],
  };
  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg text-ink">
      <JsonLd data={schema} />
      <Glow />
      <SeoHeader />
      <main className="relative mx-auto max-w-[1100px] px-5 pb-10 pt-12 md:px-8 md:pt-20">
        <h1 className="text-[40px] font-semibold leading-[1.02] tracking-tightest md:text-[60px]">Sports betting guides <span className="text-mute">for beginners</span></h1>
        <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-mute">Short, practical explainers on how betting works. Read one, then try it on real matches with virtual money on CADNEX, free.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((g) => (
            <a key={g.slug} href={`/guides/${g.slug}`} className="card block p-6 transition-colors hover:bg-surface2">
              <h2 className="text-[18px] font-semibold leading-snug">{g.h1}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-mute">{g.description}</p>
              <span className="mt-4 inline-block text-[14px] text-lime">Read the guide →</span>
            </a>
          ))}
        </div>
      </main>
      <SeoFooter />
    </div>
  );
}
