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

  it('round-trips real picks and rejects broken or crafted links', () => {
    const real = [{ eventId: 'eng.1~701~20261024', marketKey: 'ah:-1.5', code: 'h' }, { eventId: 'cricket-23694~9001~20261024', marketKey: 'mw', code: '2-1' }];
    const [, , user, legs] = sharePath('me', real).split('/');
    expect(parseShare(user, legs)?.picks).toEqual(real);
    expect(parseShare('me', 'only-one-part')).toBeNull();
    expect(parseShare('me', '')).toBeNull();
    // crafted ids that would otherwise reach the server's upstream URLs
    expect(parseShare('me', sharePath('me', [{ eventId: 'eng.1~1?x=1~20261024', marketKey: '1x2', code: '1' }]).split('/')[3])).toBeNull();
    expect(parseShare('me', sharePath('me', [{ eventId: '../x~1~20261024', marketKey: '1x2', code: '1' }]).split('/')[3])).toBeNull();
    expect(parseShare('me', sharePath('me', [{ eventId: 'eng.1~1~20261024', marketKey: '<img>', code: '1' }]).split('/')[3])).toBeNull();
    // too many picks, or a name that isn't a username
    expect(parseShare('me', Array(21).fill('eng.1~1~20261024!1x2!1').join(','))).toBeNull();
    expect(parseShare('<b>x</b>', 'eng.1~1~20261024!1x2!1')?.user).toBe('player');
  });
});
