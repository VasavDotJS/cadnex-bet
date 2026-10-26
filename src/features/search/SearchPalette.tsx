/** Command-palette search over the real fixtures in the feed: teams, players and competitions. */
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SportId } from '../../data/types';
import { Crest } from '../../components/Crest';
import { Sheet } from '../../components/Sheet';
import { SportGlyph } from '../../components/SportGlyph';
import type { Participant } from '../../engine/types';
import { useEventsWhen } from '../../store/live';
import { useUi } from '../../store/ui';

interface Entry { kind: 'team' | 'league'; sport: SportId; key: string; name: string; sub: string; p?: Participant; eventId?: string; leagueId?: string }

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function SearchPalette() {
  const open = useUi((s) => s.search);
  const set = useUi((s) => s.setSearch);
  const [q, setQ] = useState('');
  const events = useEventsWhen(open);
  const nav = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); set(!useUi.getState().search); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set]);
  const index = useMemo(() => {
    if (!open) return [];
    const out = new Map<string, Entry>();
    // soonest relevant match first: live, then upcoming, then finished
    const list = Object.values(events).sort((a, b) => (a.status === 'LIVE' ? 0 : a.status === 'SCHEDULED' ? 1 : 2) - (b.status === 'LIVE' ? 0 : b.status === 'SCHEDULED' ? 1 : 2) || a.startTime - b.startTime);
    for (const ev of list) {
      const lk = `l:${ev.leagueId}:${ev.leagueName}`;
      if (!out.has(lk)) out.set(lk, { kind: 'league', sport: ev.sport, key: lk, name: ev.leagueName, sub: 'Competition', leagueId: ev.leagueId });
      for (const p of [ev.home, ev.away]) {
        const k = `t:${ev.sport}:${p.name}`;
        if (!out.has(k)) out.set(k, { kind: 'team', sport: ev.sport, key: k, name: p.name, sub: `${ev.status === 'LIVE' ? 'Live now' : ev.status === 'SCHEDULED' ? 'Next match' : 'Last match'} · ${ev.home.short} v ${ev.away.short} · ${ev.leagueName}`, p, eventId: ev.id });
      }
    }
    return [...out.values()];
  }, [events, open]);
  const results = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return [];
    return index.filter((e) => norm(e.name).includes(s) || (e.p && norm(e.p.short) === s)).sort((a, b) => (norm(a.name).startsWith(s) ? 0 : 1) - (norm(b.name).startsWith(s) ? 0 : 1)).slice(0, 24);
  }, [q, index]);
  const go = (e: Entry) => {
    set(false);
    setQ('');
    if (e.kind === 'league') nav(`/sports/${e.sport}/${encodeURIComponent(e.leagueId!)}`);
    else nav(`/event/${encodeURIComponent(e.eventId!)}`);
  };
  return (
    <Sheet open={open} onClose={() => set(false)} title="Search" tall>
      <label className="sticky top-0 z-10 mb-3 flex h-12 items-center gap-2 rounded-full bg-surface2 px-4">
        <Search size={17} strokeWidth={1.5} className="text-mute" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && results[0] && go(results[0])} placeholder="Teams, players, competitions" aria-label="Search" className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint" />
      </label>
      {!q && <p className="px-1 py-6 text-[14px] text-mute">Search any team, player or competition in this week’s fixtures.</p>}
      {q && !results.length && <p className="px-1 py-6 text-[14px] text-mute">Nothing this week matches “{q}”.</p>}
      <div className="flex flex-col">
        {results.map((e) => (
          <button key={e.key} onClick={() => go(e)} className="flex h-14 items-center gap-3 rounded-[18px] px-2 text-left hover:bg-surface2">
            {e.p ? <Crest p={e.p} sport={e.sport} size={34} /> : <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface2"><SportGlyph sport={e.sport} size={17} /></span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium">{e.name}</span><span className="block truncate text-[12.5px] text-mute">{e.sub}</span></span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
