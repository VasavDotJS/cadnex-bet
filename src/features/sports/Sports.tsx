/** Sports browser and Live Centre. */
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LEAGUES, leagueById, SPORTS } from '../../data/leagues';
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
  const league = params.league;
  const [day, setDay] = useState(0);
  const ids = useDayIds(day, sport, league);
  const events = useLive((s) => s.events);
  const ready = useLive((s) => s.ready);
  const finished = useFinishedIds(8, sport === 'all' ? undefined : sport);
  const leagues = LEAGUES.filter((l) => sport === 'all' || l.sport === sport);
  const grouped = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const id of ids) {
      const e = events[id];
      if (!e) continue;
      if (!g.has(e.leagueId)) g.set(e.leagueId, []);
      g.get(e.leagueId)!.push(id);
    }
    return [...g.entries()].sort((a, b) => LEAGUES.findIndex((l) => l.id === a[0]) - LEAGUES.findIndex((l) => l.id === b[0]));
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = league ? leagueById(league).name.split(' ') : sport === 'all' ? ['All', 'sports'] : [SPORTS.find((s) => s.id === sport)!.name, 'markets'];
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <PageTitle a={title[0]} b={title.slice(1).join(' ') || 'fixtures'} />
      <SportPills value={sport} onChange={(s) => nav(s === 'all' ? '/sports' : `/sports/${s}`)} />
      {sport !== 'all' && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <Chip active={!league} onClick={() => nav(`/sports/${sport}`)}>All leagues</Chip>
          {leagues.map((l) => <Chip key={l.id} active={league === l.id} onClick={() => nav(`/sports/${sport}/${l.id}`)}>{l.name}</Chip>)}
        </div>
      )}
      <DateStrip value={day} onChange={setDay} />
      {!ready ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[92px] rounded-[24px]" />)}</div>
      ) : grouped.length === 0 ? (
        <Empty title="No fixtures on this day" body="Pick another day or sport." />
      ) : (
        grouped.map(([lid, list]) => (
          <section key={lid} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <SportGlyph sport={leagueById(lid).sport} size={16} className="text-mute" />
              <p className="text-[14px] font-medium">{leagueById(lid).name}</p>
              <span className="text-[12.5px] text-mute">· {leagueById(lid).region}</span>
            </div>
            {list.map((id) => <MatchRow key={id} id={id} />)}
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
      <p className="-mt-3 flex items-center gap-2 text-[14px] text-mute"><LiveDot />{all.length} in play across {Object.keys(counts).length - 1} sports</p>
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
          ) : sport === s.id ? <Empty key={s.id} title={`No ${s.name.toLowerCase()} in play right now`} body="Check Starting soon on the Sports tab." /> : null,
        )
      )}
      {finished.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="px-1 text-[15px] font-medium">Just <span className="text-mute">finished</span></p>
          {finished.map((id) => <MatchRow key={id} id={id} showLeague />)}
        </section>
      )}
    </div>
  );
}
