import { GUIDES, guideBySlug } from '../../../src/seo/guides';
import { OG_SIZE, ogImage } from '../../../src/seo/ogImage';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'CADNEX guide';

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  return ogImage(g?.h1 ?? 'Sports betting guides', 'CADNEX GUIDE');
}
