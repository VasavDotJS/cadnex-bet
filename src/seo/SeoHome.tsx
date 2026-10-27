/**
 * The public home page: server-rendered, fast, and written for people looking for a free
 * demo sportsbook. Logged-in players, the installed app and links into the app (/#/…) skip it
 * and open the app instead (see AppMount and the start-up script in the layout).
 */
import { Activity, BadgeCheck, ChartLine, Coins, Layers, Share2, ShieldCheck, Smartphone, Timer, Trophy } from 'lucide-react';
import { GUIDES } from './guides';
import { Glow, JsonLd, pillLime, pillSoft, SeoFooter, SeoHeader } from './parts';
import { abs, FACTS, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from './site';

export const HOME_FAQ: { q: string; a: string }[] = [
  { q: 'What is demo sports betting?', a: 'Demo sports betting means betting on real sports with virtual money instead of your own. You get real fixtures, live scores and moving odds, and bets settle on the real result, but nothing you stake or win is real money.' },
  { q: 'Is CADNEX free?', a: `Yes, completely. Every new account starts with ${FACTS.startingBalance} and you can claim ${FACTS.dailyReward}. There is nothing to buy and nothing to deposit.` },
  { q: 'Can I win real money?', a: 'No. CADNEX uses virtual money only. Balances and winnings can’t be withdrawn, sold or exchanged for prizes.' },
  { q: 'Are the matches real?', a: 'Yes. Fixtures and live scores come from real football, NBA, tennis and cricket matches. Prices are CADNEX’s own, built from bookmaker lines, rankings and the live score, and every bet settles on the real result.' },
  { q: 'What can I bet on?', a: `${FACTS.sports.join(', ')}, across ${FACTS.competitionCount}+ competitions including the ${FACTS.competitions.slice(0, 6).join(', ')} and Indian Super League. Markets include match result, totals, both teams to score, Asian handicap, correct score, set betting and more, before and during the match.` },
  { q: 'Can I practise parlays, cash out and live betting?', a: 'Yes. You can place singles, parlays and system bets (Trixie, Yankee, Lucky 15 and others), bet in play while prices move, and cash out fully or partly.' },
  { q: 'Do I need to download an app?', a: 'No. CADNEX runs in any modern browser on phone, tablet or computer. You can also install it to your home screen like an app.' },
  { q: 'Who can play?', a: 'CADNEX is for adults aged 18 and over. It is a game for learning and entertainment, not a gambling service.' },
];

const FEATURES = [
  { icon: Activity, title: 'Live odds that move', body: 'Prices update with the score and the clock, and pause for a moment after goals and other big moments, like a real sportsbook.' },
  { icon: BadgeCheck, title: 'Settled on real results', body: 'Every bet is settled on the actual result of the real match, so your record means something.' },
  { icon: Layers, title: 'Singles, parlays and system bets', body: 'Build accumulators or spread risk with Trixies, Yankees, Lucky 15s and more.' },
  { icon: Coins, title: 'Cash out', body: 'Take a price on your bet before it finishes, in full or in part.' },
  { icon: ChartLine, title: 'Track how you’re doing', body: 'Win rate, profit and loss, ROI, streaks and your favourite sport, plus a weekly and monthly Wrapped.' },
  { icon: Share2, title: 'Share your picks', body: 'Turn a bet or a match into a story for Instagram or WhatsApp, and let friends copy your slip.' },
  { icon: ShieldCheck, title: 'Healthy-play tools', body: 'Stake, loss and time limits, breaks and self-exclusion, on a game that never uses real money.' },
  { icon: Smartphone, title: 'Works everywhere', body: 'Phone, tablet or desktop, with your account synced across devices. Install it like an app.' },
];

const STEPS = [
  { n: '1', title: 'Create a free account', body: `Sign up with an email. Your demo wallet starts with ${FACTS.startingBalance}.` },
  { n: '2', title: 'Pick a real match', body: 'Choose from today’s football, NBA, tennis and cricket, or a match that’s already live.' },
  { n: '3', title: 'Bet, follow, learn', body: 'Watch the score and the prices move, cash out if you like, and see your bet settle on the real result.' },
];

const COMPARE: [string, string, string][] = [
  ['Real matches, live scores', 'Yes', 'Yes'],
  ['Odds that move in play', 'Yes', 'Yes'],
  ['Parlays, system bets, cash out', 'Yes', 'Usually'],
  ['Your own money at risk', 'Never', 'Always'],
  ['Deposits or withdrawals', 'None', 'Required'],
  ['Cost to start', 'Free', 'Your stake'],
];

function homeSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: abs('/'), name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: 'en' },
      { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: SITE_NAME, url: abs('/'), logo: abs('/icons/icon-512.png') },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#app`,
        name: SITE_NAME,
        alternateName: ['CDNX', 'CADNEX demo sportsbook'],
        url: abs('/'),
        description: SITE_DESCRIPTION,
        applicationCategory: 'GameApplication',
        applicationSubCategory: 'Sports betting simulator',
        operatingSystem: 'Any (web browser); installable on Android, iOS, Windows and macOS',
        browserRequirements: 'Requires a modern web browser with JavaScript',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        image: abs('/opengraph-image'),
        publisher: { '@id': `${SITE_URL}/#org` },
        featureList: FEATURES.map((f) => f.title),
        audience: { '@type': 'PeopleAudience', suggestedMinAge: 18 },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: HOME_FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  };
}

/** A static example of what a match looks like in the app (illustration, not live data). */
function ExampleCard() {
  return (
    <div className="card relative w-full max-w-[380px] p-5" aria-label="Example of a match in CADNEX">
      <div className="flex items-center justify-between text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-down"><span className="h-1.5 w-1.5 rounded-full bg-down" />67′ · Live</span>
        <span className="text-mute">Example</span>
      </div>
      {[['Home team', '2'], ['Away team', '1']].map(([t, s], i) => (
        <div key={t} className="mt-3 flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: i ? '#2C45B8' : '#A12A6E' }}>{i ? 'AW' : 'HM'}</span>
          <span className="flex-1 text-[15px] font-medium">{t}</span>
          <span className="mono text-[17px]">{s}</span>
        </div>
      ))}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[['1', '1.32'], ['X', '4.60'], ['2', '9.50']].map(([k, o]) => (
          <div key={k} className="flex flex-col items-center rounded-[16px] bg-surface2 py-2.5">
            <span className="text-[11px] text-mute">{k}</span>
            <span className="mono text-[15px]">{o}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-[16px] bg-lime/15 px-4 py-3 text-[13px]">
        <span>10 on Home at 1.32</span>
        <span className="font-medium">Returns 13.20</span>
      </div>
    </div>
  );
}

export function SeoHome() {
  return (
    <div className="seo-home relative min-h-dvh overflow-hidden bg-bg text-ink">
      <JsonLd data={homeSchema()} />
      <Glow />
      <SeoHeader />
      <main className="relative">
        {/* hero */}
        <section className="mx-auto grid max-w-[1100px] items-center gap-12 px-5 pb-16 pt-14 md:grid-cols-[1.25fr_1fr] md:px-8 md:pt-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-surface/70 px-3 py-1.5 text-[13px] text-mute">
              <span className="h-1.5 w-1.5 rounded-full bg-lime" />Free · Virtual money only · 18+
            </p>
            <h1 className="mt-6 text-[44px] font-semibold leading-[0.98] tracking-tightest md:text-[68px]">
              Demo sports betting <span className="text-mute">on real matches.</span>
            </h1>
            <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-mute">
              Bet virtual money on live football, NBA, tennis and cricket. Real fixtures, real scores, odds that move in play, and bets that settle on the real result. Free, with nothing to deposit, ever.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/#/signup" className={pillLime}>Start with {FACTS.startingBalance}</a>
              <a href="/#/live" className={pillSoft}>See live odds</a>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-mute">
              <li className="flex items-center gap-1.5"><BadgeCheck size={15} className="text-lime" />No deposits</li>
              <li className="flex items-center gap-1.5"><BadgeCheck size={15} className="text-lime" />No real money</li>
              <li className="flex items-center gap-1.5"><BadgeCheck size={15} className="text-lime" />Phone, tablet or desktop</li>
            </ul>
          </div>
          <div className="flex justify-center md:justify-end"><ExampleCard /></div>
        </section>

        {/* how it works */}
        <section className="mx-auto max-w-[1100px] px-5 py-14 md:px-8" aria-labelledby="how">
          <h2 id="how" className="text-[32px] font-semibold leading-tight tracking-tighter2 md:text-[40px]">How demo betting works <span className="text-mute">on CADNEX</span></h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-6">
                <span className="mono inline-flex h-9 w-9 items-center justify-center rounded-full bg-lime text-[15px] font-semibold text-onlime">{s.n}</span>
                <h3 className="mt-4 text-[18px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mute">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* features */}
        <section className="mx-auto max-w-[1100px] px-5 py-14 md:px-8" aria-labelledby="features">
          <h2 id="features" className="text-[32px] font-semibold leading-tight tracking-tighter2 md:text-[40px]">Everything a real sportsbook does. <span className="text-mute">With virtual money.</span></h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6">
                <f.icon size={22} strokeWidth={1.6} className="text-lime" aria-hidden />
                <h3 className="mt-4 text-[16.5px] font-semibold">{f.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-mute">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* sports */}
        <section className="mx-auto max-w-[1100px] px-5 py-14 md:px-8" aria-labelledby="sports">
          <h2 id="sports" className="text-[32px] font-semibold leading-tight tracking-tighter2 md:text-[40px]">Real sports, <span className="text-mute">{FACTS.competitionCount}+ competitions</span></h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="card p-6">
              <h3 className="flex items-center gap-2 text-[18px] font-semibold"><Trophy size={19} className="text-lime" aria-hidden />Football</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, UEFA Champions League, Europa League and Conference League, Indian Super League, domestic cups like the FA Cup and Copa del Rey, second divisions and internationals. Match result, double chance, draw no bet, both teams to score, total goals, Asian handicap, correct score and next goal.</p>
            </div>
            <div className="card p-6">
              <h3 className="flex items-center gap-2 text-[18px] font-semibold"><Timer size={19} className="text-lime" aria-hidden />NBA, tennis and cricket</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">NBA moneyline, spread, total points and quarter winners. ATP and WTA tennis with match winner, set betting, total sets and set winners. T20 and one-day cricket with the match winner, live through every innings.</p>
            </div>
          </div>
        </section>

        {/* comparison */}
        <section className="mx-auto max-w-[1100px] px-5 py-14 md:px-8" aria-labelledby="compare">
          <h2 id="compare" className="text-[32px] font-semibold leading-tight tracking-tighter2 md:text-[40px]">Demo betting vs <span className="text-mute">real-money betting</span></h2>
          <p className="mt-4 max-w-[70ch] text-[16px] leading-relaxed text-mute">A demo sportsbook is the safest way to learn how odds, markets and bet types work, try strategies, or just enjoy following matches with something on them, without any of the financial risk.</p>
          <div className="card mt-8 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[15px]">
              <thead>
                <tr className="text-mute"><th scope="col" className="px-6 py-4 font-normal"><span className="sr-only">Feature</span></th><th scope="col" className="px-6 py-4 font-medium text-ink">CADNEX (demo)</th><th scope="col" className="px-6 py-4 font-normal">Real-money sportsbook</th></tr>
              </thead>
              <tbody>
                {COMPARE.map(([k, a, b]) => (
                  <tr key={k} className="border-t hair"><th scope="row" className="px-6 py-3.5 font-normal">{k}</th><td className="px-6 py-3.5 font-medium">{a}</td><td className="px-6 py-3.5 text-mute">{b}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* guides */}
        <section className="mx-auto max-w-[1100px] px-5 py-14 md:px-8" aria-labelledby="learn">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="learn" className="text-[32px] font-semibold leading-tight tracking-tighter2 md:text-[40px]">Learn while <span className="text-mute">you play</span></h2>
            <a href="/guides" className="text-[14.5px] text-mute hover:text-ink">All guides →</a>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GUIDES.map((g) => (
              <a key={g.slug} href={`/guides/${g.slug}`} className="card block p-6 transition-colors hover:bg-surface2">
                <h3 className="text-[17px] font-semibold leading-snug">{g.h1}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-mute">{g.description}</p>
              </a>
            ))}
          </div>
        </section>

        {/* faq */}
        <section className="mx-auto max-w-[860px] px-5 py-14 md:px-8" aria-labelledby="faq">
          <h2 id="faq" className="text-[32px] font-semibold leading-tight tracking-tighter2 md:text-[40px]">Questions, <span className="text-mute">answered</span></h2>
          <div className="mt-8 flex flex-col gap-3">
            {HOME_FAQ.map((f) => (
              <details key={f.q} className="card group p-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[16.5px] font-medium">
                  <h3>{f.q}</h3><span className="text-mute transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="px-6 pb-6 text-[15.5px] leading-relaxed text-mute">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* final call */}
        <section className="mx-auto max-w-[1100px] px-5 py-16 md:px-8">
          <div className="card flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div>
              <h2 className="text-[28px] font-semibold leading-tight tracking-tighter2 md:text-[34px]">Ready to try it? <span className="text-mute">It’s free.</span></h2>
              <p className="mt-2 text-[15.5px] text-mute">Real matches, virtual money, no risk. Takes a minute to sign up.</p>
            </div>
            <a href="/#/signup" className={pillLime}>Create a free account</a>
          </div>
        </section>
      </main>
      <SeoFooter />
    </div>
  );
}
