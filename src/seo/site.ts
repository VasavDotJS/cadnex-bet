/** Public site facts used by metadata, structured data, the sitemap and the landing pages. */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cadnex.vercel.app').replace(/\/$/, '');
export const SITE_NAME = 'CADNEX';
export const SITE_TITLE = 'CADNEX — Free Demo Sports Betting with Virtual Money';
export const SITE_DESCRIPTION =
  'Free demo sports betting on real matches. Bet virtual money on live football, NBA, tennis and cricket with real odds that move in play. Practise parlays, cash out and live betting with zero risk.';

export const KEYWORDS = [
  'demo sports betting',
  'free sports betting',
  'sports betting simulator',
  'practice sports betting',
  'play money sportsbook',
  'virtual money betting',
  'fake sportsbook',
  'free betting game',
  'learn sports betting',
  'betting odds explained',
];

/** Absolute URL for a path on this site. */
export const abs = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;

/** Facts the copy relies on (kept here so pages and structured data agree). */
export const FACTS = {
  startingBalance: '1,000 virtual dollars',
  dailyReward: 'about 5 virtual dollars every day',
  sports: ['Football', 'Basketball (NBA)', 'Tennis (ATP and WTA)', 'Cricket (T20 and one-day)'],
  competitions: ['Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1', 'UEFA Champions League', 'UEFA Europa League', 'Indian Super League', 'FA Cup', 'Copa del Rey', 'NBA', 'ATP Tour', 'WTA Tour'],
  competitionCount: 40,
  oddsFormats: ['Decimal', 'Fractional', 'American', 'Hong Kong', 'Indonesian', 'Malay'],
};
