/** Help, FAQ, terms and settlement rules per market. */
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { spring } from '../../components/motion';
import { PillLink, TwoTone } from '../../components/ui';

const SECTIONS: { title: string; items: [string, string][] }[] = [
  {
    title: 'About CADNEX',
    items: [
      ['Is any of this real money?', 'No. Every balance, deposit, withdrawal and payout is virtual. You can set your demo balance to any amount in Wallet. No payment is ever taken or made.'],
      ['Are the matches real?', 'The teams and players are real names, but every match is simulated on your device as it plays. Results are drawn with cryptographic randomness while the match runs, so nobody, including CADNEX, knows the result in advance. Replaying the same fixture gives a different match.'],
      ['Why are favourites sometimes beaten?', 'Each match draws hidden form, tempo and other conditions at kick-off. Prices only see the public information, so upsets happen at realistic rates.'],
      ['How long does a match take?', 'By default a match takes about ten minutes. Change it in Settings → Match length (5, 10 or 20 minutes, or real time).'],
      ['Is my data shared?', 'Accounts, bets and history are stored only in this browser. Several accounts on one device are kept fully separate. Passwords are stored as salted PBKDF2 hashes.'],
    ],
  },
  {
    title: 'Bet types',
    items: [
      ['Single', 'One selection. Returns stake × odds if it wins.'],
      ['Parlay', 'Two to twenty selections from different matches. All must win; odds multiply. A void selection counts as odds of 1.00 and the rest of the parlay stands. A parlay loses as soon as any selection loses.'],
      ['System bets', 'Every combination of a set size from your selections, each as its own line at the same stake. 2/3 is three doubles; Trixie is three doubles and a treble (4 lines); Patent adds three singles (7); Yankee is 11 lines from 4; Lucky 15 adds the singles; Canadian is 26 lines from 5; Lucky 31 adds singles; Heinz is 57 lines from 6; Lucky 63 adds singles.'],
      ['Odds changes', 'If a price moves before you place, the slip follows your setting: accept any change, accept only better prices, or always ask.'],
      ['Limits', 'The minimum stake is about 0.10 USD in your currency. The maximum return per bet is about 1,000,000 USD.'],
    ],
  },
  {
    title: 'Settlement rules',
    items: [
      ['Football 90-minute markets', 'Match result, totals, handicaps, both teams to score, correct score and winning margin settle on the score after 90 minutes plus added time. Extra time and penalties do not count.'],
      ['Asian handicap', 'Whole lines (e.g. −1.0) can push: the stake is returned. Quarter lines (e.g. −0.75) split the stake across the two nearest half lines, so a bet can be half won or half lost. Handicaps apply to the full-match score, not goals from the time of the bet.'],
      ['Next goal and goalscorers', 'Next goal settles on the team that scores the numbered goal; "No goal" wins if it never comes. Goals disallowed by VAR do not count. Own goals are not credited to a scorer.'],
      ['Cards and corners', 'Each yellow and each red card counts as one card; a second yellow shows as a yellow and then a red.'],
      ['Basketball', 'Moneyline, spreads and totals include overtime. Quarter and half markets settle on that period only and can tie.'],
      ['Tennis', 'If a player retires before the first set is completed, all bets on the match are void. After that, match winner bets stand on the player who advances; every other market not already decided is void.'],
      ['Cricket', 'Match winner includes the super over. Over-by-over markets are void if the over is not completed. Top batter ties are decided by fewer balls faced, then batting order.'],
      ['Esports', 'Series are best of three. Map markets are void if the map is not played.'],
      ['Cash out', 'The cash-out value is the current fair value of your bet minus a small margin. It updates live and pauses while a market is suspended. A partial cash out leaves the rest of your stake on the bet.'],
      ['Suspensions', 'Markets suspend for a few seconds after key moments such as goals, red cards, breaks of serve and wickets, then reopen at new prices.'],
    ],
  },
  {
    title: 'Terms',
    items: [
      ['Who can use CADNEX', 'You must be 18 or older. CADNEX is a fictional simulation and has no affiliation with any league, team, player or bookmaker.'],
      ['Virtual credits', 'CDNX credits have no cash value, cannot be bought or sold and can be reset at any time.'],
      ['Errors', 'If a price is clearly wrong, CADNEX may void the affected bets and return the stake.'],
    ],
  },
];

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b hair last:border-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px]">
        {q}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} className="shrink-0 text-mute"><ChevronDown size={17} strokeWidth={1.5} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <p className="max-w-[68ch] px-5 pb-4 text-[14px] leading-relaxed text-mute">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Help() {
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <TwoTone a="Help" b="& rules" size="xl" as="h1" />
      {SECTIONS.map((s) => (
        <section key={s.title}>
          <p className="mb-2 px-1 text-[13px] text-mute">{s.title}</p>
          <div className="overflow-hidden rounded-card bg-surface">{s.items.map(([q, a]) => <Item key={q} q={q} a={a} />)}</div>
        </section>
      ))}
    </div>
  );
}

export function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-start justify-center gap-4 px-4 md:px-0">
      <TwoTone a="Off" b="the pitch" size="xl" as="h1" />
      <p className="max-w-[44ch] text-[15px] text-mute">There is no page at this address. It may have been a finished match that has since been cleared.</p>
      <div className="flex gap-2"><PillLink to="/" tone="primary">Go home</PillLink><PillLink to="/live">Live matches</PillLink></div>
      <Link to="/help" className="text-[13px] text-mute underline-offset-2 hover:underline">Help & rules</Link>
    </div>
  );
}
