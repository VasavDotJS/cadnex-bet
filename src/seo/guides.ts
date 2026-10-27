/**
 * Guides: plain-English explainers that answer what people searching for demo sports betting
 * want to know. Rendered on the server at /guides/<slug>. All figures are worked examples.
 */

export interface GuideSection {
  h: string;
  p?: string[];
  list?: string[];
  table?: { head: string[]; rows: string[][] };
  tip?: string;
}

export interface Guide {
  slug: string;
  title: string; // <title> (the site name is appended)
  description: string; // meta description, ~150 characters
  h1: string;
  intro: string;
  updated: string; // ISO date
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  related: string[];
  /** where the "try it" button sends people in the app */
  cta: { label: string; href: string };
}

export const GUIDES: Guide[] = [
  {
    slug: 'practice-sports-betting-without-money',
    title: 'How to Practise Sports Betting Without Risking Money',
    description: 'A step-by-step way to learn sports betting with a free demo sportsbook: real matches, real odds, virtual money. Build habits before any real stake.',
    h1: 'How to practise sports betting without risking money',
    intro: 'The cheapest way to learn how betting works is to do it with money that isn’t real. A demo sportsbook gives you the same matches, prices and settlements as a real one, so every lesson is real except the cost.',
    updated: '2026-10-27',
    sections: [
      {
        h: 'Why practise with a demo sportsbook',
        p: [
          'Most beginner mistakes are about process, not picks: staking too much, chasing losses, not knowing what a market means, or misreading odds. Those mistakes cost the same whether the money is real or virtual, which is exactly why a demo account is the right place to make them.',
          'A good demo sportsbook uses real fixtures and live scores, prices markets the way a bookmaker would, and settles bets on the real result. That makes the feedback honest: you find out how a strategy actually performs, not how it feels.',
        ],
      },
      {
        h: 'A four-week practice plan',
        list: [
          'Week 1: singles only. Bet small, flat stakes on one market you understand (for example the match result in football). Write down why you made each bet.',
          'Week 2: compare prices. Before each bet, convert the odds into an implied probability and decide whether you think the real chance is higher. Skip the bet if not.',
          'Week 3: try one new market or bet type at a time: totals, both teams to score, a two-leg parlay, or an in-play bet. Keep stakes flat.',
          'Week 4: review. Look at your win rate, average odds and return on stake by market. Keep what worked, drop what didn’t, and notice which bets you placed out of boredom.',
        ],
      },
      {
        h: 'Set rules before you start',
        p: ['Treat the demo balance as if it were real. The habits you build here are the ones you will keep.'],
        list: [
          'Flat stakes: 1–2% of your balance per bet, the same every time.',
          'A daily limit on the number of bets and the amount staked.',
          'No chasing: a losing run is never a reason to stake more.',
          'Keep a record. CADNEX keeps every bet, its odds and its result, and shows win rate and profit over time.',
        ],
      },
      {
        h: 'What to measure',
        table: {
          head: ['Measure', 'What it tells you'],
          rows: [
            ['Return on stake (ROI)', 'Profit divided by total staked. The single best summary of results.'],
            ['Win rate vs average odds', 'A 40% win rate is great at average odds of 3.00 and poor at 1.50.'],
            ['Results by market', 'Shows where your edge (if any) actually is.'],
            ['Longest losing run', 'Prepares you for the swings that are normal even for good bettors.'],
          ],
        },
      },
      {
        h: 'Know the limits of practice',
        p: [
          'Virtual money removes the pressure that makes real betting hard. Use the demo to learn the mechanics and test ideas, but remember that bookmakers build a margin into every price, so most bettors lose over time. CADNEX is for learning and fun: you can never deposit, withdraw or win real money.',
        ],
        tip: 'If betting with real money ever stops feeling like entertainment, free help is available, for example from GamCare in the UK (0808 8020 133) or the National Council on Problem Gambling in the US (ncpgambling.org).',
      },
    ],
    faq: [
      { q: 'Is demo sports betting free?', a: 'Yes. CADNEX is free and uses virtual money only. New accounts start with 1,000 virtual dollars, and you can claim a small daily top-up.' },
      { q: 'Can I win real money on a demo sportsbook?', a: 'No. Virtual winnings can’t be withdrawn or exchanged for anything. A demo sportsbook is for learning and entertainment.' },
      { q: 'Are the matches and odds real?', a: 'The matches and live scores are real. Prices are CADNEX’s own, built from bookmaker lines, rankings and the live score, and bets settle on the real result.' },
    ],
    related: ['how-betting-odds-work', 'football-betting-markets-explained', 'what-is-a-parlay'],
    cta: { label: 'Start practising free', href: '/#/signup' },
  },
  {
    slug: 'how-betting-odds-work',
    title: 'How Betting Odds Work: Decimal, Fractional and American Explained',
    description: 'Learn to read decimal, fractional and American odds, turn them into probabilities, and spot the bookmaker margin. Worked examples, no jargon.',
    h1: 'How betting odds work',
    intro: 'Odds do two jobs: they tell you how much a bet pays, and they hint at how likely the bookmaker thinks the outcome is. Once you can switch between formats and probabilities, every market becomes easier to read.',
    updated: '2026-10-27',
    sections: [
      {
        h: 'Decimal odds',
        p: [
          'Decimal odds show the total return for each unit staked, including your stake. A 10 bet at 2.50 returns 25 if it wins: 15 profit plus the 10 stake.',
          'Return = stake × odds. Profit = stake × (odds − 1).',
        ],
      },
      {
        h: 'Fractional and American odds',
        p: [
          'Fractional odds (common in the UK) show profit relative to stake: 3/2 means 3 profit for every 2 staked, the same as decimal 2.50.',
          'American odds use 100 as the reference. A plus number is the profit on a 100 stake (+150 is decimal 2.50). A minus number is how much you must stake to win 100 profit (−200 is decimal 1.50).',
        ],
        table: {
          head: ['Decimal', 'Fractional', 'American', 'Implied probability'],
          rows: [
            ['1.50', '1/2', '−200', '66.7%'],
            ['2.00', '1/1 (evens)', '+100', '50.0%'],
            ['2.50', '3/2', '+150', '40.0%'],
            ['4.00', '3/1', '+300', '25.0%'],
          ],
        },
        tip: 'In CADNEX you can switch between decimal, fractional, American, Hong Kong, Indonesian and Malay odds in Settings.',
      },
      {
        h: 'From odds to probability',
        p: [
          'Implied probability = 1 ÷ decimal odds. At 2.50 the price implies a 40% chance. If you believe the real chance is higher than 40%, the bet has value; if lower, it doesn’t.',
        ],
      },
      {
        h: 'The bookmaker margin',
        p: [
          'Add up the implied probabilities of every outcome in a market and you’ll get more than 100%. The extra is the margin (also called the overround or vig). In a two-way market priced 1.91 and 1.91, each side implies 52.4%, a total of 104.7%: a margin of about 4.7%.',
          'The margin is why, over many bets, a bettor who picks at random loses roughly that percentage of what they stake. Lower margins are better for you; parlays multiply the margin of every leg.',
        ],
      },
      {
        h: 'Why odds move',
        list: [
          'New information: team news, injuries, weather.',
          'Money: heavy betting on one side moves prices at real bookmakers.',
          'The live game: in play, every goal, break of serve or run of points changes the probabilities. CADNEX reprices every few seconds and pauses betting briefly after big moments.',
        ],
      },
    ],
    faq: [
      { q: 'What do odds of 2.00 mean?', a: 'Evens: a winning bet doubles your stake (10 returns 20). The implied probability is 50%.' },
      { q: 'Are higher odds better?', a: 'Higher odds pay more but are less likely to win. What matters is whether the odds are higher than the true chance justifies.' },
      { q: 'What is the vig or overround?', a: 'The bookmaker’s built-in margin: the amount by which the implied probabilities of all outcomes add up to more than 100%.' },
    ],
    related: ['football-betting-markets-explained', 'what-is-a-parlay', 'live-in-play-betting'],
    cta: { label: 'See live odds now', href: '/#/live' },
  },
  {
    slug: 'what-is-a-parlay',
    title: 'What Is a Parlay (Accumulator)? Parlays and System Bets Explained',
    description: 'How parlays and accumulators work, how the odds multiply, why they are harder to win than they look, and how system bets like a Trixie or Yankee spread the risk.',
    h1: 'What is a parlay?',
    intro: 'A parlay (an accumulator, or acca, in the UK) combines several selections into one bet. The odds multiply, so the payout grows fast, but every leg has to win.',
    updated: '2026-10-27',
    sections: [
      {
        h: 'How the odds multiply',
        p: [
          'Three legs at 1.80, 2.00 and 1.50 make a parlay at 1.80 × 2.00 × 1.50 = 5.40. A 10 stake returns 54 if all three win, and nothing if any one loses.',
          'If a leg is void (a postponed match, for example) it usually counts as odds of 1.00 and the parlay continues on the remaining legs.',
        ],
      },
      {
        h: 'Why parlays are harder than they look',
        p: [
          'Each leg carries the bookmaker’s margin, and in a parlay the margins multiply too. With about 5% margin per leg, a three-leg parlay carries roughly 14% and a six-leg parlay roughly 25%. That is why long accumulators pay big but win rarely.',
        ],
        list: [
          'Keep parlays short while you learn: two or three legs.',
          'Avoid related legs (for example a team to win and the same team to score first): bookmakers price combinations like that differently.',
          'Compare the parlay price with backing each leg as a single, and check what you are really paying for.',
        ],
      },
      {
        h: 'System bets: Trixie, Patent, Yankee and more',
        p: ['A system bet is a set of smaller parlays (and sometimes singles) on the same selections, so you can still get a return if one or two legs lose. Each line costs one stake.'],
        table: {
          head: ['System', 'Selections', 'Bets', 'Made of'],
          rows: [
            ['Trixie', '3', '4', '3 doubles, 1 treble'],
            ['Patent', '3', '7', '3 singles, 3 doubles, 1 treble'],
            ['Yankee', '4', '11', '6 doubles, 4 trebles, 1 fourfold'],
            ['Lucky 15', '4', '15', '4 singles + a Yankee'],
            ['Canadian', '5', '26', 'every double, treble, fourfold and fivefold'],
            ['Lucky 31', '5', '31', '5 singles + a Canadian'],
            ['Heinz', '6', '57', 'every combination of 2 or more'],
          ],
        },
        tip: 'CADNEX supports singles, parlays and all of these system bets, plus "2 from 3", "2 from 4" and "3 from 4".',
      },
    ],
    faq: [
      { q: 'Is a parlay the same as an accumulator?', a: 'Yes. "Parlay" is the US term; "accumulator" or "acca" is used in the UK and elsewhere.' },
      { q: 'What happens if one leg of a parlay loses?', a: 'The whole parlay loses. System bets exist to soften this by splitting the stake across several smaller combinations.' },
      { q: 'Can I cash out a parlay?', a: 'Often, yes. Cash out offers a price for your bet before it finishes. CADNEX offers full and partial cash out while prices are available.' },
    ],
    related: ['cash-out-explained', 'how-betting-odds-work', 'practice-sports-betting-without-money'],
    cta: { label: 'Build a parlay free', href: '/#/sports' },
  },
  {
    slug: 'cash-out-explained',
    title: 'Cash Out Explained: How Cash Out Works in Sports Betting',
    description: 'What cash out means, how the cash-out value is worked out, when partial cash out makes sense, and why cashing out usually costs a little margin.',
    h1: 'Cash out explained',
    intro: 'Cash out lets you settle a bet before the event finishes, for a value based on the current odds. It is a way to lock in profit or cut a loss, at a price.',
    updated: '2026-10-27',
    sections: [
      {
        h: 'How the value is worked out',
        p: [
          'Roughly, the cash-out value is your potential return scaled by how likely the bet now looks: stake × odds you took ÷ current odds, minus a margin.',
          'Example: you back a team at 3.00 for 10. They go a goal up and their price drops to 1.50. The fair value is 10 × 3.00 ÷ 1.50 = 20; the offer will be a little below that.',
        ],
      },
      {
        h: 'Full and partial cash out',
        list: [
          'Full cash out settles the whole bet now.',
          'Partial cash out settles a share of the stake and leaves the rest running at the original odds.',
          'Prices move in play and cash out is unavailable while a market is suspended (for example just after a goal).',
        ],
        tip: 'In CADNEX the server values every cash out from its own live data and never pays more than the amount you were shown.',
      },
      {
        h: 'When cashing out makes sense',
        p: [
          'Cash out never adds value on its own: you sell your bet back slightly below its fair price. It makes sense when your view has changed (an injury, a red card) or when you want to manage risk on a big parlay. Practise both choices on a demo account and compare the results over time.',
        ],
      },
    ],
    faq: [
      { q: 'Why is the cash-out offer lower than my potential return?', a: 'Because the outcome isn’t certain yet. The offer reflects the current chance of winning, minus a margin.' },
      { q: 'Why can’t I cash out right now?', a: 'Cash out pauses while the market is suspended, for example straight after a goal, or once a result is decided.' },
    ],
    related: ['live-in-play-betting', 'what-is-a-parlay', 'how-betting-odds-work'],
    cta: { label: 'Try cash out free', href: '/#/live' },
  },
  {
    slug: 'live-in-play-betting',
    title: 'Live In-Play Betting Explained: How Live Odds Move',
    description: 'How in-play betting works: why live odds move with the score and the clock, why markets get suspended, and how to practise live betting safely with virtual money.',
    h1: 'Live in-play betting explained',
    intro: 'In-play (live) betting means betting while the match is happening. Prices update constantly as the score, the clock and the momentum change.',
    updated: '2026-10-27',
    sections: [
      {
        h: 'Why live odds move',
        list: [
          'The score: a goal, a break of serve or a 10–0 run changes the probabilities straight away.',
          'The clock: a team leading by one goal becomes more likely to win with every minute that passes.',
          'Momentum and pressure: shots, corners and possession hint at what happens next.',
        ],
      },
      {
        h: 'Suspensions',
        p: [
          'Markets are paused for a few seconds after big moments (goals, penalties, red cards, set points) so nobody can bet on a price that is out of date. CADNEX suspends markets the same way, then reopens them at new prices.',
        ],
      },
      {
        h: 'Practising live betting',
        list: [
          'Watch the match or a live tracker; never bet on a game you aren’t following.',
          'Decide your stake before kick-off, not in the heat of the moment.',
          'Keep a note of why you placed each in-play bet, and review them afterwards.',
          'Use virtual money first: live betting is fast and makes impulsive bets easy.',
        ],
      },
    ],
    faq: [
      { q: 'What is in-play betting?', a: 'Placing bets after a match has started, at prices that update with the live score and clock.' },
      { q: 'Why was my live bet rejected?', a: 'The price may have changed or the market may have been suspended between you seeing it and placing the bet. CADNEX shows you the new price when that happens.' },
    ],
    related: ['cash-out-explained', 'football-betting-markets-explained', 'how-betting-odds-work'],
    cta: { label: 'Bet live with virtual money', href: '/#/live' },
  },
  {
    slug: 'football-betting-markets-explained',
    title: 'Football Betting Markets Explained: 1X2, BTTS, Totals and Handicaps',
    description: 'A clear guide to football betting markets: match result (1X2), double chance, draw no bet, both teams to score, over/under goals, Asian handicap and correct score.',
    h1: 'Football betting markets explained',
    intro: 'Football has more betting markets than any other sport. These are the ones worth understanding first, with what each pays and when it is void.',
    updated: '2026-10-27',
    sections: [
      {
        h: 'Match result (1X2)',
        p: ['Back the home win (1), the draw (X) or the away win (2) after 90 minutes plus stoppage time. Extra time and penalties don’t count.'],
      },
      {
        h: 'Double chance and draw no bet',
        list: [
          'Double chance covers two of the three results: 1X, X2 or 12. Lower odds, higher chance of winning.',
          'Draw no bet: back a team to win; if the match is drawn your stake is returned.',
        ],
      },
      {
        h: 'Goals markets',
        list: [
          'Over/under (totals): over 2.5 goals wins with 3 or more goals; under 2.5 wins with 2 or fewer.',
          'Both teams to score (BTTS): yes wins if both sides score at least once.',
          'Total goals odd/even and correct score for more specific predictions.',
          'Next goal: which team scores the next goal, offered in play.',
        ],
      },
      {
        h: 'Asian handicap',
        p: [
          'A handicap gives one team a head start to even out a mismatch. With −1 on the favourite, they must win by two or more for the bet to win; a one-goal win returns your stake. Quarter lines (−0.75, −1.25) split your stake across the two nearest lines.',
        ],
      },
      {
        h: 'Which markets to learn first',
        p: ['Start with the match result and over/under 2.5 goals: they are easy to follow and have plenty of history to learn from. Add both teams to score and draw no bet once those make sense.'],
        tip: 'CADNEX prices all of these markets on real matches from over 40 competitions, including the Premier League, LaLiga, Serie A, the Champions League and the Indian Super League.',
      },
    ],
    faq: [
      { q: 'What does 1X2 mean?', a: 'The three possible match results: 1 is a home win, X a draw and 2 an away win.' },
      { q: 'Does extra time count?', a: 'Not for standard football markets, which settle on the result after 90 minutes plus stoppage time.' },
      { q: 'What is over 2.5 goals?', a: 'A bet that the match has three or more goals in total. Under 2.5 wins with two or fewer.' },
    ],
    related: ['how-betting-odds-work', 'live-in-play-betting', 'practice-sports-betting-without-money'],
    cta: { label: 'Bet on football free', href: '/#/sports/football' },
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
