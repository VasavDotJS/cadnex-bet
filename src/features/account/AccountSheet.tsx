/**
 * Account: opened from the bottom dock (mobile) or the avatar (desktop). Switch between the
 * accounts saved on this device, add another, edit the profile, and change the theme.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, Loader2, LogIn, LogOut, Monitor, Moon, Plus, RefreshCw, Settings2, Sun, UserRound, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountCard, MAX_ACCOUNTS, updateAccountCard, useAccounts, forgetAccount } from '../../cloud/accounts';
import { clearLocal } from '../../cloud/sync';
import { ADMIN_SEED, CHARACTERS, CharacterAvatar, characterFor, characterSeed, OWNER } from '../../components/avatars';
import { press, spring } from '../../components/motion';
import { Sheet } from '../../components/Sheet';
import { Avatar, Pill } from '../../components/ui';
import type { SettingsRow } from '../../db/db';
import { AuthError, authService } from '../../services/authService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';

type Theme = SettingsRow['theme'];

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'Auto', icon: Monitor },
];

function ThemePicker() {
  const settings = useSession((s) => s.settings);
  const device = useSession((s) => s.device);
  const theme: Theme = settings?.theme ?? device.theme ?? 'dark';
  const pick = (t: Theme) => {
    const s = useSession.getState();
    if (s.settings) void s.updateSettings({ theme: t });
    void s.updateDevice({ theme: t }); // also the theme while logged out
  };
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-[20px] bg-surface2 p-1">
      {THEMES.map((t) => {
        const on = t.id === theme;
        const Icon = t.icon;
        return (
          <button key={t.id} role="radio" aria-checked={on} onClick={() => pick(t.id)} className="relative flex h-12 items-center justify-center gap-2 rounded-[16px] text-[14px]">
            {on && <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-[16px] bg-pill" transition={spring} />}
            <Icon size={17} strokeWidth={1.6} className={`relative ${on ? 'text-onpill' : 'text-mute'}`} />
            <span className={`relative font-medium ${on ? 'text-onpill' : 'text-mute'}`}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="px-1 pb-2 text-[12.5px] font-medium text-mute">{children}</p>;
}

const inputCls = 'h-12 w-full rounded-[16px] bg-surface2 px-4 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-lime';

/** Your initial in colours (tap again for new ones), or one of the characters. */
function AvatarPicker({ seed, name, onPick }: { seed: number; name: string; onPick: (seed: number) => void }) {
  const isAdmin = useSession((s) => s.isAdmin);
  const isCharacter = !!characterFor(seed);
  const [colours, setColours] = useState(isCharacter ? Math.floor(Math.random() * 360) : seed);
  const chosen = characterFor(seed);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar seed={seed} name={name} size={72} ring={isAdmin} />
        <div className="min-w-0">
          <p className="text-[16px] font-medium">{seed === ADMIN_SEED ? 'You, in 3D' : chosen ? chosen.name : 'Your initial'}</p>
          <p className="text-[13px] text-mute">{seed === ADMIN_SEED ? 'Only you have this one. The gold ring stays whichever you pick.' : chosen ? 'Pick another below, or go back to your initial.' : 'Tap it again for new colours, or pick a character.'}</p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Avatar" className="grid grid-cols-4 gap-2.5 min-[400px]:grid-cols-5">
        <motion.button
          type="button" role="radio" aria-checked={!isCharacter} aria-label="Your initial in colours" whileTap={press}
          onClick={() => { const next = isCharacter ? colours : Math.floor(Math.random() * 360); setColours(next); onPick(next); }}
          className={`relative flex aspect-square items-center justify-center rounded-full p-[3px] ${!isCharacter ? 'bg-lime' : 'bg-transparent'}`}
        >
          <span className="relative inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full [&>span]:!h-full [&>span]:!w-full">
            <Avatar seed={isCharacter ? colours : seed} name={name} size={56} />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface text-mute shadow"><RefreshCw size={11} /></span>
        </motion.button>
        {isAdmin && (
          <motion.button type="button" role="radio" aria-checked={seed === ADMIN_SEED} aria-label="You, in 3D (admin only)" title="You, in 3D" whileTap={press} onClick={() => onPick(ADMIN_SEED)}
            className={`flex aspect-square items-center justify-center rounded-full p-[3px] ${seed === ADMIN_SEED ? 'bg-lime' : 'bg-transparent'}`}>
            <span className="inline-flex h-full w-full overflow-hidden rounded-full [&>span]:!h-full [&>span]:!w-full [&_svg]:!h-full [&_svg]:!w-full">
              <CharacterAvatar c={OWNER} size={56} still={seed !== ADMIN_SEED} />
            </span>
          </motion.button>
        )}
        {CHARACTERS.map((c, i) => {
          const on = seed === characterSeed(i);
          return (
            <motion.button key={c.id} type="button" role="radio" aria-checked={on} aria-label={c.name} title={c.name} whileTap={press} onClick={() => onPick(characterSeed(i))}
              className={`flex aspect-square items-center justify-center rounded-full p-[3px] ${on ? 'bg-lime' : 'bg-transparent'}`}>
              <span className="inline-flex h-full w-full overflow-hidden rounded-full [&>span]:!h-full [&>span]:!w-full [&_svg]:!h-full [&_svg]:!w-full">
                <CharacterAvatar c={c} size={56} still={!on} phase={i * 0.53} />
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** Edit the username, email and avatar, right in the sheet. */
function EditProfile({ onDone }: { onDone: () => void }) {
  const user = useSession((s) => s.user)!;
  const [form, setForm] = useState({ username: user.username, email: user.email });
  const [seed, setSeed] = useState(user.avatarSeed);
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { user: u, emailPending } = await authService.updateProfile(user.id, { ...form, avatarSeed: seed !== user.avatarSeed ? seed : undefined }, user);
      useSession.setState({ user: u });
      updateAccountCard(u.id, { username: u.username, avatarSeed: u.avatarSeed });
      useUi.getState().toast(emailPending
        ? { tone: 'neutral', title: 'Confirm your new email', body: `We sent a link to ${form.email.trim()}. The change applies once you open it.` }
        : { tone: 'neutral', title: 'Profile saved' });
      onDone();
    } catch (x) {
      setErr(x instanceof AuthError ? { field: x.field, msg: x.message } : { field: 'form', msg: 'Could not save. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <AvatarPicker seed={seed} name={form.username || user.username} onPick={setSeed} />
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-[13px] text-mute">Username</span>
        <input value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setErr(null); }} autoComplete="username" className={inputCls} />
        {err?.field === 'username' && <span className="px-1 text-[12.5px] text-down" role="alert">{err.msg}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-[13px] text-mute">Email</span>
        <input type="email" inputMode="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setErr(null); }} autoComplete="email" className={inputCls} />
        {err?.field === 'email' && <span className="px-1 text-[12.5px] text-down" role="alert">{err.msg}</span>}
      </label>
      {err && err.field !== 'username' && err.field !== 'email' && <p className="text-[13px] text-down" role="alert">{err.msg}</p>}
      <div className="flex gap-2">
        <Pill type="button" className="flex-1" onClick={onDone}>Cancel</Pill>
        <Pill tone="lime" type="submit" className="flex-1" disabled={busy}>{busy ? 'Saving' : 'Save'}</Pill>
      </div>
    </form>
  );
}

function AccountRow({ a, active, busy, onPick, onRemove }: { a: AccountCard; active: boolean; busy: boolean; onPick: () => void; onRemove?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-1 border-b hair last:border-0">
      <button onClick={onPick} disabled={active || busy} aria-current={active ? 'true' : undefined} aria-label={active ? `${a.username}, active account` : `Switch to ${a.username}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left enabled:hover:bg-surface2/60">
        <Avatar seed={a.avatarSeed} name={a.username} size={40} ring={a.admin} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{a.username}</span>
          <span className="block truncate text-[12.5px] text-mute">{a.email}</span>
        </span>
        {active && <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-lime text-onlime"><Check size={15} strokeWidth={2.4} /></span>}
        {busy && <Loader2 size={18} className="animate-spin text-mute" />}
      </button>
      {onRemove && !busy && (
        confirm ? (
          <div className="flex shrink-0 items-center gap-1 pr-2">
            <button onClick={() => setConfirm(false)} className="h-9 rounded-full px-3 text-[13px] text-mute hover:text-ink">Keep</button>
            <button onClick={onRemove} className="h-9 rounded-full bg-down/15 px-3 text-[13px] font-medium text-down">Remove</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} aria-label={`Remove ${a.username} from this device`} className="mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-mute hover:bg-surface2 hover:text-ink">
            <X size={16} strokeWidth={1.6} />
          </button>
        )
      )}
    </div>
  );
}

export function AccountSheet() {
  const open = useUi((s) => s.account);
  const startView = useUi((s) => s.accountView);
  const close = () => useUi.getState().setAccount(false);
  const user = useSession((s) => s.user);
  const isAdmin = useSession((s) => s.isAdmin);
  const accounts = useAccounts((s) => s.list);
  const nav = useNavigate();
  const [view, setView] = useState<'main' | 'edit'>('main');
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  useEffect(() => {
    if (open) setView(startView === 'edit' && useSession.getState().user ? 'edit' : 'main');
    else setSwitchingTo(null);
  }, [open, startView]);

  const others = accounts.filter((a) => a.id !== user?.id);
  const saved = user ? accounts.find((a) => a.id === user.id) : undefined;
  const current = user ? { ...(saved ?? { id: user.id, username: user.username, email: user.email, avatarSeed: user.avatarSeed, usedAt: Date.now() }), admin: isAdmin } : null;

  const go = (to: string, state?: unknown) => { close(); nav(to, { state }); };

  const switchTo = async (a: AccountCard) => {
    setSwitchingTo(a.id);
    try {
      await useSession.getState().switchAccount(a.id);
      close();
      useUi.getState().toast({ tone: 'neutral', title: `Switched to ${a.username}` });
    } catch (x) {
      setSwitchingTo(null);
      if (x instanceof AuthError && x.field === 'expired') {
        useUi.getState().toast({ tone: 'neutral', title: 'Log in again', body: x.message });
        go('/login', { add: !!useSession.getState().user || undefined, email: a.email });
        return;
      }
      useUi.getState().toast({ tone: 'error', title: x instanceof AuthError ? x.message : 'Could not switch accounts.' });
    }
  };

  const remove = async (a: AccountCard) => {
    await forgetAccount(a.id);
    await clearLocal(a.id).catch(() => {});
    useUi.getState().toast({ tone: 'neutral', title: `${a.username} removed from this device`, body: 'The account itself is untouched. Log in any time to add it back.' });
  };

  const logOut = async () => {
    const name = user?.username;
    close();
    await useSession.getState().logOut();
    const now = useSession.getState().user;
    useUi.getState().toast({ tone: 'neutral', title: now ? `Logged out of ${name}`  : 'Logged out', body: now ? `You're now using ${now.username}.` : undefined });
    nav('/', { replace: true });
  };

  return (
    <Sheet open={open} onClose={close} label="Account" title={view === 'edit' ? <>Edit <span className="text-mute">profile</span></> : <>Your <span className="text-mute">account</span></>}>
      <AnimatePresence mode="wait" initial={false}>
        {view === 'edit' && user ? (
          <motion.div key="edit" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
            <EditProfile onDone={() => setView('main')} />
          </motion.div>
        ) : (
          <motion.div key="main" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }} className="flex flex-col gap-6">
            {user && current ? (
              <div className="flex items-center gap-4">
                <Avatar seed={user.avatarSeed} name={user.username} size={60} ring={isAdmin} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[21px] font-semibold leading-tight tracking-tighter2">{user.username}</p>
                  <p className="truncate text-[13.5px] text-mute">{user.email}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] bg-surface2 p-5">
                <p className="text-[16px] font-medium">You're not logged in</p>
                <p className="mt-1 text-[13.5px] text-mute">Log in to bet, track your wallet and switch between accounts.</p>
                <div className="mt-4 flex gap-2">
                  <Pill className="flex-1" onClick={() => go('/login')}><LogIn size={16} strokeWidth={1.5} />Log in</Pill>
                  <Pill tone="lime" className="flex-1" onClick={() => go('/signup')}>Sign up</Pill>
                </div>
              </div>
            )}

            {user && (
              <div className="grid grid-cols-2 gap-2">
                <Pill onClick={() => setView('edit')}>Edit profile</Pill>
                <Pill onClick={() => go('/profile')}>View profile</Pill>
              </div>
            )}

            <section>
              <SectionLabel>Theme</SectionLabel>
              <ThemePicker />
            </section>

            {(user || others.length > 0) && (
              <section>
                <SectionLabel>{user ? 'Switch account' : 'Accounts on this device'}</SectionLabel>
                <div className="overflow-hidden rounded-[22px] bg-surface2/70">
                  {current && <AccountRow a={current} active busy={false} onPick={() => {}} />}
                  {others.map((a) => (
                    <AccountRow key={a.id} a={a} active={false} busy={switchingTo === a.id} onPick={() => void switchTo(a)} onRemove={switchingTo ? undefined : () => void remove(a)} />
                  ))}
                  {user && (accounts.length < MAX_ACCOUNTS || !accounts.some((a) => a.id === user.id)) && (
                    <button onClick={() => go('/login', { add: true })} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-surface2/60">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[rgb(var(--line)/0.25)] text-mute"><Plus size={18} strokeWidth={1.6} /></span>
                      <span className="flex-1 font-medium">Add account</span>
                      <ChevronRight size={17} strokeWidth={1.5} className="text-mute" />
                    </button>
                  )}
                </div>
                {user && accounts.length >= MAX_ACCOUNTS && <p className="mt-2 px-1 text-[12.5px] text-mute">Up to {MAX_ACCOUNTS} accounts can be saved on one device.</p>}
              </section>
            )}

            {user && (
              <section className="overflow-hidden rounded-[22px] bg-surface2/70">
                <button onClick={() => go('/settings')} className="flex h-14 w-full items-center gap-3 border-b hair px-4 text-left text-[15px] hover:bg-surface2/60">
                  <Settings2 size={18} strokeWidth={1.5} className="text-mute" /><span className="flex-1">Settings</span><ChevronRight size={17} strokeWidth={1.5} className="text-mute" />
                </button>
                <button onClick={() => void logOut()} className="flex h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-down hover:bg-surface2/60">
                  <LogOut size={18} strokeWidth={1.5} /><span className="flex-1">Log out of {user.username}</span>
                </button>
              </section>
            )}
            {!user && others.length === 0 && (
              <p className="flex items-center gap-2 px-1 text-[12.5px] text-mute"><UserRound size={14} strokeWidth={1.5} />Accounts you log in to here can be switched between from this sheet.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
