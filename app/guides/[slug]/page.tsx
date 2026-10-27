/** A guide, rendered on the server with Article, Breadcrumb and FAQ structured data. */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GUIDES, guideBySlug } from '../../../src/seo/guides';
import { Glow, JsonLd, pillLime, Prose, SeoFooter, SeoHeader } from '../../../src/seo/parts';
import { abs, SITE_NAME, SITE_URL } from '../../../src/seo/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  const url = `/guides/${g.slug}`;
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: url },
    openGraph: { type: 'article', title: g.title, description: g.description, url, modifiedTime: g.updated, siteName: SITE_NAME },
    twitter: { card: 'summary_large_image', title: g.title, description: g.description },
  };
}

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  const url = abs(`/guides/${g.slug}`);
  const words = [g.intro, ...g.sections.flatMap((s) => [...(s.p ?? []), ...(s.list ?? []), s.tip ?? ''])].join(' ').split(/\s+/).length;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: g.h1,
        description: g.description,
        url,
        mainEntityOfPage: url,
        datePublished: g.updated,
        dateModified: g.updated,
        inLanguage: 'en',
        wordCount: words,
        image: abs(`/guides/${g.slug}/opengraph-image`),
        author: { '@type': 'Organization', name: SITE_NAME, url: abs('/') },
        publisher: { '@type': 'Organization', name: SITE_NAME, url: abs('/'), logo: { '@type': 'ImageObject', url: abs('/icons/icon-512.png') } },
        isPartOf: { '@id': `${SITE_URL}/#website` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: abs('/') },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: abs('/guides') },
          { '@type': 'ListItem', position: 3, name: g.h1, item: url },
        ],
      },
      { '@type': 'FAQPage', mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
  };
  const related = g.related.map(guideBySlug).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg text-ink">
      <JsonLd data={schema} />
      <Glow />
      <SeoHeader />
      <main className="relative mx-auto max-w-[760px] px-5 pb-10 pt-12 md:px-8 md:pt-20">
        <nav aria-label="Breadcrumb" className="text-[13px] text-mute">
          <a href="/" className="hover:text-ink">Home</a> <span aria-hidden>/</span> <a href="/guides" className="hover:text-ink">Guides</a>
        </nav>
        <article>
          <h1 className="mt-5 text-[38px] font-semibold leading-[1.05] tracking-tightest md:text-[52px]">{g.h1}</h1>
          <p className="mt-4 text-[13px] text-mute">Updated <time dateTime={g.updated}>{fmtDate(g.updated)}</time> · {Math.max(2, Math.round(words / 220))} min read</p>
          <p className="mt-6 text-[19px] leading-relaxed text-ink/90">{g.intro}</p>
          <Prose>
            {g.sections.map((s) => (
              <section key={s.h}>
                <h2>{s.h}</h2>
                {s.p?.map((t) => <p key={t}>{t}</p>)}
                {s.list && <ul>{s.list.map((t) => <li key={t}>{t}</li>)}</ul>}
                {s.table && (
                  <div className="card mt-5 overflow-x-auto">
                    <table>
                      <thead><tr>{s.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                      <tbody>{s.table.rows.map((r) => <tr key={r.join('|')}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                {s.tip && <p className="!mt-5 rounded-[20px] bg-lime/10 px-5 py-4 !text-[15.5px] !text-ink/90">{s.tip}</p>}
              </section>
            ))}
            <section>
              <h2>Common questions</h2>
              {g.faq.map((f) => (
                <div key={f.q}>
                  <h3 className="mt-6 text-[18px] font-semibold">{f.q}</h3>
                  <p className="!mt-2">{f.a}</p>
                </div>
              ))}
            </section>
          </Prose>
        </article>
        <div className="card mt-12 flex flex-col items-start gap-5 p-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[20px] font-semibold tracking-tighter2">Try it with virtual money</p>
            <p className="mt-1 text-[14.5px] text-mute">Real matches, real odds, no risk. Free.</p>
          </div>
          <a href={g.cta.href} className={pillLime}>{g.cta.label}</a>
        </div>
        {related.length > 0 && (
          <aside className="mt-12" aria-labelledby="more">
            <h2 id="more" className="text-[22px] font-semibold tracking-tighter2">Keep reading</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {related.map((r) => (
                <a key={r.slug} href={`/guides/${r.slug}`} className="card block p-5 transition-colors hover:bg-surface2">
                  <p className="text-[15.5px] font-semibold leading-snug">{r.h1}</p>
                </a>
              ))}
            </div>
          </aside>
        )}
      </main>
      <SeoFooter />
    </div>
  );
}
