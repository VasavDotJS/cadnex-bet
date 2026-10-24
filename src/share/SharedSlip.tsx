/** Opened from a shared story or link: shows a friend's picks and copies them into your slip. */
import { motion } from 'framer-motion';
import { ArrowRight, Radio } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Crest } from '../components/Crest';
import { LiveDot } from '../components/ui';
import { press, spring } from '../components/motion';
import { useOddsFmt, toSlipSel } from '../components/OddsButton';
import { findSelection, useLive } from '../store/live';
import { SlipSel, useSlip } from '../store/slip';
import { useUi } from '../store/ui';
import { parseShare } from './link';

export function SharedSlip() {
  const { user, legs } = useParams();
  const nav = useNavigate();
  const fmt = useOddsFmt();
  const events = useLive((s) => s.events);
  const ready = useLive((s) => s.ready);
  const shared = useMemo(() => parseShare(user, legs), [user, legs]);

  const rows = useMemo(() => (shared?.picks ?? []).map((p) => {
    const ev = events[p.eventId];
    const f = findSelection(ev, p.marketKey, p.code);
    const sel: SlipSel | null = ev && f && ev.status !== 'FINISHED' ? toSlipSel(ev, f.market, f.selection) : null;
    const open = !!sel && f!.market.status === 'OPEN' && !(ev!.suspendedUntil && ev!.suspendedUntil > Date.now());
    return { p, ev, f, sel, open };
  }), [shared, events]);

  const usable = rows.filter((r) => r.sel);
  const total = usable.reduce((a, r) => a * r.sel!.odds, 1);

  const add = () => {
    const sels = usable.map((r) => r.sel!);
    useSlip.getState().replace(sels);
    if (sels.length > 1) useSlip.getState().setMode('parlay');
    useUi.getState().toast({ tone: 'neutral', title: `${sels.length} pick${sels.length > 1 ? 's' : ''} added to your slip`, body: 'Prices are today’s, not the ones in the story.' });
    nav('/', { replace: true });
    if (window.innerWidth < 1024) setTimeout(() => useUi.getState().setSlip('half'), 350);
  };

  if (!shared) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 pt-[max(24px,env(safe-area-inset-top))] md:px-0">
        <h1 className="text-[30px] font-semibold tracking-tighter2">That link <span className="text-mute">looks broken</span></h1>
        <p className="text-[15px] text-mute">Ask your friend to share it again.</p>
        <Link to="/" className="rounded-full bg-surface2 px-5 py-3 text-[14px]">Go home</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(24px,env(safe-area-inset-top))] md:px-0 lg:pt-6">
      <div className="relative overflow-hidden rounded-[32px] p-6" style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgb(124 108 246 / 0.45), transparent 60%), radial-gradient(90% 90% at 100% 100%, rgb(181 242 61 / 0.18), transparent 60%), rgb(var(--surface))' }}>
        <p className="text-[12.5px] font-medium tracking-[0.18em] text-lavender">SHARED SLIP</p>
        <h1 className="mt-2 text-[32px] font-semibold leading-[1.05] tracking-tighter2">@{shared.user}<span className="text-mute"> shared {shared.picks.length} pick{shared.picks.length > 1 ? 's' : ''}</span></h1>
        {usable.length > 1 && <p className="mt-3 text-[14px] text-mute">Combined odds now <span className="mono text-ink">{fmt(total)}</span></p>}
      </div>

      <div className="flex flex-col gap-2">
        {!ready && [0, 1].map((i) => <div key={i} className="skeleton h-[78px] rounded-[22px]" />)}
        {ready && rows.map((r, i) => (
          <motion.div key={`${r.p.eventId}${r.p.marketKey}${r.p.code}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.06 }} className={`flex items-center gap-3 rounded-[22px] bg-surface p-4 ${r.sel ? '' : 'opacity-60'}`}>
            {r.ev ? (
              <div className="flex -space-x-2"><Crest p={r.ev.home} sport={r.ev.sport} size={30} /><Crest p={r.ev.away} sport={r.ev.sport} size={30} /></div>
            ) : <span className="h-[30px] w-[30px] rounded-full bg-surface3" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{r.f?.selection.label ?? 'Unavailable pick'}</p>
              <p className="truncate text-[12.5px] text-mute">
                {r.ev ? `${r.f?.market.name ?? 'Market closed'} · ${r.ev.home.name} v ${r.ev.away.name}` : 'This match has finished or is no longer listed'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {r.sel ? <p className="mono text-[15px] font-medium">{fmt(r.sel.odds)}</p> : <p className="text-[12px] text-mute">Unavailable</p>}
              {r.ev?.status === 'LIVE' && <p className="inline-flex items-center gap-1 text-[11px] text-down"><LiveDot />{r.ev.clock}</p>}
              {r.sel && !r.open && <p className="text-[11px] text-mute">Paused</p>}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <motion.button whileTap={press} onClick={add} disabled={!usable.length} className="flex h-14 items-center justify-center gap-2 rounded-full bg-lime text-[16px] font-semibold text-onlime disabled:opacity-40">
          {usable.length ? <>Copy {usable.length === shared.picks.length ? 'these picks' : `${usable.length} available pick${usable.length > 1 ? 's' : ''}`}<ArrowRight size={18} /></> : 'Nothing left to copy'}
        </motion.button>
        <Link to="/live" className="flex h-12 items-center justify-center gap-2 rounded-full text-[14px] text-mute hover:text-ink"><Radio size={16} />Watch live matches</Link>
      </div>
      <p className="pb-6 text-center text-[12px] text-faint">CADNEX uses virtual money only. 18+.</p>
    </div>
  );
}
