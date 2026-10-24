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
      ['Are the matches real?', 'Yes. Fixtures, live scores and results are real, taken from ESPN’s public scoreboard data. CADNEX follows top football leagues, the NBA, ATP and WTA tennis, and cricket matches ESPN is covering.'],
      ['How live are the scores?', 'The app checks for updates every 15 seconds, and the data itself can run up to a minute behind TV. The badge at the top shows when the scores last updated. If updates stop, betting on live matches pauses until they return.'],
      ['Where do the prices come from?', 'CADNEX sets its own prices. Before a match they come from bookmaker lines published in the feed when available, otherwise from team ratings, records or player rankings. During a match they move with the real score and clock.'],
      ['Why can’t I bet right now?', 'Markets pause for a few seconds after goals, red cards, set changes and wickets, when a match is about to start, and whenever the live data is out of date.'],
      ['Where is my account kept?', 'In the cloud, on Supabase. Log in on any phone or computer and your wallet, bets and history are there, and they update live across your devices. Each account can only ever read its own data, and passwords are handled by Supabase Auth, never stored by CADNEX. The app also keeps a copy on your device so it stays fast and still opens offline; changes made offline save when you reconnect.'],
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
      ['Football', 'All football markets settle on the score after 90 minutes plus added time. If a match goes to extra time, the 90-minute score is worked out from the goal times; if that isn’t possible, the bets are void. Asian handicaps apply to the full-match score.'],
      ['Asian handicap', 'Whole lines (e.g. −1.0) can push: the stake is returned. Quarter lines (e.g. −0.75) split the stake across the two nearest half lines, so a bet can be half won or half lost.'],
      ['Next goal', 'Settles on the team that scores the numbered goal; "No goal" wins if it never comes in normal time. If two goals arrive in the same update and the order can’t be told, the market is void.'],
      ['Basketball', 'Moneyline, spreads and totals include overtime. Quarter markets settle on that quarter only and can tie.'],
      ['Tennis', 'If a player retires or a match is a walkover, every market not already decided is void. Set winner markets settle as soon as that set ends.'],
      ['Cricket', 'Match winner is offered on T20 and one-day matches and includes any super over. A tie, no result or draw is void.'],
      ['Postponed or cancelled', 'Bets on a match that is postponed, cancelled or abandoned are void and the stake is returned.'],
      ['Cash out', 'The cash-out value is the current fair value of your bet minus a small margin. It updates live and pauses while a market is suspended. A partial cash out leaves the rest of your stake on the bet.'],
    ],
  },
  {
    title: 'Terms',
    items: [
      ['Who can use CADNEX', 'You must be 18 or older. CADNEX has no affiliation with ESPN, any league, team, player or bookmaker.'],
      ['Virtual credits', 'CDNX credits have no cash value, cannot be bought or sold and can be reset at any time.'],
      ['When bets settle', 'Bets settle when the score provider marks a match finished, or earlier once the outcome can’t change. Corrections published after that are not applied.'],
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
