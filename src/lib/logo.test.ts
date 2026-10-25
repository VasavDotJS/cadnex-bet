import { describe, expect, it } from 'vitest';
import { cleanLogo, logoSrc } from './logo';

describe('club logos', () => {
  it('accepts only https logos on ESPN’s CDN', () => {
    expect(cleanLogo('https://a.espncdn.com/i/teamlogos/soccer/500/359.png')).toBe('https://a.espncdn.com/i/teamlogos/soccer/500/359.png');
    expect(cleanLogo('http://a.espncdn.com/i/teamlogos/soccer/500/359.png')).toBeUndefined();
    expect(cleanLogo('https://espncdn.com.evil.io/x.png')).toBeUndefined();
    expect(cleanLogo('javascript:alert(1)')).toBeUndefined();
    expect(cleanLogo(42)).toBeUndefined();
  });
  it('asks for a size that is sharp on a 2× screen', () => {
    expect(logoSrc('https://a.espncdn.com/x.png', 24)).toBe('/api/logo?u=https%3A%2F%2Fa.espncdn.com%2Fx.png&w=64');
    expect(logoSrc('https://a.espncdn.com/x.png', 64)).toContain('w=128');
    expect(logoSrc('https://a.espncdn.com/x.png', 400)).toContain('w=500');
  });
});

describe('event ids', () => {
  it('only lets plain ids reach upstream URLs', async () => {
    const { parseEventKey } = await import('../feed/types');
    expect(parseEventKey('eng.1~701~20261024')).toEqual({ leagueId: 'eng.1', espnId: '701', ymd: '20261024' });
    expect(parseEventKey('cricket-23694~9001~20261024')).not.toBeNull();
    for (const bad of ['eng.1~701?x=1~20261024', 'eng.1~70/1~20261024', '../a~1~20261024', 'eng.1~1~2026102', 'a~b', `${'x'.repeat(90)}~1~20261024`]) expect(parseEventKey(bad)).toBeNull();
  });
});
