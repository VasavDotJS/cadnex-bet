/** Sports browser and Live Centre. */
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leagueById, leagueOrder, SPORTS } from '../../data/leagues';
import { FeedBadge } from '../../components/FeedBadge';
import type { SportId } from '../../data/types';
import { DateStrip } from '../../components/instruments';
import { MatchRow } from '../../components/match';
import { press, spring } from '../../components/motion';
import { SportGlyph } from '../../components/SportGlyph';
import { Chip, Empty, LiveDot, TwoTone } from '../../components/ui';
import { useLive } from '../../store/live';
import { useDayIds, useFinishedIds, useLiveIds } from '../../store/selectors';
import { DemoBadge } from '../shell/Shell';

function SportPills({ value, onChange, counts }: { value: SportId | 'all'; onChange: (s: SportId | 'all') => void; counts?: Record<string, number> }) {
  const items: { id: SportId | 'all'; name: string }[] = [{ id: 'all', name: 'All' }, ...SPORTS];
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      {items.map((s) => {
        const on = s.id === value;
        return (
          <motion.button key={s.id} whileTap={press} onClick={() => onChange(s.id)} aria-pressed={on} className={`relative flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] ${on ? 'text-onpill' : 'bg-surface2 text-mute hover:text-ink'}`}>
            {on && <motion.span layoutId="sportpill" className="absolute inset-0 rounded-full bg-pill" transition={spring} />}
            {s.id !== 'all' && <SportGlyph sport={s.id} size={17} className="relative" />}
            <span className="relative">{s.name}</span>
            {counts && counts[s.id] !== undefined && <span className={`num relative text-[12px] ${on ? 'text-onpill/60' : 'text-faint'}`}>{counts[s.id]}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

function PageTitle({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <TwoTone a={a} b={b} size="xl" as="h1" />
      <DemoBadge className="mt-2 lg:hidden" />
    </div>
  );
}

export function Sports() {
  const params = useParams<{ sport?: SportId; league?: string }>();
  const nav = useNavigate();
  const sport = (params.sport as SportId | undefined) ?? 'all';
  const league = params.league ? decodeURIComponent(params.league) : undefined;
  const [day, setDay] = useState(0);
  const ids = useDayIds(day, sport, league);
  const events = useLive((s) => s.events);
  const ready = useLive((s) => s.ready);
  const finished = useFinishedIds(8, sport === 'all' ? undefined : sport);
  // competitions with matches this week, for the chips
  const leagueKey = Object.values(events).filter((e) => e.status !== 'FINISHED' && (sport === 'all' || e.sport === sport)).map((e) => e.leagueId).sort().join(',');
  const leagues = useMemo(() => Array.from(new Set(leagueKey ? leagueKey.split(',') : [])).sort((a, b) => leagueOrder(a) - leagueOrder(b)).map((id) => leagueById(id)), [leagueKey]);
  // group by competition; tennis groups by tournament
  const grouped = useMemo(() => {
    const g = new Map<string, { name: string; sport: SportId; region: string; order: number; ids: string[] }>();
    for (const id of ids) {
      const e = events[id];
      if (!e) continue;
      const k = `${e.leagueId}|${e.leagueName}`;
      if (!g.has(k)) {
        const lg = leagueById(e.leagueId);
        g.set(k, { name: e.leagueName, sport: e.sport, region: e.sport === 'tennis' ? lg.name : lg.region, order: leagueOrder(e.leagueId), ids: [] });
      }
      g.get(k)!.ids.push(id);
    }
    return [...g.entries()].sort((a, b) => a[1].order - b[1].order || a[1].name.localeCompare(b[1].name));
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = league ? leagueById(league).name.split(' ') : sport === 'all' ? ['All', 'sports'] : [SPORTS.find((s) => s.id === sport)?.name ?? 'All', 'fixtures'];
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <PageTitle a={title[0]} b={title.slice(1).join(' ') || 'fixtures'} />
      <SportPills value={sport} onChange={(s) => nav(s === 'all' ? '/sports' : `/sports/${s}`)} />
      {sport !== 'all' && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <Chip active={!league} onClick={() => nav(`/sports/${sport}`)}>All leagues</Chip>
          {leagues.map((l) => <Chip key={l.id} active={league === l.id} onClick={() => nav(`/sports/${sport}/${encodeURIComponent(l.id)}`)}>{l.name}</Chip>)}
        </div>
      )}
      <DateStrip value={day} onChange={setDay} />
      {!ready ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[92px] rounded-[24px]" />)}</div>
      ) : grouped.length === 0 ? (
        <Empty title="No fixtures on this day" body="Pick another day or sport. Fixtures appear here as the competitions publish them." />
      ) : (
        grouped.map(([k, g]) => (
          <section key={k} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <SportGlyph sport={g.sport} size={16} className="text-mute" />
              <p className="text-[14px] font-medium">{g.name}</p>
              {g.region && <span className="text-[12.5px] text-mute">· {g.region}</span>}
            </div>
            {g.ids.map((id) => <MatchRow key={id} id={id} />)}
          </section>
        ))
      )}
      {day === 0 && finished.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="px-1 text-[14px] font-medium">Recent <span className="text-mute">results</span></p>
          {finished.filter((id) => !league || events[id]?.leagueId === league).map((id) => <MatchRow key={id} id={id} showLeague />)}
        </section>
      )}
    </div>
  );
}

export function LiveCentre() {
  const [sport, setSport] = useState<SportId | 'all'>('all');
  const all = useLiveIds();
  const events = useLive((s) => s.events);
  const ready = useLive((s) => s.ready);
  const finished = useFinishedIds(6, sport === 'all' ? undefined : sport);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const id of all) { const s = events[id]?.sport; if (s) c[s] = (c[s] ?? 0) + 1; }
    return c;
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const bySport = SPORTS.filter((s) => sport === 'all' || s.id === sport).map((s) => ({ s, ids: all.filter((id) => events[id]?.sport === s.id) }));
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <PageTitle a="Live" b="matches" />
      <div className="-mt-3 flex flex-wrap items-center gap-3 text-[14px] text-mute"><span className="flex items-center gap-2"><LiveDot />{all.length} in play across {Object.keys(counts).length - 1} sport{Object.keys(counts).length === 2 ? '' : 's'}</span><FeedBadge /></div>
      <SportPills value={sport} onChange={setSport} counts={counts} />
      {!ready ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[92px] rounded-[24px]" />)}</div>
      ) : (
        bySport.map(({ s, ids }) =>
          ids.length ? (
            <section key={s.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <SportGlyph sport={s.id} size={17} className="text-mute" />
                <p className="text-[15px] font-medium">{s.name}</p>
                <span className="num text-[13px] text-mute">{ids.length}</span>
              </div>
              {ids.map((id) => <MatchRow key={id} id={id} showLeague />)}
            </section>
          ) : sport === s.id ? <Empty key={s.id} title={`No ${s.name.toLowerCase()} in play right now`} body="Upcoming fixtures are on the Sports tab." /> : null,
        )
      )}
      {ready && all.length === 0 && sport === 'all' && <Empty title="Nothing is in play right now" body="Real matches appear here the moment they kick off. Upcoming fixtures are on the Sports tab." />}
      {finished.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="px-1 text-[15px] font-medium">Just <span className="text-mute">finished</span></p>
          {finished.map((id) => <MatchRow key={id} id={id} showLeague />)}
        </section>
      )}
    </div>
  );
}
