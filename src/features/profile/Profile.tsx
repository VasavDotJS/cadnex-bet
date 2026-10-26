/** Profile, statistics and settings. */
import { motion } from 'framer-motion';
import { ChevronRight, Download, LogOut, Pencil, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useCanInstall, useInstall } from '../../pwa/install';
import { adminApi } from '../../admin/api';
import { useOpenWrapped } from '../../wrapped/Wrapped';
import { useSync } from '../../cloud/sync';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBalanceStats } from '../../components/cards';
import { press } from '../../components/motion';
import { Sheet } from '../../components/Sheet';
import { Sparkline } from '../../components/Sparkline';
import { SportGlyph } from '../../components/SportGlyph';
import { Avatar, Pill, Toggle, TwoTone } from '../../components/ui';
import { SPORTS } from '../../data/leagues';
import { ODDS_FORMATS } from '../../lib/odds';
import { formatMoney } from '../../lib/money';
import { AuthError, authService } from '../../services/authService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-[22px] bg-surface2 p-4">
      <p className="text-[12px] text-mute">{label}</p>
      <p className={`num mt-1 text-[22px] font-medium tracking-tighter2 ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : ''}`}>{value}</p>
    </div>
  );
}

/** Where the account is: saved to the cloud, uploading, or waiting for a connection. */
function SyncLine() {
  const { status, lastSync } = useSync();
  const [label, tone] =
    status === 'synced' ? ['Saved to your account', 'bg-up'] :
    status === 'syncing' ? ['Saving to your account…', 'bg-warn'] :
    status === 'offline' || status === 'error' ? ['Offline. Changes save when you reconnect', 'bg-mute'] :
    ['Connecting to your account…', 'bg-mute'];
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-mute" title={lastSync ? `Last synced ${new Date(lastSync).toLocaleTimeString()}` : undefined}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />{label}
    </p>
  );
}

export function Profile() {
  const user = useSession((s) => s.user)!;
  const wallet = useSession((s) => s.wallet);
  const st = useBalanceStats();
  const nav = useNavigate();
  const [pw, setPw] = useState(false);
  const [del, setDel] = useState(false);
  const [pwf, setPwf] = useState({ current: '', next: '' });
  const [err, setErr] = useState('');
  const canInstall = useCanInstall();
  const openWrapped = useOpenWrapped();
  // only shown to admins; the panel itself is still guarded by the database and a 2FA code
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { adminApi.whoami().then((w) => setIsAdmin(!!w.admin), () => setIsAdmin(false)); }, [user.id]);
  if (!wallet || !st) return null;
  const s = st.all;
  const code = wallet.currency;
  const changePw = async () => {
    try {
      await authService.changePassword(user.email, pwf.current, pwf.next);
      setPw(false);
      setPwf({ current: '', next: '' });
      useUi.getState().toast({ tone: 'neutral', title: 'Password changed' });
    } catch (e) { setErr(e instanceof AuthError ? e.message : 'Could not change password.'); }
  };
  const remove = async () => {
    try {
      await authService.deleteAccount();
    } catch (e) {
      useUi.getState().toast({ tone: 'error', title: e instanceof AuthError ? e.message : 'Could not delete the account.' });
      return;
    }
    await useSession.getState().forget();
    nav('/', { replace: true });
  };
  const inputCls = 'h-12 w-full rounded-[16px] bg-surface2 px-4 text-[15px] outline-none focus:ring-2 focus:ring-lime';
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <div className="flex items-center gap-4">
        <motion.button whileTap={press} onClick={() => useUi.getState().setAccount(true, 'edit')} aria-label="Change avatar" className="relative">
          <Avatar seed={user.avatarSeed} name={user.username} size={72} ring={isAdmin} />
          <span className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface text-mute shadow"><Pencil size={13} /></span>
        </motion.button>
        <div className="min-w-0">
          <h1 className="truncate text-[30px] font-semibold leading-none tracking-tighter2">{user.username}</h1>
          <p className="mt-1 truncate text-[14px] text-mute">{user.email} · since {new Date(user.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}</p>
          <SyncLine />
        </div>
      </div>

      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <TwoTone a="Profit" b="& loss" size="sm" />
          <span className={`num text-[22px] font-medium tracking-tighter2 ${s.pl > 0n ? 'text-up' : s.pl < 0n ? 'text-down' : ''}`}>{formatMoney(s.pl, code, { sign: true })}</span>
        </div>
        <Sparkline values={s.plSeries.length > 1 ? s.plSeries : [0, 0]} width={600} height={140} stroke={s.pl >= 0n ? 'rgb(var(--up))' : 'rgb(var(--down))'} baseline={0} className="mt-3 h-[140px] w-full" />
        <p className="mt-1 text-[12px] text-mute">Across {s.settled} settled bet{s.settled === 1 ? '' : 's'}</p>
      </section>

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <Stat label="Win rate" value={s.won + s.lost ? `${Math.round(s.winRate * 100)}%` : '—'} />
        <Stat label="ROI" value={s.staked > 0n ? `${(s.roi * 100).toFixed(1)}%` : '—'} tone={s.roi > 0 ? 'up' : s.roi < 0 ? 'down' : undefined} />
        <Stat label="Biggest win" value={s.biggestWin > 0n ? formatMoney(s.biggestWin, code, { compact: true }) : '—'} />
        <Stat label="Longest streak" value={`${s.longestStreak}`} />
        <Stat label="Total staked" value={formatMoney(s.staked, code, { compact: true })} />
        <div className="rounded-[22px] bg-surface2 p-4">
          <p className="text-[12px] text-mute">Favourite sport</p>
          <p className="mt-1 flex items-center gap-2 text-[18px] font-medium">{s.favouriteSport ? <><SportGlyph sport={s.favouriteSport} size={18} />{SPORTS.find((x) => x.id === s.favouriteSport)?.name}</> : '—'}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-card bg-surface">
        {[
          { label: 'Your week, wrapped', on: () => openWrapped('week'), icon: <Sparkles size={17} strokeWidth={1.5} className="text-lavender" /> },
          { label: 'Your month, wrapped', on: () => openWrapped('month'), icon: <Sparkles size={17} strokeWidth={1.5} className="text-lavender" /> },
          { label: 'Edit profile', on: () => useUi.getState().setAccount(true, 'edit') },
          { label: 'Change password', on: () => { setErr(''); setPw(true); } },
          { label: 'Settings', to: '/settings' },
          { label: 'Responsible gaming', to: '/responsible', icon: <ShieldCheck size={17} strokeWidth={1.5} className="text-mute" /> },
          { label: 'Help and betting rules', to: '/help' },
          ...(isAdmin ? [{ label: 'Admin panel', to: '/admin', icon: <ShieldCheck size={17} strokeWidth={1.5} className="text-up" /> }] : []),
          ...(canInstall ? [{ label: 'Install the app', on: () => void useInstall.getState().install(), icon: <Download size={17} strokeWidth={1.5} className="text-mute" /> }] : []),
        ].map((it) => it.to ? (
          <Link key={it.label} to={it.to} className="flex h-14 items-center gap-3 border-b hair px-5 text-[15px] last:border-0 hover:bg-surface2">{it.icon}<span className="flex-1">{it.label}</span><ChevronRight size={17} strokeWidth={1.5} className="text-mute" /></Link>
        ) : (
          <button key={it.label} onClick={it.on} className="flex h-14 w-full items-center gap-3 border-b hair px-5 text-left text-[15px] last:border-0 hover:bg-surface2">{it.icon}<span className="flex-1">{it.label}</span><ChevronRight size={17} strokeWidth={1.5} className="text-mute" /></button>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <Pill onClick={async () => { await useSession.getState().logOut(); nav('/', { replace: true }); }}><LogOut size={16} strokeWidth={1.5} />Log out</Pill>
        <Pill tone="danger" onClick={() => setDel(true)}><Trash2 size={16} strokeWidth={1.5} />Delete account</Pill>
      </div>

      <Sheet open={pw} onClose={() => setPw(false)} title={<>Change <span className="text-mute">password</span></>}>
        <div className="flex flex-col gap-3">
          <input type="password" placeholder="Current password" value={pwf.current} onChange={(e) => setPwf({ ...pwf, current: e.target.value })} aria-label="Current password" autoComplete="current-password" className={inputCls} />
          <input type="password" placeholder="New password (8+ characters)" value={pwf.next} onChange={(e) => setPwf({ ...pwf, next: e.target.value })} aria-label="New password" autoComplete="new-password" className={inputCls} />
          {err && <p className="text-[13px] text-down">{err}</p>}
          <Pill tone="lime" size="lg" onClick={changePw}>Update password</Pill>
        </div>
      </Sheet>
      <Sheet open={del} onClose={() => setDel(false)} title={<>Delete <span className="text-mute">account</span></>}>
        <p className="text-[14.5px] text-mute">This permanently deletes {user.username}: the login, the wallet, every bet and the full history, on every device. It cannot be undone.</p>
        <div className="mt-5 flex gap-2">
          <Pill className="flex-1" onClick={() => setDel(false)}>Keep account</Pill>
          <Pill tone="danger" className="flex-1" onClick={remove}>Delete everything</Pill>
        </div>
      </Sheet>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b hair px-5 py-4 last:border-0">
      <div className="min-w-0"><p className="text-[15px]">{label}</p>{hint && <p className="mt-0.5 text-[12.5px] text-mute">{hint}</p>}</div>
      {children}
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-1 rounded-full bg-surface2 p-1">
      {options.map((o) => (
        <button key={String(o.id)} role="radio" aria-checked={o.id === value} onClick={() => onChange(o.id)} className={`h-9 rounded-full px-3 text-[13px] ${o.id === value ? 'bg-pill text-onpill' : 'text-mute hover:text-ink'}`}>{o.label}</button>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  if (!settings) return null;
  return (
    <div className="flex flex-col gap-6 px-4 pt-[max(20px,env(safe-area-inset-top))] md:px-0 lg:pt-4">
      <TwoTone a="Your" b="settings" size="xl" as="h1" />
      <section className="overflow-hidden rounded-card bg-surface">
        <Row label="Theme"><Seg label="Theme" value={settings.theme} onChange={(v) => void update({ theme: v })} options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }, { id: 'system', label: 'Auto' }]} /></Row>
        <Row label="Reduced motion" hint="Replace movement with simple fades"><Seg label="Reduced motion" value={settings.reducedMotion} onChange={(v) => void update({ reducedMotion: v })} options={[{ id: 'system', label: 'Auto' }, { id: 'on', label: 'On' }, { id: 'off', label: 'Off' }]} /></Row>
        <Row label="Hide balance" hint="Show •••• instead of your balance"><Toggle on={settings.hideBalance} onChange={(v) => void update({ hideBalance: v })} label="Hide balance" /></Row>
      </section>
      <section className="overflow-hidden rounded-card bg-surface">
        <div className="border-b hair px-5 py-4">
          <p className="text-[15px]">Odds format</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {ODDS_FORMATS.map((f) => (
              <button key={f.id} onClick={() => void update({ oddsFormat: f.id })} aria-pressed={settings.oddsFormat === f.id} className={`rounded-[16px] p-3 text-left ${settings.oddsFormat === f.id ? 'bg-pill text-onpill' : 'bg-surface2'}`}>
                <span className="block text-[13.5px] font-medium">{f.name}</span>
                <span className={`mono block text-[12px] ${settings.oddsFormat === f.id ? 'text-onpill/60' : 'text-mute'}`}>{f.sample}</span>
              </button>
            ))}
          </div>
        </div>
        <Row label="When prices change" hint="What the slip does if odds move before you place"><Seg label="Odds changes" value={settings.oddsChange} onChange={(v) => void update({ oddsChange: v })} options={[{ id: 'any', label: 'Accept any' }, { id: 'higher', label: 'Higher only' }, { id: 'ask', label: 'Ask me' }]} /></Row>
      </section>
      <section className="overflow-hidden rounded-card bg-surface">
        <Row label="Big moments in my matches" hint="Goals, breaks and wickets in matches you bet on or follow"><Toggle on={settings.notifyGoals} onChange={(v) => void update({ notifyGoals: v })} label="Match alerts" /></Row>
        <Row label="Settled bets" hint="A notification when a bet settles"><Toggle on={settings.notifySettled} onChange={(v) => void update({ notifySettled: v })} label="Settlement alerts" /></Row>
      </section>
    </div>
  );
}
