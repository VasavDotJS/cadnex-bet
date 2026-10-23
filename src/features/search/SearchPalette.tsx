/** Command-palette search for teams, leagues and players (Ctrl/Cmd + K on desktop). */
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BASKETBALL_TEAMS } from '../../data/basketball';
import { CRICKET_TEAMS } from '../../data/cricket';
import { ESPORTS_TEAMS } from '../../data/esports';
import { FOOTBALL_TEAMS } from '../../data/football';
import { LEAGUES } from '../../data/leagues';
import { TENNIS_PLAYERS } from '../../data/tennis';
import type { SportId } from '../../data/types';
import { Crest } from '../../components/Crest';
import { Sheet } from '../../components/Sheet';
import { SportGlyph } from '../../components/SportGlyph';
import { useLive } from '../../store/live';
import { useUi } from '../../store/ui';

interface Entry { kind: 'team' | 'league' | 'player'; sport: SportId; id: string; name: string; sub: string; colors?: [string, string]; short?: string; teamId?: string }

function buildIndex(): Entry[] {
  const out: Entry[] = [];
  for (const l of LEAGUES) out.push({ kind: 'league', sport: l.sport, id: l.id, name: l.name, sub: l.region });
  const teams: [SportId, { id: string; name: string; short: string; colors: [string, string]; players?: { name: string }[] }[]][] = [
    ['football', FOOTBALL_TEAMS], ['basketball', BASKETBALL_TEAMS], ['cricket', CRICKET_TEAMS], ['esports', ESPORTS_TEAMS], ['tennis', TENNIS_PLAYERS],
  ];
  for (const [sport, list] of teams) {
    for (const t of list) {
      out.push({ kind: sport === 'tennis' ? 'player' : 'team', sport, id: t.id, name: t.name, sub: LEAGUES.find((l) => l.sport === sport && l.teams.includes(t.id))?.name ?? '', colors: t.colors, short: t.short, teamId: t.id });
      for (const p of t.players ?? []) out.push({ kind: 'player', sport, id: `${t.id}:${p.name}`, name: p.name, sub: t.name, teamId: t.id, colors: t.colors, short: t.short });
    }
  }
  return out;
}

export function SearchPalette() {
  const open = useUi((s) => s.search);
  const set = useUi((s) => s.setSearch);
  const [q, setQ] = useState('');
  const events = useLive((s) => s.events);
  const nav = useNavigate();
  const index = useMemo(buildIndex, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); set(!useUi.getState().search); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const n = norm(s);
    return index.filter((e) => norm(e.name).includes(n) || (e.short && norm(e.short) === n)).sort((a, b) => (norm(a.name).startsWith(n) ? 0 : 1) - (norm(b.name).startsWith(n) ? 0 : 1)).slice(0, 24);
  }, [q, index]);
  const go = (e: Entry) => {
    set(false);
    setQ('');
    if (e.kind === 'league') { nav(`/sports/${e.sport}/${e.id}`); return; }
    const tid = e.teamId!;
    const next = Object.values(events)
      .filter((ev) => ev.sport === e.sport && (ev.home.id === tid || ev.away.id === tid) && ev.status !== 'FINISHED')
      .sort((a, b) => (a.status === 'LIVE' ? -1 : 0) - (b.status === 'LIVE' ? -1 : 0) || a.startTime - b.startTime)[0];
    if (next) nav(`/event/${next.id}`);
    else {
      const lg = LEAGUES.find((l) => l.sport === e.sport && l.teams.includes(tid));
      nav(lg ? `/sports/${e.sport}/${lg.id}` : `/sports/${e.sport}`);
      useUi.getState().toast({ tone: 'neutral', title: `No upcoming match for ${e.kind === 'player' ? e.sub || e.name : e.name} right now` });
    }
  };
  return (
    <Sheet open={open} onClose={() => set(false)} title="Search" tall>
      <label className="sticky top-0 z-10 mb-3 flex h-12 items-center gap-2 rounded-full bg-surface2 px-4">
        <Search size={17} strokeWidth={1.5} className="text-mute" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && results[0] && go(results[0])} placeholder="Teams, leagues, players" aria-label="Search" className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint" />
      </label>
      {!q && <p className="px-1 py-6 text-[14px] text-mute">Try “Arsenal”, “Sinner”, “IPL” or “ZywOo”.</p>}
      {q && !results.length && <p className="px-1 py-6 text-[14px] text-mute">Nothing matches “{q}”.</p>}
      <div className="flex flex-col">
        {results.map((e) => (
          <button key={`${e.kind}-${e.sport}-${e.id}`} onClick={() => go(e)} className="flex h-14 items-center gap-3 rounded-[18px] px-2 text-left hover:bg-surface2">
            {e.colors ? <Crest p={{ id: e.id, name: e.kind === 'player' && e.sport !== 'tennis' ? e.sub : e.name, short: e.short ?? e.name.slice(0, 3), colors: e.colors }} sport={e.sport} size={34} /> : <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface2"><SportGlyph sport={e.sport} size={17} /></span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium">{e.name}</span><span className="block truncate text-[12.5px] text-mute">{e.kind === 'league' ? 'League' : e.kind === 'team' ? 'Team' : 'Player'} · {e.sub}</span></span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
