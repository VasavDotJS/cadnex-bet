import type { MetadataRoute } from 'next';
import { GUIDES } from '../src/seo/guides';
import { abs } from '../src/seo/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const latest = GUIDES.map((g) => g.updated).sort().at(-1) ?? '2026-10-27';
  return [
    { url: abs('/'), lastModified: latest, changeFrequency: 'daily', priority: 1 },
    { url: abs('/guides'), lastModified: latest, changeFrequency: 'weekly', priority: 0.8 },
    ...GUIDES.map((g) => ({ url: abs(`/guides/${g.slug}`), lastModified: g.updated, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
