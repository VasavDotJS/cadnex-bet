/** Event detail: the match is the centrepiece. */
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bell, BellRing, ChartNoAxesColumn, Settings2, Share2, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { focusEvent } from '../../app/bridge';
import { leagueById } from '../../data/leagues';
import type { EventPublic, Incident } from '../../engine/types';
import { Orbs } from '../../components/Ambient';
import { Crest } from '../../components/Crest';
import { DotMatrix } from '../../components/DotMatrix';
import { LiveWave, MomentumBars, MomentumDial, StatBars, StatTiles } from '../../components/instruments';
import { EventStatus, MarketBlock, scoreOf } from '../../components/match';
import { press, spring } from '../../components/motion';
import { Chip, countdown, Empty, kickoffLabel, LiveTag, Tabs, useNow } from '../../components/ui';
import { useLive } from '../../store/live';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';

const KIND_MARK: Partial<Record<Incident['kind'], string>> = {
  goal: '●', red: '▮', yellow: '▮', penalty: '◎', nogoal: '✕', wicket: 'W', six: '6', four: '4', break: '◆', set: '■', map: '■', end: '■', start: '▶', period: '│',
};

function Rail({ ev }: { ev: EventPublic }) {
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  const user = useSession((s) => s.user);
  const nav = useNavigate();
  const favKey = `${ev.sport}:${ev.home.id}`;
  const fav = !!settings?.favourites.includes(favKey);
  const followed = !!settings?.followed.includes(ev.id);
  const need = () => { if (!user) { nav('/login', { state: { from: `/event/${ev.id}` } }); return true; } return false; };
  const items = [
    { label: fav ? `Unfavourite ${ev.home.name}` : `Favourite ${ev.home.name}`, icon: <Star size={18} strokeWidth={1.5} className={fav ? 'fill-lime text-lime' : ''} />, on: () => { if (need() || !settings) return; void update({ favourites: fav ? settings.favourites.filter((f) => f !== favKey) : [...settings.favourites, favKey] }); useUi.getState().toast({ tone: 'neutral', title: fav ? `${ev.home.name} removed from favourites` : `${ev.home.name} added to favourites` }); } },
    { label: 'Jump to stats', icon: <ChartNoAxesColumn size={18} strokeWidth={1.5} />, on: () => document.getElementById('event-tabs')?.dispatchEvent(new CustomEvent('stats')) },
    { label: 'Share', icon: <Share2 size={18} strokeWidth={1.5} />, on: async () => {
      const url = window.location.href;
      try { if (navigator.share) await navigator.share({ title: `${ev.home.name} v ${ev.away.name}`, url }); else { await navigator.clipboard.writeText(url); useUi.getState().toast({ tone: 'neutral', title: 'Link copied' }); } } catch { /* cancelled */ }
    } },
    { label: followed ? 'Stop alerts' : 'Alert me on big moments', icon: followed ? <BellRing size={18} strokeWidth={1.5} className="text-lime" /> : <Bell size={18} strokeWidth={1.5} />, on: () => { if (need() || !settings) return; void update({ followed: followed ? settings.followed.filter((f) => f !== ev.id) : [...settings.followed, ev.id] }); useUi.getState().toast({ tone: 'neutral', title: followed ? 'Alerts off for this match' : 'You will get alerts for this match' }); } },
    { label: 'Odds and display settings', icon: <Settings2 size={18} strokeWidth={1.5} />, on: () => nav('/settings') },
  ];
  return (
    <div className="glass absolute right-3 top-24 z-10 flex flex-col gap-1 rounded-full p-1.5 md:right-5">
      {items.map((it) => (
        <motion.button key={it.label} whileTap={press} onClick={it.on} aria-label={it.label} title={it.label} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface2">
          {it.icon}
        </motion.button>
      ))}
    </div>
  );
}

function Scoreboard({ ev }: { ev: EventPublic }) {
  const now = useNow(1000);
  const [sh, sa] = scoreOf(ev);
  const numeric = /^\d+$/.test(sh) && /^\d+$/.test(sa);
  const live = ev.status === 'LIVE';
  const clockDigits = /^[\d'+:–-]+$/.test(ev.clock.replace(/\s/g, ''));
  return (
    <div className="flex flex-col items-center">
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-2">
          <Crest p={ev.home} sport={ev.sport} size={64} />
          {ev.serving === 0 && <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-label="Serving or batting" />}
        </div>
        <div className="flex flex-col items-center">
          {ev.status === 'SCHEDULED' ? (
            <div className="flex flex-col items-center">
              <span className="text-[12px] text-mute">Starts in</span>
              <DotMatrix text={countdown(ev.startTime - now).replace(/[hm]/g, '').replace(/\s+/g, ':')} dot={5} />
            </div>
          ) : numeric ? (
            <div className="flex items-center gap-3">
              <DotMatrix text={sh} dot={7} />
              <span className="text-[26px] text-mute">:</span>
              <DotMatrix text={sa} dot={7} />
            </div>
          ) : (
            <div className="mono flex flex-col items-center gap-1 text-[22px] font-medium">
              <span>{sh}</span>
              <span className="text-mute">{sa}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <Crest p={ev.away} sport={ev.sport} size={64} />
          {ev.serving === 1 && <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-label="Serving or batting" />}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {live && <LiveTag />}
        {live && clockDigits ? <DotMatrix text={ev.clock.replace(/\s/g, '')} dot={3} className="text-ink" still /> : <EventStatus ev={ev} now={now} />}
        {live && !clockDigits && <span className="num text-[13px]">{ev.clock}</span>}
        <span className="text-[13px] text-mute">{ev.status === 'SCHEDULED' ? kickoffLabel(ev.startTime) : ev.period}</span>
      </div>
      <LiveWave pressure={ev.pressure} live={live} className="mt-2 w-full max-w-[420px]" />
      {ev.lines.length > 0 && (
        <div className="mt-3 w-full max-w-[460px] overflow-hidden rounded-[20px] bg-surface2/70">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-mute">
                <th className="px-4 py-2 text-left font-normal"> </th>
                <th className="px-3 py-2 text-right font-normal">{ev.home.short}</th>
                <th className="px-4 py-2 text-right font-normal">{ev.away.short}</th>
              </tr>
            </thead>
            <tbody>
              {ev.lines.map((l, i) => (
                <tr key={i} className="border-t hair">
                  <td className="px-4 py-2 text-mute">{l.label}</td>
                  <td className="num px-3 py-2 text-right">{l.home}</td>
                  <td className="num px-4 py-2 text-right">{l.away}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Timeline({ ev }: { ev: EventPublic }) {
  if (!ev.incidents.length) return <Empty title="Nothing has happened yet" body={ev.status === 'SCHEDULED' ? 'The timeline fills in once the match starts.' : undefined} />;
  return (
    <ol className="relative flex flex-col gap-1 pl-2">
      <span className="absolute bottom-3 left-[51px] top-3 w-px bg-[rgb(var(--line)/0.08)]" aria-hidden />
      <AnimatePresence initial={false}>
        {ev.incidents.map((i) => (
          <motion.li key={i.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className={`relative flex items-start gap-4 rounded-[18px] py-2.5 pr-3 ${i.major ? 'bg-surface' : ''}`}>
            <span className="mono w-[34px] shrink-0 pt-0.5 text-right text-[12.5px] text-mute">{i.clock.length > 7 ? i.clock.slice(0, 7) : i.clock}</span>
            <span className={`relative z-[1] mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${i.kind === 'goal' || i.kind === 'set' || i.kind === 'map' ? 'bg-lime text-onlime' : i.kind === 'red' ? 'bg-down text-white' : i.kind === 'yellow' ? 'bg-warn text-black' : i.kind === 'wicket' ? 'bg-lavender text-black' : 'bg-surface3 text-mute'}`} aria-hidden>
              {KIND_MARK[i.kind] ?? ''}
            </span>
            <p className={`min-w-0 text-[14px] leading-snug ${i.major ? 'font-medium' : 'text-mute'}`}>
              {i.side !== undefined && <span className="mr-1.5 text-[12px] text-faint">{i.side === 0 ? ev.home.short : ev.away.short}</span>}
              {i.text}
            </p>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

export function EventPage() {
  const { id = '' } = useParams();
  const ev = useLive((s) => s.events[id]);
  const ready = useLive((s) => s.ready);
  const [tab, setTab] = useState<'markets' | 'stats' | 'timeline'>('markets');
  const [group, setGroup] = useState('All');
  const nav = useNavigate();
  useEffect(() => {
    focusEvent(id);
    return () => focusEvent(null);
  }, [id]);
  useEffect(() => {
    const el = document.getElementById('event-tabs');
    const go = () => { setTab('stats'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    el?.addEventListener('stats', go);
    return () => el?.removeEventListener('stats', go);
  });
  const markets = useMemo(() => {
    if (!ev) return [];
    const visible = ev.markets.filter((m) => !m.closed || m.status === 'SETTLED' || m.status === 'VOID');
    return visible.sort((a, b) => {
      const sa = a.status === 'SETTLED' || a.status === 'VOID' ? 1 : 0;
      const sb = b.status === 'SETTLED' || b.status === 'VOID' ? 1 : 0;
      return sa - sb || a.order - b.order;
    });
  }, [ev]);
  const groups = useMemo(() => ['All', ...Array.from(new Set(markets.filter((m) => m.status !== 'SETTLED' && m.status !== 'VOID').map((m) => m.group)))], [markets]);
  if (!ev) {
    return ready ? (
      <div className="px-4 pt-10 md:px-0"><Empty title="This match is no longer listed" body="Finished matches are cleared after a few hours." action={<Link to="/live" className="rounded-full bg-surface2 px-4 py-2.5 text-[14px]">Live matches</Link>} /></div>
    ) : <div className="px-4 pt-10 md:px-0"><div className="skeleton h-[420px] rounded-card" /></div>;
  }
  const lg = leagueById(ev.leagueId);
  const shown = markets.filter((m) => group === 'All' || m.group === group);
  const openCount = markets.filter((m) => m.status !== 'SETTLED' && m.status !== 'VOID').length;
  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden px-4 pb-6 pt-[max(16px,env(safe-area-inset-top))] md:rounded-card md:bg-surface/40 md:px-8 lg:mt-1">
        <Orbs palette={ev.status === 'LIVE' ? 'live' : 'calm'} intensity={ev.status === 'LIVE' ? 0.9 : 0.5} />
        <div className="relative flex items-center gap-2">
          <motion.button whileTap={press} onClick={() => (window.history.length > 1 ? nav(-1) : nav('/live'))} aria-label="Back" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface/70 backdrop-blur">
            <ArrowLeft size={19} strokeWidth={1.5} />
          </motion.button>
          <span className="truncate text-[13px] text-mute">{lg.name}</span>
        </div>
        <Rail ev={ev} />
        {/* E. editorial header */}
        <h1 className="relative mt-6 max-w-[calc(100%-64px)] text-[40px] font-semibold leading-[0.98] tracking-tighter2 md:text-[56px]">
          <span className="block">{ev.home.name}</span>
          <span className="block text-mute">{ev.away.name}</span>
        </h1>
        <div className="relative mt-4 flex max-w-[calc(100%-64px)] flex-wrap gap-1.5">
          <Chip>{lg.name}</Chip>
          {ev.venue && <Chip>{ev.venue}</Chip>}
          <Chip>{kickoffLabel(ev.startTime)}</Chip>
          <Chip>{ev.round}</Chip>
        </div>
        <div className="relative mt-8">
          <Scoreboard ev={ev} />
        </div>
      </section>

      {ev.status !== 'SCHEDULED' && (
        <section className="grid gap-4 px-4 md:grid-cols-[auto_1fr] md:px-0">
          <div className="card flex items-center justify-center p-5"><MomentumDial ev={ev} size={200} /></div>
          <div className="card flex flex-col justify-between p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-[15px] font-medium">Momentum <span className="text-mute">over time</span></p>
              <span className="text-[12px] text-mute"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-lime" />{ev.home.short} <span className="ml-2 mr-1 inline-block h-2 w-2 rounded-full bg-lavender" />{ev.away.short}</span>
            </div>
            <MomentumBars values={ev.momentumHistory} height={120} />
          </div>
        </section>
      )}

      <section id="event-tabs" className="flex scroll-mt-24 flex-col gap-4 px-4 md:px-0">
        <Tabs id="evtabs" value={tab} onChange={setTab} tabs={[
          { id: 'markets', label: 'Markets', count: openCount },
          { id: 'stats', label: 'Stats' },
          { id: 'timeline', label: 'Timeline', count: ev.incidents.length },
        ]} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-col gap-3">
            {tab === 'markets' && (
              <>
                {groups.length > 2 && (
                  <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
                    {groups.map((g) => <Chip key={g} active={g === group} onClick={() => setGroup(g)}>{g}</Chip>)}
                  </div>
                )}
                {ev.markets.length === 0 ? (
                  <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[110px] rounded-[24px]" />)}</div>
                ) : shown.length === 0 ? (
                  <Empty title="No markets open" body={ev.status === 'FINISHED' ? 'This match has finished and all markets are settled.' : 'Markets reopen after the next stoppage.'} />
                ) : (
                  shown.map((m, i) => <MarketBlock key={m.id} ev={ev} m={m} defaultOpen={i < 5 && m.status !== 'SETTLED' && m.status !== 'VOID'} />)
                )}
              </>
            )}
            {tab === 'stats' && (ev.status === 'SCHEDULED' ? <Empty title="Stats appear once the match starts" /> : (
              <>
                <StatTiles ev={ev} />
                <div className="card p-5"><StatBars rows={ev.stats} /></div>
              </>
            ))}
            {tab === 'timeline' && <Timeline ev={ev} />}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
