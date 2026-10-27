/** The share card (1200×630) used for link previews and in search results that show images. */
import { ImageResponse } from 'next/og';
import { MARK } from '../components/Brand';

export const OG_SIZE = { width: 1200, height: 630 };

export function ogImage(title: string, eyebrow = 'FREE · VIRTUAL MONEY · 18+') {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: '#0A0A0C', color: '#F4F4F6', position: 'relative', fontFamily: 'sans-serif' }}>
        <div style={{ position: 'absolute', left: -160, top: -220, width: 760, height: 620, borderRadius: 9999, background: 'radial-gradient(circle at center, rgba(124,108,246,0.6) 0%, rgba(124,108,246,0) 70%)', display: 'flex' }} />
        <div style={{ position: 'absolute', right: -120, top: 40, width: 620, height: 520, borderRadius: 9999, background: 'radial-gradient(circle at center, rgba(244,91,181,0.42) 0%, rgba(244,91,181,0) 70%)', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 380, bottom: -240, width: 520, height: 420, borderRadius: 9999, background: 'radial-gradient(circle at center, rgba(181,242,61,0.3) 0%, rgba(181,242,61,0) 70%)', display: 'flex' }} />
        <svg viewBox="554 533 1645 443" width={220} height={59} fill="#F4F4F6" style={{ display: 'flex' }}>
          <path d={MARK} />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 4, color: '#B5F23D', fontWeight: 700 }}>{eyebrow}</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: title.length > 48 ? 66 : 80, lineHeight: 1.02, fontWeight: 700, letterSpacing: -2, maxWidth: 1000 }}>{title}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: 'rgba(244,244,246,0.7)' }}>Real matches · Live odds · Football, NBA, tennis, cricket</div>
      </div>
    ),
    OG_SIZE,
  );
}
