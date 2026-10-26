import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Component, lazy, ReactNode, Suspense, useEffect, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { startBridge } from './core/bridge';
import { Celebration } from './components/Ambient';
import { useReduced } from './components/motion';
import { Toasts } from './components/Toasts';
import { TwoTone } from './components/ui';
import { db } from './db/db';
import { Landing } from './features/auth/Landing';
import { EventPage } from './features/event/EventPage';
import { InstallSheet } from './features/install/Install';
import { Home } from './features/home/Home';
import { NotificationsPage } from './features/notifications/Notifications';
import { getRg } from './features/responsible/limits';
import { SearchPalette } from './features/search/SearchPalette';
import { AccountSheet } from './features/account/AccountSheet';
import { Shell } from './features/shell/Shell';
import { FlyingChip, SlipPill, SlipSheet } from './features/slip/BetSlip';
import { LiveCentre, Sports } from './features/sports/Sports';
import { convertMinor, formatMoney } from './lib/money';
import { startPwa } from './pwa/install';
import { markReady } from './splash/ready';
import { useSession } from './store/session';
import { useUi } from './store/ui';
import { useShare } from './share/store';
import { useWrapped } from './wrapped/store';

// loaded only when someone opens /admin, so the panel isn't part of the normal app download
const AdminPage = lazy(() => import('./admin/AdminPage'));

// Screens most visits never open load on demand (and are fetched in the background once the
// app is idle), so phones parse far less JavaScript at start-up.
const loaders = {
  auth: () => import('./features/auth/Auth'),
  bets: () => import('./features/bets/MyBets'),
  help: () => import('./features/help/Help'),
  profile: () => import('./features/profile/Profile'),
  responsible: () => import('./features/responsible/Responsible'),
  wallet: () => import('./features/wallet/Wallet'),
  shared: () => import('./share/SharedSlip'),
  share: () => import('./share/ShareStory'),
  wrapped: () => import('./wrapped/Wrapped'),
};
const Login = lazy(() => loaders.auth().then((m) => ({ default: m.Login })));
const Signup = lazy(() => loaders.auth().then((m) => ({ default: m.Signup })));
const Forgot = lazy(() => loaders.auth().then((m) => ({ default: m.Forgot })));
const ResetPassword = lazy(() => loaders.auth().then((m) => ({ default: m.ResetPassword })));
const MyBets = lazy(() => loaders.bets().then((m) => ({ default: m.MyBets })));
const Help = lazy(() => loaders.help().then((m) => ({ default: m.Help })));
const NotFound = lazy(() => loaders.help().then((m) => ({ default: m.NotFound })));
const Profile = lazy(() => loaders.profile().then((m) => ({ default: m.Profile })));
const SettingsPage = lazy(() => loaders.profile().then((m) => ({ default: m.SettingsPage })));
const Responsible = lazy(() => loaders.responsible().then((m) => ({ default: m.Responsible })));
const WalletPage = lazy(() => loaders.wallet().then((m) => ({ default: m.WalletPage })));
const SharedSlip = lazy(() => loaders.shared().then((m) => ({ default: m.SharedSlip })));
const ShareStorySheet = lazy(() => loaders.share().then((m) => ({ default: m.ShareStorySheet })));
const WrappedPlayer = lazy(() => loaders.wrapped().then((m) => ({ default: m.WrappedPlayer })));

/** Mount an overlay's code only once it has been opened (it then stays, for its closing animation). */
function Deferred({ open, children }: { open: boolean; children: ReactNode }) {
  const seen = useRef(false);
  if (open) seen.current = true;
  return seen.current ? <Suspense fallback={null}>{children}</Suspense> : null;
}

function prefetchScreens(): void {
  const run = () => Object.values(loaders).forEach((load, i) => setTimeout(() => void load().catch(() => {}), i * 300));
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 6000 });
  else setTimeout(run, 3000);
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-start justify-center gap-4 px-6">
        <TwoTone a="Something" b="broke" size="xl" as="h1" />
        <p className="max-w-[48ch] text-[15px] text-mute">This screen hit an error and stopped. Your balance and bets are safe. Reload to continue.</p>
        <p className="mono max-w-[60ch] text-[12px] text-faint">{this.state.error.message}</p>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()} className="rounded-full bg-lime px-5 py-3 text-[14px] font-medium text-onlime">Reload</button>
          <a href="#/" onClick={() => setTimeout(() => window.location.reload(), 0)} className="rounded-full bg-surface2 px-5 py-3 text-[14px]">Go home</a>
        </div>
      </div>
    );
  }
}

function useTheme() {
  const theme = useSession((s) => s.settings?.theme ?? s.device.theme ?? 'dark');
  const reduced = useReduced();
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A0A0C' : '#ECECEE');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  }, [reduced]);
}

/** Session reminders from Responsible gaming: time played and result this session. */
function useSessionReminder() {
  const user = useSession((s) => s.user);
  const started = useRef(Date.now());
  useEffect(() => {
    if (!user) return;
    started.current = Date.now();
    let last = Date.now();
    const t = setInterval(async () => {
      const rg = await getRg(user.id);
      const every = rg.reminderMinutes ?? 0;
      if (!every || Date.now() - last < every * 60_000) return;
      last = Date.now();
      const w = useSession.getState().wallet;
      if (!w) return;
      const rows = await db.ledger.where('[userId+createdAt]').between([user.id, started.current], [user.id, Number.MAX_SAFE_INTEGER]).toArray();
      const net = rows.filter((r) => ['BET_PLACED', 'BET_WON', 'BET_REFUND', 'CASHOUT'].includes(r.type)).reduce((a, r) => a + convertMinor(BigInt(r.amountMinor), r.currency, w.currency), 0n);
      const mins = Math.round((Date.now() - started.current) / 60_000);
      useUi.getState().toast({ tone: 'demo', title: `You have been playing for ${mins} minutes`, body: `Session result: ${formatMoney(net, w.currency, { sign: true })}. Take a break any time in Responsible gaming.`, action: { label: 'Limits', to: '/responsible' } }, 10000);
    }, 20_000);
    return () => clearInterval(t);
  }, [user]);
}

function Protected({ children }: { children: ReactNode }) {
  const user = useSession((s) => s.user);
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

function Page({ children }: { children: ReactNode }) {
  const reduced = useReduced();
  return (
    <motion.div initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
      <Suspense fallback={<div className="min-h-[60dvh]" />}>{children}</Suspense>
    </motion.div>
  );
}

function AppRoutes() {
  const loc = useLocation();
  const user = useSession((s) => s.user);
  const recovery = useSession((s) => s.recovery);
  // signed in and adding another account from Account
  const adding = !!(loc.state as { add?: boolean } | null)?.add;
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  // opened from a password-reset email: choose a new password first
  if (recovery && user && loc.pathname !== '/reset') return <Navigate to="/reset" replace />;
  const bare = ['/login', '/signup', '/forgot', '/reset'].includes(loc.pathname) || (!user && loc.pathname === '/');
  const routes = (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={loc} key={loc.pathname}>
        <Route path="/" element={<Page>{user ? <Home /> : <Landing />}</Page>} />
        <Route path="/login" element={user && !adding ? <Navigate to="/" replace /> : <Page><Login /></Page>} />
        <Route path="/signup" element={user && !adding ? <Navigate to="/" replace /> : <Page><Signup /></Page>} />
        <Route path="/forgot" element={<Page><Forgot /></Page>} />
        <Route path="/reset" element={user ? <Page><ResetPassword /></Page> : <Navigate to="/forgot" replace />} />
        <Route path="/sports" element={<Page><Sports /></Page>} />
        <Route path="/sports/:sport" element={<Page><Sports /></Page>} />
        <Route path="/sports/:sport/:league" element={<Page><Sports /></Page>} />
        <Route path="/live" element={<Page><LiveCentre /></Page>} />
        <Route path="/event/:id" element={<Page><EventPage /></Page>} />
        <Route path="/bets" element={<Protected><Page><MyBets /></Page></Protected>} />
        <Route path="/wallet" element={<Protected><Page><WalletPage /></Page></Protected>} />
        <Route path="/profile" element={<Protected><Page><Profile /></Page></Protected>} />
        <Route path="/settings" element={<Protected><Page><SettingsPage /></Page></Protected>} />
        <Route path="/notifications" element={<Protected><Page><NotificationsPage /></Page></Protected>} />
        <Route path="/responsible" element={<Page><Responsible /></Page>} />
        <Route path="/help" element={<Page><Help /></Page>} />
        <Route path="/s/:user/:legs" element={<Page><SharedSlip /></Page>} />
        <Route path="/admin" element={<Page><Suspense fallback={null}><AdminPage /></Suspense></Page>} />
        <Route path="*" element={<Page><NotFound /></Page>} />
      </Routes>
    </AnimatePresence>
  );
  return bare ? routes : <Shell>{routes}</Shell>;
}

/**
 * This page's CSP nonce (set per request on the server). Animations that need a <style>
 * element use it, so the strict policy can keep refusing every other inline style.
 */
function pageNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const s = document.querySelector<HTMLScriptElement>('script[nonce]');
  return s?.nonce || s?.getAttribute('nonce') || undefined;
}

function DeferredOverlays() {
  const sharing = useShare((s) => !!s.source);
  const wrapped = useWrapped((s) => !!s.period);
  return (
    <>
      <Deferred open={sharing}><ShareStorySheet /></Deferred>
      <Deferred open={wrapped}><WrappedPlayer /></Deferred>
    </>
  );
}

export function App() {
  const booted = useSession((s) => s.booted);
  useTheme();
  useSessionReminder();
  useEffect(() => {
    startPwa();
    void useSession.getState().boot().then(() => startBridge());
  }, []);
  useEffect(() => {
    if (!booted) return;
    markReady();
    prefetchScreens();
  }, [booted]);
  if (!booted) return null; // the launch screen is showing
  return (
    <ErrorBoundary>
      <MotionConfig nonce={pageNonce()}>
      <HashRouter>
        <AppRoutes />
        <SlipPill />
        <SlipSheet />
        <SearchPalette />
        <AccountSheet />
        <FlyingChip />
        <Celebration />
        <InstallSheet />
        <DeferredOverlays />
        <Toasts />
      </HashRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}
