import { describe, expect, it } from 'vitest';
import { parseShare, sharePath, shareUrl } from './link';

describe('share links', () => {
  const picks = [
    { eventId: 'eng.1~740123~20261025', marketKey: '1x2', code: '1' },
    { eventId: 'cricket-1234~99~20261025', marketKey: 'mw', code: '2' },
    { eventId: 'nba~401~20261025', marketKey: 'ou228.5', code: 'O' },
  ];

  it('round-trips picks and the username', () => {
    const path = sharePath('vasav', picks);
    const [, , user, legs] = path.split('/');
    expect(parseShare(user, legs)).toEqual({ user: 'vasav', picks });
  });

  it('is short enough for an easy QR code', () => {
    expect(shareUrl('vasav', picks, 'https://cadnex.vercel.app').length).toBeLessThan(140);
  });

  it('escapes odd characters and rejects broken links', () => {
    const odd = [{ eventId: 'a b', marketKey: 'x!y', code: ',' }];
    const [, , user, legs] = sharePath('me', odd).split('/');
    expect(parseShare(user, legs)?.picks).toEqual(odd);
    expect(parseShare('me', 'only-one-part')).toBeNull();
    expect(parseShare('me', '')).toBeNull();
  });
});
