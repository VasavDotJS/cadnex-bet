import type { MetadataRoute } from 'next';
import { abs, SITE_URL } from '../src/seo/site';

/** Everything public is crawlable; API routes aren't pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: abs('/sitemap.xml'),
    host: SITE_URL,
  };
}
