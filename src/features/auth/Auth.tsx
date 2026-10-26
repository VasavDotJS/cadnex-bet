/** Sign up, log in and password reset. Accounts live in the cloud, so they work on any device. */
import { motion, useAnimationControls } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { FormEvent, ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Orbs } from '../../components/Ambient';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { gentle } from '../../components/motion';
import { Pill } from '../../components/ui';
import { currency } from '../../lib/currencies';
import { passwordStrength } from '../../lib/crypto';
import { MAX_ACCOUNTS, useAccounts } from '../../cloud/accounts';
import { AuthError, authService } from '../../services/authService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Logo } from '../shell/Shell';

function Frame({ title, sub, children, footer, onBack }: { title: [string, string]; sub: string; children: ReactNode; footer: ReactNode; onBack?: () => void }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10">
      <Orbs palette="landing" intensity={0.7} />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={gentle} className="relative w-full max-w-[440px]">
        <div className="flex items-center justify-between">
          <Logo />
          {onBack && (
            <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface2 px-4 text-[14px] text-mute hover:text-ink">
              <ArrowLeft size={16} strokeWidth={1.5} />Cancel
            </button>
          )}
        </div>
        <h1 className="mt-8 text-[36px] font-semibold leading-[1] tracking-tighter2">{title[0]} <span className="text-mute">{title[1]}</span></h1>
        <p className="mt-3 text-[15px] text-mute">{sub}</p>
        <div className="glass mt-8 rounded-[30px] p-6">{children}</div>
        <div className="mt-6 text-center text-[14px] text-mute">{footer}</div>
      </motion.div>
    </div>
  );
}

function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-[13px] text-mute">{label}</span>
      {children}
      {error ? <span className="px-1 text-[12.5px] text-down" role="alert">{error}</span> : hint}
    </div>
  );
}

const inputCls = (err?: string) => `h-12 w-full rounded-[16px] bg-surface2 px-4 text-[15px] outline-none transition-shadow placeholder:text-faint focus:ring-2 focus:ring-lime ${err ? 'ring-2 ring-down/60' : ''}`;

function Password({ value, onChange, error, auto = 'current-password', id }: { value: string; onChange: (v: string) => void; error?: string; auto?: string; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={auto} className={`${inputCls(error)} pr-12`} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1 top-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-mute hover:text-ink">
        {show ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
      </button>
    </div>
  );
}

function useShake() {
  const c = useAnimationControls();
  return { controls: c, shake: () => void c.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.4 } }) };
}

/** Where the auth screens were opened from, and whether this adds a second account. */
type AuthState = { from?: string; add?: boolean; email?: string } | null;

/** Checks before adding an account; returns a problem to show, or null. */
function addProblem(email: string): string | null {
  const cur = useSession.getState().user;
  const list = useAccounts.getState().list;
  if (cur && cur.email.toLowerCase() === email.trim().toLowerCase()) return `You're already logged in as ${cur.username}.`;
  if (list.length >= MAX_ACCOUNTS && !list.some((a) => a.email.toLowerCase() === email.trim().toLowerCase())) return `You can keep up to ${MAX_ACCOUNTS} accounts on this device. Remove one from Account first.`;
  return null;
}

export function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const st = loc.state as AuthState;
  const from = st?.from ?? '/';
  const adding = !!st?.add && !!useSession.getState().user;
  const [id, setId] = useState(st?.email ?? '');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { controls, shake } = useShake();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id.trim()) { setErr({ field: 'identifier', msg: 'Enter your email address.' }); shake(); return; }
    if (adding) {
      const problem = addProblem(id);
      if (problem) { setErr({ field: 'identifier', msg: problem }); shake(); return; }
    }
    setBusy(true);
    let paused = false;
    try {
      if (adding) { await useSession.getState().beginAdd(); paused = true; }
      const u = await authService.logIn(id, pw, remember);
      await useSession.getState().setUser(u);
      if (adding) useUi.getState().toast({ tone: 'neutral', title: `Switched to ${u.username}`, body: 'Switch accounts any time from Account.' });
      nav(adding ? '/' : from, { replace: true });
    } catch (x) {
      if (paused) await useSession.getState().cancelAdd();
      setErr(x instanceof AuthError ? { field: x.field, msg: x.message } : { field: 'form', msg: 'Something went wrong. Try again.' });
      shake();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame
      title={adding ? ['Add an', 'account'] : ['Welcome', 'back']}
      sub={adding ? 'Log in to another CADNEX account. You can switch between them any time from Account.' : 'Log in to your CADNEX account. It works on any device.'}
      onBack={adding ? () => nav(-1) : undefined}
      footer={<>New here? <Link to="/signup" state={{ from, add: adding || undefined }} className="text-ink underline-offset-2 hover:underline">Create an account</Link></>}
    >
      <motion.form animate={controls} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Email" error={err?.field === 'identifier' ? err.msg : undefined}>
          <input type="email" inputMode="email" value={id} onChange={(e) => { setId(e.target.value); setErr(null); }} autoComplete="email" className={inputCls(err?.field === 'identifier' ? 'x' : undefined)} />
        </Field>
        <Field label="Password" error={err?.field === 'password' ? err.msg : undefined}>
          <Password id="pw" value={pw} onChange={(v) => { setPw(v); setErr(null); }} error={err?.field === 'password' ? 'x' : undefined} />
        </Field>
        <div className="flex items-center justify-between text-[13.5px]">
          <label className="flex items-center gap-2 text-mute"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--lime))]" />Remember me</label>
          <Link to="/forgot" className="text-mute hover:text-ink">Forgot password?</Link>
        </div>
        {err?.field === 'form' && <p className="text-[13px] text-down">{err.msg}</p>}
        <Pill tone="lime" size="lg" type="submit" disabled={busy}>{busy ? 'Logging in' : 'Log in'}</Pill>
      </motion.form>
    </Frame>
  );
}

export function Signup() {
  const nav = useNavigate();
  const loc = useLocation();
  const nav0 = loc.state as AuthState;
  const from = nav0?.from ?? '/';
  const adding = !!nav0?.add && !!useSession.getState().user;
  const [f, setF] = useState({ username: '', email: '', password: '', dob: '', currency: 'USD', terms: false });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [sent, setSent] = useState('');
  const { controls, shake } = useShake();
  const st = passwordStrength(f.password);
  const set = (k: keyof typeof f, v: string | boolean) => { setF({ ...f, [k]: v }); setErr({ ...err, [k]: '' }); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.terms) { setErr({ terms: 'Accept the terms and responsible gaming policy to continue.' }); shake(); return; }
    if (adding) {
      const problem = addProblem(f.email);
      if (problem) { setErr({ email: problem }); shake(); return; }
    }
    setBusy(true);
    let paused = false;
    try {
      if (adding) { await useSession.getState().beginAdd(); paused = true; }
      const r = await authService.signUp(f);
      if ('confirmEmail' in r) {
        if (paused) await useSession.getState().cancelAdd();
        setSent(r.confirmEmail);
        return;
      }
      await useSession.getState().setUser(r.user);
      useUi.getState().toast({ tone: 'demo', title: 'Welcome to CADNEX', body: 'Your demo wallet is funded. Your account works on any device you log in to.' });
      nav(adding ? '/' : from, { replace: true });
    } catch (x) {
      if (paused) await useSession.getState().cancelAdd();
      setErr(x instanceof AuthError ? { [x.field]: x.message } : { form: 'Something went wrong. Try again.' });
      shake();
    } finally {
      setBusy(false);
    }
  };
  const max = new Date();
  max.setFullYear(max.getFullYear() - 18);
  if (sent) {
    return (
      <Frame title={['Check your', 'inbox']} sub={`We sent a confirmation link to ${sent}.`} footer={<Link to="/login" className="text-ink underline-offset-2 hover:underline">Go to log in</Link>}>
        <p className="text-[15px] leading-relaxed text-mute">Open the link in that email to finish creating your account. It signs you straight in. If it isn't there in a minute, check your spam folder.</p>
      </Frame>
    );
  }
  return (
    <Frame title={['Create', 'account']} sub={adding ? 'A new account alongside your current one. Switch between them from Account.' : 'Free, virtual money only. Takes a minute.'} onBack={adding ? () => nav(-1) : undefined} footer={<>Already have an account? <Link to="/login" state={{ from, add: adding || undefined }} className="text-ink underline-offset-2 hover:underline">Log in</Link></>}>
      <motion.form animate={controls} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Username" error={err.username}>
          <input value={f.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" className={inputCls(err.username)} />
        </Field>
        <Field label="Email" error={err.email}>
          <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" className={inputCls(err.email)} />
        </Field>
        <Field label="Password" error={err.password} hint={
          f.password ? (
            <div className="flex items-center gap-2 px-1">
              <div className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < st.score ? (st.score <= 1 ? 'bg-down' : st.score === 2 ? 'bg-warn' : 'bg-lime') : 'bg-surface3'}`} />)}</div>
              <span className="text-[12px] text-mute">{st.label}</span>
            </div>
          ) : <span className="px-1 text-[12px] text-faint">At least 8 characters</span>
        }>
          <Password id="npw" value={f.password} onChange={(v) => set('password', v)} error={err.password} auto="new-password" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth" error={err.dob}>
            <input type="date" value={f.dob} max={max.toISOString().slice(0, 10)} onChange={(e) => set('dob', e.target.value)} className={inputCls(err.dob)} />
          </Field>
          <Field label="Currency" error={err.currency}>
            <button type="button" onClick={() => setPicker(true)} className={`${inputCls()} flex items-center gap-2 text-left`}>
              <span>{currency(f.currency).glyph}</span><span className="font-medium">{f.currency}</span>
            </button>
          </Field>
        </div>
        <label className="flex items-start gap-3 text-[13.5px] text-mute">
          <input type="checkbox" checked={f.terms} onChange={(e) => set('terms', e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--lime))]" />
          <span>I am 18 or older and accept the <Link to="/help" className="text-ink underline-offset-2 hover:underline">terms</Link> and <Link to="/responsible" className="text-ink underline-offset-2 hover:underline">responsible gaming policy</Link>.</span>
        </label>
        {err.terms && <p className="-mt-2 text-[12.5px] text-down">{err.terms}</p>}
        {err.form && <p className="text-[13px] text-down">{err.form}</p>}
        <Pill tone="lime" size="lg" type="submit" disabled={busy}>{busy ? 'Creating account' : 'Create account'}</Pill>
      </motion.form>
      <CurrencyPicker open={picker} onClose={() => setPicker(false)} value={f.currency} onPick={(c) => set('currency', c)} />
    </Frame>
  );
}

export function Forgot() {
  const [id, setId] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const { controls, shake } = useShake();
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authService.requestReset(id);
      setSent(true);
    } catch (x) {
      setErr(x instanceof AuthError ? { field: x.field, msg: x.message } : { field: 'form', msg: 'Something went wrong.' });
      shake();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame title={['Reset', 'password']} sub={sent ? `If ${id.trim()} has an account, a reset link is on its way.` : 'We will email you a link to choose a new password.'} footer={<Link to="/login" className="text-ink underline-offset-2 hover:underline">Back to log in</Link>}>
      {sent ? (
        <p className="text-[15px] leading-relaxed text-mute">Open the link on this device. It brings you back to CADNEX to set a new password. Check your spam folder if it doesn't arrive within a minute.</p>
      ) : (
        <motion.form animate={controls} onSubmit={ask} className="flex flex-col gap-4">
          <Field label="Email" error={err?.msg}>
            <input type="email" inputMode="email" autoComplete="email" value={id} onChange={(e) => { setId(e.target.value); setErr(null); }} className={inputCls(err?.msg)} />
          </Field>
          <Pill tone="lime" size="lg" type="submit" disabled={busy}>{busy ? 'Sending' : 'Email me a reset link'}</Pill>
        </motion.form>
      )}
    </Frame>
  );
}

/** Opened from the reset email: the user is signed in for recovery and picks a new password. */
export function ResetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { controls, shake } = useShake();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authService.setNewPassword(pw);
      useSession.getState().endRecovery();
      useUi.getState().toast({ tone: 'neutral', title: 'Password updated', body: 'You are signed in.' });
      nav('/', { replace: true });
    } catch (x) {
      setErr(x instanceof AuthError ? x.message : 'Something went wrong.');
      shake();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame title={['New', 'password']} sub="Choose a new password for your account." footer={<button onClick={() => { useSession.getState().endRecovery(); nav('/', { replace: true }); }} className="text-mute hover:text-ink">Skip for now</button>}>
      <motion.form animate={controls} onSubmit={save} className="flex flex-col gap-4">
        <Field label="New password" error={err || undefined}>
          <Password id="rpw" value={pw} onChange={(v) => { setPw(v); setErr(''); }} auto="new-password" />
        </Field>
        <Pill tone="lime" size="lg" type="submit" disabled={busy}>{busy ? 'Saving' : 'Save password'}</Pill>
      </motion.form>
    </Frame>
  );
}
