/** App shell: desktop header + sidebar + slip panel; mobile floating nav + slip sheet. */
import { LayoutGroup, motion } from 'framer-motion';
import { Bell, ChevronDown, House, Radio, Search, Ticket, Trophy, Wallet } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { leagueOrder, SPORTS } from '../../data/leagues';
import { FeedBadge } from '../../components/FeedBadge';
import { CdnxLockup, CdnxMark } from '../../components/Brand';
import { Crest } from '../../components/Crest';
import { Money } from '../../components/Money';
import { press, spring } from '../../components/motion';
import { SportGlyph } from '../../components/SportGlyph';
import { Avatar } from '../../components/ui';
import { useLive } from '../../store/live';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { SlipPanel } from '../slip/BetSlip';
import { useUnread } from '../notifications/Notifications';

export function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full bg-lavender/15 px-2.5 text-[11.5px] font-medium text-lavender ${className}`} title="CADNEX runs on virtual funds only">
      <span className="h-1.5 w-1.5 rounded-full bg-lavender" />Demo · virtual funds
    </span>
  );
}

export function Logo({ className = '', lockup = false, markClass }: { className?: string; lockup?: boolean; markClass?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center text-ink ${className}`} aria-label="CADNEX home">
      {lockup ? <CdnxLockup className={markClass ?? 'h-[40px]'} /> : <CdnxMark className={markClass ?? 'h-[17px]'} />}
    </Link>
  );
}

const NO_FAVS: string[] = [];

const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/sports', label: 'Sports', icon: Trophy },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/bets', label: 'My Bets', icon: Ticket },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
];

/** G. Floating frosted pill navigation (mobile). */
export function BottomNav() {
  const loc = useLocation();
  const liveCount = useLive((s) => Object.values(s.events).filter((e) => e.status === 'LIVE').length);
  const openBets = useSession((s) => s.bets.filter((b) => b.status === 'OPEN' || b.status === 'PARTIALLY_CASHED_OUT').length);
  const active = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.to ?? (loc.pathname.startsWith('/event') ? '/live' : '');
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-[max(14px,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:hidden">
      <LayoutGroup id="bottomnav">
        <div className="glass flex items-center gap-1 rounded-full p-1.5">
          {NAV.map((n) => {
            const on = n.to === active;
            const Icon = n.icon;
            const badge = n.to === '/live' ? liveCount : n.to === '/bets' ? openBets : 0;
            return (
              <NavLink key={n.to} to={n.to} end={n.end} aria-label={n.label} className="relative">
                <motion.span whileTap={press} className={`relative flex h-12 items-center justify-center gap-2 rounded-full ${on ? 'px-4' : 'w-12'}`}>
                  {on && <motion.span layoutId="navpill" className="absolute inset-0 rounded-full bg-pill" transition={spring} />}
                  <Icon size={20} strokeWidth={1.5} className={`relative ${on ? 'text-onpill' : 'text-mute'}`} />
                  {on && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative text-[13.5px] font-medium text-onpill">{n.label}</motion.span>}
                  {!on && badge > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-lime" />}
                </motion.span>
              </NavLink>
            );
          })}
        </div>
      </LayoutGroup>
    </nav>
  );
}

function DesktopHeader() {
  const user = useSession((s) => s.user);
  const wallet = useSession((s) => s.wallet);
  const hidden = useSession((s) => s.settings?.hideBalance ?? false);
  const unread = useUnread();
  return (
    <header className="sticky top-0 z-30 hidden h-[72px] items-center gap-4 border-b hair bg-bg/80 px-6 backdrop-blur-xl lg:flex">
      <Logo />
      <DemoBadge />
      <FeedBadge className="hidden 2xl:inline-flex" />
      <nav className="ml-4 flex items-center gap-1" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `relative rounded-full px-3.5 py-2 text-[14px] transition-colors ${isActive ? 'text-ink' : 'text-mute hover:text-ink'}`}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="topnav" className="absolute inset-0 rounded-full bg-surface2" transition={spring} />}
                <span className="relative">{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => useUi.getState().setSearch(true)} className="flex h-10 w-[260px] items-center gap-2 whitespace-nowrap rounded-full bg-surface2 px-4 text-[13.5px] text-mute hover:text-ink" aria-label="Search">
          <Search size={16} strokeWidth={1.5} /> <span className="truncate">Search teams and players</span>
          <kbd className="ml-auto rounded-md bg-surface3 px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
        </button>
        {user && wallet ? (
          <>
            <Link to="/wallet" className="flex h-10 items-center gap-2 rounded-full bg-surface2 pl-4 pr-1.5">
              <Money amount={BigInt(wallet.balanceMinor)} code={wallet.currency} opts={{ hidden, trim: true }} className="text-[14px] font-medium" />
              <span className="rounded-full bg-lime px-3 py-1.5 text-[13px] font-medium text-onlime">Deposit</span>
            </Link>
            <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface2">
              <Bell size={19} strokeWidth={1.5} />
              {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lime" />}
            </Link>
            <Link to="/profile" aria-label="Profile"><Avatar seed={user.avatarSeed} name={user.username} size={38} /></Link>
          </>
        ) : (
          <>
            <Link to="/login" className="rounded-full px-4 py-2 text-[14px] text-mute hover:text-ink">Log in</Link>
            <Link to="/signup" className="rounded-full bg-lime px-4 py-2 text-[14px] font-medium text-onlime">Sign up</Link>
          </>
        )}
      </div>
    </header>
  );
}

function Sidebar() {
  const events = useLive((s) => s.events);
  const [open, setOpen] = useState<Record<string, boolean>>({ football: true });
  // competitions that actually have matches this week, in catalogue order
  const leaguesBySport = useMemo(() => {
    const m = new Map<string, { id: string; name: string; sport: string; live: number; total: number }>();
    for (const e of Object.values(events)) {
      if (e.status === 'FINISHED') continue;
      const k = e.leagueId;
      const cur = m.get(k) ?? { id: k, name: e.sport === 'tennis' ? (e.leagueId === 'atp' ? 'ATP Tour' : 'WTA Tour') : e.leagueName, sport: e.sport, live: 0, total: 0 };
      cur.total++;
      if (e.status === 'LIVE') cur.live++;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => leagueOrder(a.id) - leagueOrder(b.id) || a.name.localeCompare(b.name));
  }, [events]);
  const favs = useSession((s) => s.settings?.favourites) ?? NO_FAVS;
  return (
    <aside className="sticky top-[84px] hidden max-h-[calc(100dvh-100px)] w-[240px] shrink-0 overflow-y-auto pb-6 xl:block" aria-label="Sports and leagues">
      <p className="px-3 pb-2 text-[12px] text-mute">Sports</p>
      {SPORTS.map((s) => {
        const leagues = leaguesBySport.filter((l) => l.sport === s.id);
        const live = leagues.reduce((a, l) => a + l.live, 0);
        if (!leagues.length) return null;
        const isOpen = !!open[s.id];
        return (
          <div key={s.id} className="mb-1">
            <button onClick={() => setOpen({ ...open, [s.id]: !isOpen })} aria-expanded={isOpen} className="flex h-11 w-full items-center gap-3 rounded-full px-3 text-[14px] hover:bg-surface2">
              <SportGlyph sport={s.id} size={18} className="text-mute" />
              <span className="flex-1 text-left">{s.name}</span>
              {live > 0 && <span className="num rounded-full bg-down/12 px-2 py-0.5 text-[11px] text-down">{live}</span>}
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={spring} className="text-mute"><ChevronDown size={15} strokeWidth={1.5} /></motion.span>
            </button>
            {isOpen && (
              <div className="ml-7 flex flex-col border-l hair pl-2">
                {leagues.map((l) => (
                  <NavLink key={l.id} to={`/sports/${s.id}/${encodeURIComponent(l.id)}`} className={({ isActive }) => `flex h-9 items-center justify-between rounded-full px-3 text-[13px] ${isActive ? 'bg-surface2 text-ink' : 'text-mute hover:text-ink'}`}>
                    <span className="truncate">{l.name}</span>
                    <span className="num text-[11px] text-faint">{l.total}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {favs.length > 0 && (
        <>
          <p className="px-3 pb-2 pt-4 text-[12px] text-mute">Favourites</p>
          {favs.slice(0, 8).map((f) => {
            const [sport, id] = f.split(':');
            const ev = Object.values(events).find((e) => e.sport === sport && (e.home.id === id || e.away.id === id) && e.status !== 'FINISHED');
            const p = ev ? (ev.home.id === id ? ev.home : ev.away) : null;
            return p ? (
              <Link key={f} to={`/event/${ev!.id}`} className="flex h-10 items-center gap-2.5 rounded-full px-3 text-[13px] text-mute hover:bg-surface2 hover:text-ink">
                <Crest p={p} sport={ev!.sport} size={20} /> <span className="truncate">{p.name}</span>
              </Link>
            ) : null;
          })}
        </>
      )}
    </aside>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <DesktopHeader />
      <div className="mx-auto flex w-full max-w-[1520px] gap-6 lg:px-6 lg:pt-3">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-[140px] lg:pb-16">{children}</main>
        <div id="slip-anchor" className="hidden w-[360px] shrink-0 lg:block">
          <SlipPanel />
        </div>
      </div>
      <footer className="mx-auto max-w-[1520px] px-6 pb-[160px] pt-6 text-[12px] leading-relaxed text-faint lg:pb-10">
        <p>CADNEX uses virtual money only. Fixtures and scores come from ESPN’s public data and can run up to a minute behind live TV. Prices are CADNEX’s own. No affiliation with ESPN or any league, team or player.</p>
        <p className="mt-1"><Link to="/help" className="underline-offset-2 hover:underline">Help & betting rules</Link> · <Link to="/responsible" className="underline-offset-2 hover:underline">Responsible gaming</Link> · 18+</p>
      </footer>
      <BottomNav />
    </div>
  );
}
