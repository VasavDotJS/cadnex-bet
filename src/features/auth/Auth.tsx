/** Sign up, log in and the demo password reset. */
import { motion, useAnimationControls } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { FormEvent, ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Orbs } from '../../components/Ambient';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { gentle } from '../../components/motion';
import { Pill } from '../../components/ui';
import { currency } from '../../lib/currencies';
import { passwordStrength } from '../../lib/crypto';
import { AuthError, authService } from '../../services/authService';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Logo } from '../shell/Shell';

function Frame({ title, sub, children, footer }: { title: [string, string]; sub: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10">
      <Orbs palette="landing" intensity={0.7} />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={gentle} className="relative w-full max-w-[440px]">
        <Logo />
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

export function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? '/';
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { controls, shake } = useShake();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id.trim()) { setErr({ field: 'identifier', msg: 'Enter your username or email.' }); shake(); return; }
    setBusy(true);
    try {
      const u = await authService.logIn(id, pw, remember);
      await useSession.getState().setUser(u);
      nav(from, { replace: true });
    } catch (x) {
      setErr(x instanceof AuthError ? { field: x.field, msg: x.message } : { field: 'form', msg: 'Something went wrong. Try again.' });
      shake();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame title={['Welcome', 'back']} sub="Log in to your CADNEX demo account." footer={<>New here? <Link to="/signup" state={{ from }} className="text-ink underline-offset-2 hover:underline">Create an account</Link></>}>
      <motion.form animate={controls} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Username or email" error={err?.field === 'identifier' ? err.msg : undefined}>
          <input value={id} onChange={(e) => { setId(e.target.value); setErr(null); }} autoComplete="username" className={inputCls(err?.field === 'identifier' ? 'x' : undefined)} />
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
  const from = (loc.state as { from?: string } | null)?.from ?? '/';
  const [f, setF] = useState({ username: '', email: '', password: '', dob: '', currency: 'USD', terms: false });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const { controls, shake } = useShake();
  const st = passwordStrength(f.password);
  const set = (k: keyof typeof f, v: string | boolean) => { setF({ ...f, [k]: v }); setErr({ ...err, [k]: '' }); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.terms) { setErr({ terms: 'Accept the terms and responsible gaming policy to continue.' }); shake(); return; }
    setBusy(true);
    try {
      const u = await authService.signUp(f);
      await useSession.getState().setUser(u);
      useUi.getState().toast({ tone: 'demo', title: 'Welcome to CADNEX', body: 'Your demo wallet is funded. Change the balance any time in Wallet.' });
      nav(from, { replace: true });
    } catch (x) {
      setErr(x instanceof AuthError ? { [x.field]: x.message } : { form: 'Something went wrong. Try again.' });
      shake();
    } finally {
      setBusy(false);
    }
  };
  const max = new Date();
  max.setFullYear(max.getFullYear() - 18);
  return (
    <Frame title={['Create', 'account']} sub="Free, virtual money only. Takes a minute." footer={<>Already have an account? <Link to="/login" state={{ from }} className="text-ink underline-offset-2 hover:underline">Log in</Link></>}>
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
  const nav = useNavigate();
  const [step, setStep] = useState<'ask' | 'reset'>('ask');
  const [id, setId] = useState('');
  const [uid, setUid] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const { controls, shake } = useShake();
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await authService.requestReset(id);
      setUid(r.userId);
      setStep('reset');
      useUi.getState().toast({ tone: 'demo', title: `Demo reset code: ${r.code}`, body: 'In a real product this would arrive by email. It expires in 10 minutes.' }, 15000);
    } catch (x) {
      setErr(x instanceof AuthError ? { field: x.field, msg: x.message } : { field: 'form', msg: 'Something went wrong.' });
      shake();
    }
  };
  const reset = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await authService.resetPassword(uid, code, pw);
      useUi.getState().toast({ tone: 'neutral', title: 'Password updated', body: 'Log in with your new password.' });
      nav('/login', { replace: true });
    } catch (x) {
      setErr(x instanceof AuthError ? { field: x.field, msg: x.message } : { field: 'form', msg: 'Something went wrong.' });
      shake();
    }
  };
  return (
    <Frame title={['Reset', 'password']} sub={step === 'ask' ? 'We will show a demo code on screen.' : 'Enter the 6-digit code and a new password.'} footer={<Link to="/login" className="text-ink underline-offset-2 hover:underline">Back to log in</Link>}>
      {step === 'ask' ? (
        <motion.form animate={controls} onSubmit={ask} className="flex flex-col gap-4">
          <Field label="Username or email" error={err?.msg}>
            <input value={id} onChange={(e) => { setId(e.target.value); setErr(null); }} className={inputCls(err?.msg)} />
          </Field>
          <Pill tone="lime" size="lg" type="submit">Send reset code</Pill>
        </motion.form>
      ) : (
        <motion.form animate={controls} onSubmit={reset} className="flex flex-col gap-4">
          <Field label="6-digit code" error={err?.field === 'code' ? err.msg : undefined}>
            <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null); }} inputMode="numeric" className={`${inputCls(err?.field === 'code' ? 'x' : undefined)} mono tracking-[0.4em]`} />
          </Field>
          <Field label="New password" error={err?.field === 'password' ? err.msg : undefined}>
            <Password id="rpw" value={pw} onChange={(v) => { setPw(v); setErr(null); }} auto="new-password" />
          </Field>
          <Pill tone="lime" size="lg" type="submit">Update password</Pill>
        </motion.form>
      )}
    </Frame>
  );
}
