import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedPhoto, findPlayerPhoto, PLAYER_NAME, UpstreamBusy } from './players';

type Route = [RegExp, () => Response];
function mockFetch(routes: Route[]) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [re, res] of routes) if (re.test(url)) return res();
    return new Response('not found', { status: 404 });
  });
  return calls;
}
const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const commons = (licence: string, artist = '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>') => ok({
  query: { pages: [{ imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Badosa.jpg/480px-Badosa.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Badosa.jpg', extmetadata: { LicenseShortName: { value: licence }, Artist: { value: artist } } }] }] },
});

afterEach(() => vi.unstubAllGlobals());

describe('player photos', () => {
  it('uses a freely licensed Commons photo of a tennis player, with a credit', async () => {
    mockFetch([
      [/rest_v1\/page\/summary\/Paula_Badosa$/, ok({ type: 'standard', title: 'Paula Badosa', description: 'Spanish tennis player (born 1997)', originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/1/1d/Badosa.jpg' } })],
      [/w\/api\.php/, commons('CC BY-SA 4.0')],
    ]);
    expect(await findPlayerPhoto('Paula Badosa')).toEqual({
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Badosa.jpg/480px-Badosa.jpg',
      credit: 'Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons',
      source: 'https://commons.wikimedia.org/wiki/File:Badosa.jpg',
    });
  });

  it('follows "(tennis)" when the name is shared, and ignores namesakes from other sports', async () => {
    const calls = mockFetch([
      [/summary\/Francesca_Jones$/, ok({ type: 'disambiguation', description: 'Topics referred to by the same term' })],
      [/summary\/Francesca_Jones_\(tennis\)$/, ok({ type: 'standard', description: 'British tennis player', originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Jones.jpg' } })],
      [/summary\/John_Smith/, ok({ type: 'standard', description: 'English footballer', originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Smith.jpg' } })],
      [/w\/api\.php/, commons('CC BY 2.0')],
    ]);
    expect((await findPlayerPhoto('Francesca Jones'))?.credit).toContain('CC BY 2.0');
    expect(await findPlayerPhoto('John Smith')).toBeNull();
    expect(calls.some((c) => c.includes('John_Smith_(tennis)'))).toBe(true);
  });

  it('refuses photos whose licence doesn’t allow use, and falls back to the ESPN headshot', async () => {
    mockFetch([
      [/summary\//, ok({ type: 'standard', description: 'Czech tennis player', originalimage: { source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg' } })],
      [/w\/api\.php/, commons('All rights reserved')],
      [/headshots\/tennis\/players\/full\/123\.png/, () => new Response(null, { status: 200, headers: { 'content-type': 'image/png' } })],
    ]);
    expect(await findPlayerPhoto('Someone Else')).toBeNull();
    expect(await findPlayerPhoto('Someone Else', '123')).toEqual({ url: 'https://a.espncdn.com/i/headshots/tennis/players/full/123.png' });
  });

  it('reports Wikipedia being busy instead of caching "no photo"', async () => {
    mockFetch([[/summary\//, () => new Response('slow down', { status: 429 })]]);
    await expect(findPlayerPhoto('Paula Badosa')).rejects.toBeInstanceOf(UpstreamBusy);
  });

  it('only proxies Commons files and ESPN tennis headshots', () => {
    expect(allowedPhoto('https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Badosa_RG21_%2814%29.jpg/480px-Badosa_RG21_%2814%29.jpg')).not.toBeNull();
    expect(allowedPhoto('https://upload.wikimedia.org/wikipedia/commons/1/1d/Badosa.jpg')).not.toBeNull();
    expect(allowedPhoto('https://a.espncdn.com/i/headshots/tennis/players/full/14955.png')).not.toBeNull();
    for (const bad of [
      'https://upload.wikimedia.org/wikipedia/commons/1/1d/evil.svg',
      'https://upload.wikimedia.org/wikipedia/en/1/1d/NonFree.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/1/1d/x.jpg?redirect=https://evil',
      'http://upload.wikimedia.org/wikipedia/commons/1/1d/x.jpg',
      'https://evil.example/wikipedia/commons/1/1d/x.jpg',
      'https://a.espncdn.com/i/headshots/nfl/players/full/1.png',
      'not a url',
    ]) expect(allowedPhoto(bad)).toBeNull();
  });

  it('accepts real player names, including accents, and nothing else', () => {
    for (const n of ['Paula Badosa', 'Tamara Zidanšek', "Martina O'Brien", 'Liang En-shuo', 'Zhang Ruien']) expect(PLAYER_NAME.test(n)).toBe(true);
    for (const n of ['', 'x', '<script>', 'a/b', 'name?q=1', 'A'.repeat(70)]) expect(PLAYER_NAME.test(n)).toBe(false);
  });
});
