/** Bet slip: right panel on desktop, draggable bottom sheet on mobile. */
import { AnimatePresence, motion, PanInfo, useDragControls } from 'framer-motion';
import { useShare } from '../../share/store';
import { Check, ChevronDown, Delete, Lock, Share2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { leagueById } from '../../data/leagues';
import { requestSettlement } from '../../core/bridge';
import { useOddsFmt } from '../../components/OddsButton';
import { gentle, press, snappy, spring } from '../../components/motion';
import { Pill, Tabs } from '../../components/ui';
import { currency } from '../../lib/currencies';
import { convertMinor, formatMoney, Minor, pow10, toE4, toPlain } from '../../lib/money';
import { BetError, betService, NewBet, shortRef, OddsChangedError } from '../../services/betService';
import { WalletError } from '../../services/walletService';
import { checkLimits } from '../responsible/limits';
import { useSession } from '../../store/session';
import { SlipSel, useSlip } from '../../store/slip';
import { useUi } from '../../store/ui';
import { loadBooking, saveBooking, SlipRow, useSlipModel } from './model';

type Field = { kind: 'single'; id: string } | { kind: 'parlay' } | { kind: 'system' } | { kind: 'all' };

function useCoarse(): boolean {
  const [c, setC] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const on = () => setC(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return c;
}

export function quickStakes(code: string): Minor[] {
  return [10, 50, 100].map((usd) => {
    const raw = convertMinor(BigInt(usd) * 100n, 'USD', code);
    const d = currency(code).decimals;
    const n = Number(raw) / Number(pow10(d));
    if (n < 1) return raw;
    const mag = Math.pow(10, Math.floor(Math.log10(n)));
    const nice = Math.max(1, Math.round(n / mag)) * mag;
    return BigInt(Math.round(nice)) * pow10(d);
  });
}

function fieldValue(f: Field): string {
  const s = useSlip.getState();
  if (f.kind === 'single') return s.stakes[f.id] ?? '';
  if (f.kind === 'parlay') return s.parlayStake;
  if (f.kind === 'system') return s.systemStake;
  return s.allStake;
}

function setField(f: Field, v: string): void {
  const s = useSlip.getState();
  if (f.kind === 'single') s.setStake(f.id, v);
  else if (f.kind === 'parlay') s.setParlayStake(v);
  else if (f.kind === 'system') s.setSystemStake(v);
  else s.setAllStake(v);
}

function sanitize(v: string, code: string): string {
  const d = currency(code).decimals;
  let s = v.replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  if (d === 0) s = s.replace('.', '');
  const [a, b] = s.split('.');
  if (b !== undefined && b.length > d) s = `${a}.${b.slice(0, d)}`;
  if (a && a.length > 1 && a.startsWith('0') && !a.startsWith('0.')) s = s.replace(/^0+/, '') || '0';
  return s.slice(0, 16);
}

function StakeInput({ field, active, onFocus, code, coarse, label }: { field: Field; active: boolean; onFocus: () => void; code: string; coarse: boolean; label: string }) {
  const value = useSlip((s) => (field.kind === 'single' ? s.stakes[field.id] ?? '' : field.kind === 'parlay' ? s.parlayStake : field.kind === 'system' ? s.systemStake : s.allStake));
  const cur = currency(code);
  return (
    <label className={`flex h-12 items-center gap-2 rounded-[16px] bg-surface2 px-4 transition-shadow ${active ? 'ring-2 ring-lime' : ''}`}>
      <span className="text-[12px] text-mute">{label}</span>
      <input
        value={value}
        onFocus={onFocus}
        onClick={onFocus}
        readOnly={coarse}
        inputMode={coarse ? 'none' : 'decimal'}
        onChange={(e) => setField(field, sanitize(e.target.value, code))}
        placeholder="0"
        aria-label={`${label} in ${code}`}
        className="mono w-full min-w-0 bg-transparent text-right text-[17px] outline-none placeholder:text-faint"
      />
      <span className="text-[13px] text-mute">{cur.kind === 'crypto' ? cur.code : cur.symbol}</span>
    </label>
  );
}

/** Numeric keypad modelled on the crypto swap screen. */
export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <motion.button
          key={k}
          whileTap={{ scale: 0.92 }}
          transition={snappy}
          onClick={() => { onKey(k); if (navigator.vibrate) navigator.vibrate(5); }}
          className="flex h-[46px] items-center justify-center rounded-[14px] bg-surface2 text-[20px] font-medium active:bg-surface3"
          aria-label={k === '⌫' ? 'Delete' : k === '.' ? 'Decimal point' : k}
        >
          {k === '⌫' ? <Delete size={22} strokeWidth={1.5} /> : k}
        </motion.button>
      ))}
    </div>
  );
}

function RowView({ r, onRemove, children }: { r: SlipRow; onRemove: () => void; children?: React.ReactNode }) {
  const fmt = useOddsFmt();
  const accept = () => useSlip.getState().accept(r.sel.id, r.liveOdds);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }} transition={spring} className={`rounded-[20px] bg-surface p-3.5 ${r.conflict ? 'ring-1 ring-warn/50' : ''}`} style={{ boxShadow: 'inset 0 1px 0 rgb(var(--edge) / var(--edge-a))' }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium">{r.sel.label}</p>
          <p className="truncate text-[12.5px] text-mute">{r.sel.marketName}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-mute">{r.sel.home} v {r.sel.away} · {leagueById(r.sel.leagueId).short}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {!r.available && !r.finished && <Lock size={13} className="text-mute" aria-label="Suspended" />}
            {r.changed && r.needsAccept && <span className="mono text-[13px] text-faint line-through">{fmt(r.sel.odds)}</span>}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={r.liveOdds} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className={`mono text-[16px] font-medium ${r.changed === 'up' ? 'text-up' : r.changed === 'down' ? 'text-down' : ''}`}>
                {fmt(r.liveOdds)}
              </motion.span>
            </AnimatePresence>
          </div>
          <button onClick={onRemove} aria-label={`Remove ${r.sel.label}`} className="-mr-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-mute hover:bg-surface2 hover:text-ink">
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      {r.finished && <p className="mt-2 text-[12.5px] text-down">This market has closed.</p>}
      {r.needsAccept && (
        <button onClick={accept} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-warn/15 px-3 text-[12.5px] font-medium text-warn">
          Price changed · Accept {fmt(r.liveOdds)}
        </button>
      )}
      {children}
    </motion.div>
  );
}

export function SlipContent({ onDone }: { onDone?: () => void }) {
  const model = useSlipModel();
  const slip = useSlip();
  const user = useSession((s) => s.user);
  const fmt = useOddsFmt();
  const coarse = useCoarse();
  const nav = useNavigate();
  const [field, setFieldState] = useState<Field | null>(null);
  const [phase, setPhase] = useState<'idle' | 'placing' | 'done'>('idle');
  const [placed, setPlaced] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const cur = model.currency;
  const chips = useMemo(() => quickStakes(cur), [cur]);

  const activeField: Field = field ?? (model.mode === 'parlay' ? { kind: 'parlay' } : model.mode === 'system' ? { kind: 'system' } : slip.sameStake || model.rows.length > 1 ? { kind: 'all' } : model.rows[0] ? { kind: 'single', id: model.rows[0].sel.id } : { kind: 'all' });

  const onKey = (k: string) => {
    const v = fieldValue(activeField);
    const next = k === '⌫' ? v.slice(0, -1) : sanitize(v + k, cur);
    setField(activeField, next);
  };

  const chip = (amt: Minor) => setField(activeField, toPlain(amt, cur));
  const max = () => {
    const bal = model.balance;
    if (activeField.kind === 'system') setField(activeField, toPlain(model.lines ? bal / BigInt(model.lines) : 0n, cur));
    else if (activeField.kind === 'all') setField(activeField, toPlain(model.rows.length ? bal / BigInt(model.rows.length) : 0n, cur));
    else setField(activeField, toPlain(bal, cur));
  };

  const place = async () => {
    if (!user) { nav('/login', { state: { from: '/' } }); return; }
    if (!model.ready) return;
    setPhase('placing');
    const latency = 400 + Math.random() * 500;
    await new Promise((r) => setTimeout(r, latency));
    // re-check prices after the latency window
    const fresh = useSlipModelSnapshot();
    if (!fresh) { setPhase('idle'); return; }
    const legOf = (r: SlipRow) => {
      const odds = r.changed && !r.needsAccept ? r.liveOdds : r.sel.odds;
      return {
        selectionId: r.sel.id, eventId: r.sel.eventId, marketKey: r.sel.marketKey, code: r.sel.code, sport: r.sel.sport, leagueId: r.sel.leagueId,
        home: r.sel.home, away: r.sel.away, marketName: r.sel.marketName, label: r.sel.label, odds, oddsE4: toE4(odds).toString(), startTime: r.sel.startTime,
        live: r.ev?.status === 'LIVE',
      };
    };
    const bets: NewBet[] = [];
    if (model.mode === 'single') {
      for (const r of model.rows) {
        const st = model.stakes.single[r.sel.id];
        if (st && st > 0n) bets.push({ type: 'SINGLE', legs: [legOf(r)], stakeMinor: st });
      }
    } else if (model.mode === 'parlay') {
      bets.push({ type: 'PARLAY', legs: model.rows.map(legOf), stakeMinor: model.stakes.parlay! });
    } else {
      const type = model.systemTypes.find((t) => t.id === slip.systemType) ?? model.systemTypes[0];
      bets.push({ type: 'SYSTEM', systemType: type.id, legs: model.rows.map(legOf), stakeMinor: model.stakes.system! * BigInt(model.lines) });
    }
    try {
      const rows = await betService.place(user.id, bets, (total, c) => checkLimits(user.id, total, c));
      setPlaced(rows.map((b) => shortRef(b.id)));
      setPhase('done');
      await useSession.getState().refreshAll();
      useUi.getState().toast({ tone: 'neutral', title: rows.length > 1 ? `${rows.length} bets placed` : 'Bet placed', body: `Ref ${rows.map((b) => shortRef(b.id)).join(', ')}`, action: { label: 'Share story', to: `/bets?share=${rows[0].id}` } }, 6500);
      requestSettlement();
      setTimeout(() => {
        useSlip.getState().clear();
        setPhase('idle');
        setPlaced([]);
        onDone?.();
      }, 1700);
    } catch (e) {
      setPhase('idle');
      // the server re-priced the slip: show its prices, so the next tap places at them
      if (e instanceof OddsChangedError) {
        const slipStore = useSlip.getState();
        for (const [id, odds] of Object.entries(e.prices)) {
          if (odds > 1 && slipStore.sels.some((x) => x.id === id && x.odds !== odds)) slipStore.accept(id, odds);
        }
        useUi.getState().toast({ tone: 'neutral', title: 'Odds changed', body: e.message.replace(/^Odds changed: /, '') }, 6500);
        return;
      }
      const msg = e instanceof BetError || e instanceof WalletError || e instanceof Error ? e.message : 'Could not place the bet.';
      useUi.getState().toast({ tone: 'error', title: msg, action: msg.includes('Insufficient') ? { label: 'Top up', to: '/wallet' } : undefined });
    }
  };

  const share = () => {
    if (!slip.sels.length) return;
    saveBooking(slip.sels); // keeps the on-device booking code working too
    useShare.getState().open({ kind: 'slip' });
  };
  const load = () => {
    const sels = loadBooking(code);
    if (!sels) { useUi.getState().toast({ tone: 'error', title: 'That booking code is not on this device' }); return; }
    useSlip.getState().replace(sels as SlipSel[]);
    setCode('');
    useUi.getState().toast({ tone: 'neutral', title: `Loaded ${sels.length} selection${sels.length > 1 ? 's' : ''}` });
  };

  if (phase === 'done') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={gentle} className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...snappy, delay: 0.05 }} className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-lime text-onlime">
          <Check size={30} strokeWidth={2} />
        </motion.span>
        <p className="text-[20px] font-semibold tracking-tighter2">Bet placed</p>
        <p className="text-[14px] text-mute">Ref {placed.join(' · ')}</p>
      </motion.div>
    );
  }

  if (!model.rows.length) {
    return (
      <div className="flex flex-col gap-4 py-6">
        <div className="text-center">
          <p className="text-[16px] font-medium">Your slip is empty</p>
          <p className="mt-1 text-[14px] text-mute">Tap any price to add it here.</p>
        </div>
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Booking code" aria-label="Booking code" className="h-11 min-w-0 flex-1 rounded-full bg-surface2 px-4 text-[14px] uppercase outline-none placeholder:normal-case placeholder:text-faint" />
          <Pill tone="soft" onClick={load} disabled={!code.trim()}>Load</Pill>
        </div>
      </div>
    );
  }

  const modeTabs = [
    { id: 'single' as const, label: 'Single', count: model.rows.length },
    { id: 'parlay' as const, label: 'Parlay' },
    { id: 'system' as const, label: 'System' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Tabs id="slipmode" tabs={modeTabs} value={model.mode} onChange={(m) => {
        if (m === 'parlay' && !model.canParlay) { useUi.getState().toast({ tone: 'error', title: model.parlayReason ?? 'Parlay unavailable' }); return; }
        if (m === 'system' && !model.canSystem) { useUi.getState().toast({ tone: 'error', title: model.rows.length < 3 || model.rows.length > 6 ? 'System bets need 3 to 6 selections.' : model.parlayReason ?? 'System unavailable' }); return; }
        slip.setMode(m);
        setFieldState(null);
      }} />
      {model.mode !== 'single' && model.parlayReason && <p className="text-[12.5px] text-warn">{model.parlayReason}</p>}
      {model.mode === 'single' && model.rows.length > 1 && model.parlayReason && <p className="text-[12.5px] text-mute">{model.parlayReason}</p>}

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {model.rows.map((r) => (
            <RowView key={r.sel.id} r={r} onRemove={() => slip.remove(r.sel.id)}>
              {model.mode === 'single' && model.rows.length > 1 && !slip.sameStake && (
                <div className="mt-3">
                  <StakeInput field={{ kind: 'single', id: r.sel.id }} active={activeField.kind === 'single' && activeField.id === r.sel.id} onFocus={() => setFieldState({ kind: 'single', id: r.sel.id })} code={cur} coarse={coarse} label="Stake" />
                </div>
              )}
            </RowView>
          ))}
        </AnimatePresence>
      </div>

      {model.mode === 'system' && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {model.systemTypes.map((t) => (
            <button key={t.id} onClick={() => slip.setSystemType(t.id)} aria-pressed={(slip.systemType === t.id) || (!model.systemTypes.some((x) => x.id === slip.systemType) && t === model.systemTypes[0])}
              className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium ${(slip.systemType === t.id || (!model.systemTypes.some((x) => x.id === slip.systemType) && t === model.systemTypes[0])) ? 'bg-pill text-onpill' : 'bg-surface2 text-mute'}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-[22px] bg-surface p-3.5" style={{ boxShadow: 'inset 0 1px 0 rgb(var(--edge) / var(--edge-a))' }}>
        {model.mode === 'single' && model.rows.length > 1 && (
          <label className="flex items-center justify-between text-[13px] text-mute">
            Same stake for all
            <input type="checkbox" checked={slip.sameStake} onChange={(e) => slip.setSameStake(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--lime))]" />
          </label>
        )}
        {model.mode === 'single' && (model.rows.length === 1 ? (
          <StakeInput field={{ kind: 'single', id: model.rows[0].sel.id }} active={activeField.kind === 'single'} onFocus={() => setFieldState({ kind: 'single', id: model.rows[0].sel.id })} code={cur} coarse={coarse} label="Stake" />
        ) : slip.sameStake ? (
          <StakeInput field={{ kind: 'all' }} active={activeField.kind === 'all'} onFocus={() => setFieldState({ kind: 'all' })} code={cur} coarse={coarse} label="Each" />
        ) : null)}
        {model.mode === 'parlay' && <StakeInput field={{ kind: 'parlay' }} active onFocus={() => setFieldState({ kind: 'parlay' })} code={cur} coarse={coarse} label="Stake" />}
        {model.mode === 'system' && <StakeInput field={{ kind: 'system' }} active onFocus={() => setFieldState({ kind: 'system' })} code={cur} coarse={coarse} label="Per line" />}

        <div className="flex gap-1.5">
          {chips.map((c) => (
            <motion.button key={c.toString()} whileTap={press} onClick={() => chip(c)} className="mono h-9 flex-1 rounded-full bg-surface2 text-[13px] hover:bg-surface3">
              {formatMoney(c, cur, { trim: true, compact: true })}
            </motion.button>
          ))}
          <motion.button whileTap={press} onClick={max} className="h-9 flex-1 rounded-full bg-surface2 text-[13px] font-medium hover:bg-surface3">Max</motion.button>
        </div>
        {!coarse && model.balance > 0n && activeField.kind !== 'single' && (
          <input
            type="range" min={0} max={1000} step={1} aria-label="Stake slider"
            value={(() => { const v = Number(fieldValue(activeField) || 0); const b = Number(model.balance) / Number(pow10(currency(cur).decimals)); return b ? Math.min(1000, Math.round((v / b) * 1000)) : 0; })()}
            onChange={(e) => {
              const frac = BigInt(e.target.value);
              const lines = activeField.kind === 'system' ? BigInt(model.lines || 1) : activeField.kind === 'all' ? BigInt(model.rows.length || 1) : 1n;
              setField(activeField, toPlain((model.balance * frac) / 1000n / lines, cur));
            }}
            className="w-full accent-[rgb(var(--lime))]"
          />
        )}
        {coarse && <Keypad onKey={onKey} />}

        <div className="mt-1 grid grid-cols-2 gap-y-1 text-[13px]">
          <span className="text-mute">{model.mode === 'system' ? `${model.lines} lines · total stake` : 'Total stake'}</span>
          <span className="mono text-right">{formatMoney(model.totalStake, cur)}</span>
          {model.mode === 'parlay' && (<><span className="text-mute">Total odds</span><span className="mono text-right">{fmt(model.totalOdds)}</span></>)}
          <span className="text-mute">Potential return</span>
          <motion.span key={model.potential.toString()} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="mono text-right text-[16px] font-medium text-ink">{formatMoney(model.potential, cur)}</motion.span>
        </div>
        {model.error && model.totalStake > 0n && (
          <p className="text-[12.5px] text-down">
            {model.error}{' '}
            {model.error.startsWith('Insufficient') && <Link to="/wallet" className="underline">Top up</Link>}
          </p>
        )}
        <Pill tone="lime" size="lg" className="mt-1 w-full" disabled={phase === 'placing' || (!model.ready && !!user)} onClick={place} aria-busy={phase === 'placing'}>
          {phase === 'placing' ? (
            <span className="inline-flex items-center gap-2"><motion.span className="h-4 w-4 rounded-full border-2 border-onlime/30 border-t-onlime" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />Placing</span>
          ) : !user ? 'Log in to place bets' : model.needsAccept ? 'Accept price changes first' : `Place bet${model.totalStake > 0n ? ` · ${formatMoney(model.totalStake, cur)}` : ''}`}
        </Pill>
      </div>
      <div className="flex items-center justify-between px-1">
        <button onClick={share} className="inline-flex h-10 items-center gap-1.5 text-[13px] text-mute hover:text-ink"><Share2 size={15} strokeWidth={1.5} />{'Share as a story'}</button>
        <button onClick={() => slip.clear()} className="inline-flex h-10 items-center gap-1.5 text-[13px] text-mute hover:text-ink"><Trash2 size={15} strokeWidth={1.5} />Clear</button>
      </div>
    </div>
  );
}

/** Read the current model outside React (after the placing delay). */
function useSlipModelSnapshot(): boolean {
  return useSlip.getState().sels.length > 0;
}

/** Floating counter pill (mobile) that pops when selections are added. */
export function SlipPill() {
  const sels = useSlip((s) => s.sels);
  const bump = useSlip((s) => s.bump);
  const snap = useUi((s) => s.slipSnap);
  const setSlip = useUi((s) => s.setSlip);
  const fmt = useOddsFmt();
  const total = sels.reduce((a, s) => a * s.odds, 1);
  return (
    <AnimatePresence>
      {sels.length > 0 && snap === 'closed' && (
        <div key="pillwrap" className="pointer-events-none fixed inset-x-0 bottom-[calc(92px+env(safe-area-inset-bottom))] z-40 flex justify-center lg:hidden">
        <motion.button
          id="slip-pill"
          initial={{ y: 40, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={spring}
          onClick={() => setSlip('full')}
          className="pointer-events-auto flex h-12 items-center gap-3 rounded-full bg-lime pl-2 pr-5 text-onlime shadow-float"
          aria-label={`Open bet slip, ${sels.length} selections`}
        >
          <motion.span key={bump} initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={snappy} className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-full bg-onlime px-2 text-[14px] font-semibold text-lime">
            {sels.length}
          </motion.span>
          <span className="text-[14px] font-medium">Bet slip</span>
          {sels.length > 1 && <span className="mono text-[14px] opacity-70">{fmt(total)}</span>}
        </motion.button>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Mobile bottom sheet with half and full snap points. */
export function SlipSheet() {
  const snap = useUi((s) => s.slipSnap);
  const setSlip = useUi((s) => s.setSlip);
  const count = useSlip((s) => s.sels.length);
  const controls = useDragControls();
  const open = snap !== 'closed';
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const v = info.velocity.y;
    const o = info.offset.y;
    if (v > 700 || o > 180) setSlip(snap === 'full' && o < 360 && v < 1400 ? 'half' : 'closed');
    else if (v < -500 || o < -100) setSlip('full');
  };
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[55] lg:hidden" role="dialog" aria-modal="true" aria-label="Bet slip">
          <motion.div className="absolute inset-0 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSlip('closed')} />
          <motion.div
            className="glass-strong absolute inset-x-0 bottom-0 flex flex-col rounded-t-[32px]"
            initial={{ y: '100%' }}
            animate={{ y: 0, height: snap === 'full' ? '94dvh' : '68dvh' }}
            exit={{ y: '100%' }}
            transition={gentle}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.12, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            <div className="touch-none cursor-grab px-6 pb-2 pt-3" onPointerDown={(e) => controls.start(e)}>
              <div className="flex justify-center"><span className="h-1.5 w-10 rounded-full bg-mute/40" /></div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[20px] font-semibold tracking-tighter2">Bet <span className="text-mute">slip</span>{count > 0 && <span className="ml-2 align-middle text-[13px] font-medium text-mute">{count}</span>}</p>
                <button onClick={() => setSlip(snap === 'full' ? 'half' : 'full')} aria-label={snap === 'full' ? 'Shrink slip' : 'Expand slip'} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-mute">
                  <motion.span animate={{ rotate: snap === 'full' ? 0 : 180 }} transition={spring}><ChevronDown size={18} strokeWidth={1.5} /></motion.span>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
              <SlipContent onDone={() => setSlip('closed')} />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Desktop right-hand panel. */
export function SlipPanel() {
  const count = useSlip((s) => s.sels.length);
  return (
    <aside className="sticky top-[84px] flex max-h-[calc(100dvh-100px)] flex-col overflow-hidden rounded-card bg-surface/60" aria-label="Bet slip">
      <div className="px-5 pb-2 pt-5">
        <p className="text-[20px] font-semibold tracking-tighter2">Bet <span className="text-mute">slip</span>{count > 0 && <span className="ml-2 align-middle text-[13px] font-medium text-mute">{count}</span>}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <SlipContent />
      </div>
    </aside>
  );
}

/** The ghost chip that flies from a price to the slip. */
export function FlyingChip() {
  const fly = useUi((s) => s.fly);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!fly) return;
    const el = document.getElementById('slip-pill') ?? document.getElementById('slip-anchor');
    if (el) {
      const r = el.getBoundingClientRect();
      setTarget({ x: r.left + 24, y: r.top + r.height / 2 });
    } else setTarget({ x: window.innerWidth / 2, y: window.innerHeight - 110 });
  }, [fly]);
  return (
    <AnimatePresence>
      {fly && target && (
        <motion.span
          key={fly.id}
          className="mono pointer-events-none fixed z-[90] rounded-full bg-lime px-2.5 py-1 text-[12px] font-semibold text-onlime shadow-float"
          initial={{ left: fly.x, top: fly.y, x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
          animate={{ left: [fly.x, (fly.x + target.x) / 2 + 40, target.x], top: [fly.y, Math.min(fly.y, target.y) - 80, target.y], scale: [1, 1.05, 0.6], opacity: [1, 1, 0] }}
          transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
          onAnimationComplete={() => useUi.setState({ fly: null })}
        >
          {fly.label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
