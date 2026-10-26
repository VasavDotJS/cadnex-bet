/**
 * Signed-in user, wallet, bets and settings. The account lives in the cloud (Supabase);
 * the device keeps a synced copy in IndexedDB so screens stay instant and work offline.
 */
import { create } from 'zustand';
import { dropAccount, loadAccounts, rememberSession, savedSession, updateAccountCard, useAccounts } from '../cloud/accounts';
import { cloud } from '../cloud/client';
import { clearLocal, onCloudChange, onProfileChange, startSync, stopSync } from '../cloud/sync';
import { BetRow, db, DeviceRow, LedgerRow, SettingsRow, WalletRow } from '../db/db';
import { AuthError, authService, defaultSettings, PublicUser, purgeLegacyAccounts } from '../services/authService';
import { betService } from '../services/betService';
import { walletService } from '../services/walletService';

interface SessionState {
  booted: boolean;
  user: PublicUser | null;
  wallet: WalletRow | null;
  bets: BetRow[];
  ledger: LedgerRow[];
  settings: SettingsRow | null;
  device: DeviceRow;
  /** opened from a password-reset email: ask for a new password */
  recovery: boolean;
  boot(): Promise<void>;
  setUser(u: PublicUser | null): Promise<void>;
  refreshWallet(): Promise<void>;
  refreshBets(): Promise<void>;
  refreshLedger(): Promise<void>;
  refreshAll(): Promise<void>;
  updateSettings(patch: Partial<SettingsRow>): Promise<void>;
  updateDevice(patch: Partial<DeviceRow>): Promise<void>;
  logOut(): Promise<void>;
  /** Make another account saved on this device the active one. */
  switchAccount(id: string): Promise<void>;
  /** About to log in to another account: save the current one's changes and pause it. */
  beginAdd(): Promise<void>;
  /** Adding an account failed or was cancelled: carry on with the current one. */
  cancelAdd(): Promise<void>;
  /** Account deleted in the cloud: drop it from this device too. */
  forget(): Promise<void>;
  endRecovery(): void;
}

const DEVICE_DEFAULT: DeviceRow = { id: 'device', speedMinutes: 10, ageConfirmed: false };

let opening: { id: string; p: Promise<void> } | null = null;
let listening = false;
/** true while the logins are being swapped: the auth events this causes are handled by switchAccount */
let switching = false;

export const useSession = create<SessionState>((set, get) => {
  /** Sign the device into an account: sync it down (all of it on a new device), then load. */
  const open = async (user: PublicUser) => {
    set({ user });
    const fresh = !(await db.wallets.get(user.id));
    try {
      await startSync(user.id, { fresh });
    } catch {
      if (fresh) {
        // never start a blank wallet over an account we could not download
        await stopSync(0);
        set({ user: null });
        throw new AuthError('form', "Couldn't load your account. Check your connection and try again.");
      }
    }
    if (fresh) {
      try {
        await authService.openAccount(user);
      } catch {
        await stopSync(0);
        set({ user: null });
        throw new AuthError('form', "Couldn't open your wallet. Check your connection and try again.");
      }
    }
    let settings = await db.settings.get(user.id);
    if (!settings) {
      settings = defaultSettings(user.id);
      await db.settings.put(settings);
    }
    if (get().user?.id !== user.id) return;
    set({ settings });
    await get().refreshAll();
  };

  /** Carry on with the current account after a switch or add didn't happen. */
  const resume = async (cur: PublicUser) => {
    try {
      await startSync(cur.id, { fresh: false });
    } catch {
      /* offline: it retries */
    }
    await get().refreshAll();
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    onCloudChange(() => {
      const u = get().user;
      if (!u) return;
      void db.settings.get(u.id).then((s) => { if (s && get().user?.id === u.id) set({ settings: s }); });
      void get().refreshAll();
    });
    onProfileChange((row) => {
      const u = get().user;
      if (!u || row.id !== u.id) return;
      const next = { ...u, username: String(row.username ?? u.username), avatarSeed: Number(row.avatar_seed ?? u.avatarSeed) };
      set({ user: next });
      updateAccountCard(u.id, { username: next.username, avatarSeed: next.avatarSeed });
    });
    cloud().auth.onAuthStateChange((event, session) => {
      // save the active account's latest tokens, so switching back never uses a spent refresh token
      if (session && event !== 'SIGNED_OUT') {
        const cur = get().user;
        rememberSession(session, cur?.id === session.user.id ? { username: cur.username, email: cur.email, avatarSeed: cur.avatarSeed } : undefined);
      }
      if (switching) return;
      // keep this callback synchronous (supabase-js requirement); do the work just after
      setTimeout(() => {
        if (switching) return;
        const cur = get().user;
        if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
        if (event === 'SIGNED_OUT' && cur) {
          // only if no other account has been signed in since (logging out can switch to one)
          void cloud().auth.getSession().then(({ data }) => {
            if (!data.session && !switching && get().user) void stopSync(0).then(() => get().setUser(null));
          });
          return;
        }
        if (event === 'USER_UPDATED' && cur && session?.user?.email && session.user.email !== cur.email) {
          set({ user: { ...cur, email: session.user.email } });
        }
        // signed in by an email link (confirm sign-up, reset password) rather than the login form
        if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session?.user && cur?.id !== session.user.id && opening?.id !== session.user.id) {
          void authService.getSession().then((u) => (u ? get().setUser(u) : undefined)).catch(() => {});
        }
      }, 0);
    });
  };

  return {
    booted: false,
    user: null,
    wallet: null,
    bets: [],
    ledger: [],
    settings: null,
    device: DEVICE_DEFAULT,
    recovery: false,

    async boot() {
      await purgeLegacyAccounts();
      loadAccounts();
      const device = (await db.device.get('device')) ?? DEVICE_DEFAULT;
      set({ device });
      listen();
      try {
        const user = await authService.getSession();
        if (user) await get().setUser(user);
      } catch {
        /* offline on a device without a copy of the account: show the logged-out app */
      }
      set({ booted: true });
    },

    async setUser(user) {
      if (!user) {
        set({ user: null, wallet: null, bets: [], ledger: [], settings: null });
        return;
      }
      if (opening?.id === user.id) return opening.p;
      updateAccountCard(user.id, { username: user.username, email: user.email, avatarSeed: user.avatarSeed });
      if (get().user?.id === user.id && get().wallet) {
        set({ user });
        return;
      }
      // another account: clear the old one's figures before the new one loads
      if (get().user && get().user!.id !== user.id) set({ wallet: null, bets: [], ledger: [], settings: null });
      const p = open(user).finally(() => { if (opening?.p === p) opening = null; });
      opening = { id: user.id, p };
      return p;
    },

    async refreshWallet() {
      const u = get().user;
      if (!u) return;
      try {
        set({ wallet: await walletService.getWallet(u.id) });
      } catch {
        /* not downloaded yet */
      }
    },

    async refreshBets() {
      const u = get().user;
      if (!u) return;
      set({ bets: await betService.getBets(u.id) });
    },

    async refreshLedger() {
      const u = get().user;
      if (!u) return;
      set({ ledger: await walletService.getLedger(u.id) });
    },

    async refreshAll() {
      await Promise.all([get().refreshWallet(), get().refreshBets(), get().refreshLedger()]);
    },

    async updateSettings(patch) {
      const s = get().settings;
      if (!s) return;
      const next = { ...s, ...patch };
      set({ settings: next });
      await db.settings.put(next);
    },

    async updateDevice(patch) {
      const next = { ...get().device, ...patch };
      set({ device: next });
      await db.device.put(next);
    },

    async logOut() {
      const u = get().user;
      const { clean } = await stopSync();
      await authService.logOut();
      if (u) dropAccount(u.id);
      // the account is safe in the cloud; leave nothing of it on this device
      if (u && clean) await clearLocal(u.id);
      set({ recovery: false });
      await get().setUser(null);
      // other accounts saved here: carry on with the most recent one
      for (const next of useAccounts.getState().list) {
        try {
          await get().switchAccount(next.id);
          return;
        } catch {
          /* that one's login has expired too; try the next */
        }
      }
    },

    async switchAccount(id) {
      const cur = get().user;
      if (cur?.id === id) return;
      const target = savedSession(id);
      if (!target) throw new AuthError('form', 'That account is no longer saved on this device. Log in to add it again.');
      // finish saving the current account's changes with its own login, then swap logins
      if (cur) await stopSync();
      switching = true;
      let next: PublicUser | null = null;
      let problem: AuthError | null = null;
      try {
        const { data, error } = await cloud().auth.setSession({ access_token: target.access, refresh_token: target.refresh });
        if (error || !data.session?.user || data.session.user.id !== id) {
          const network = !!error && /fetch|network|load failed/i.test(error.message);
          if (!network) dropAccount(id);
          problem = new AuthError(network ? 'form' : 'expired', network ? "Couldn't reach CADNEX. Check your connection and try again." : `You've been logged out of ${target.username}. Log in again to switch to it.`);
        } else {
          rememberSession(data.session, { username: target.username, email: target.email, avatarSeed: target.avatarSeed });
          next = await authService.getSession();
          if (!next) problem = new AuthError('form', "Couldn't load that account. Check your connection and try again.");
        }
        if (problem && cur) {
          // put the current account's login back
          const back = savedSession(cur.id);
          if (back) await cloud().auth.setSession({ access_token: back.access, refresh_token: back.refresh }).catch(() => null);
        }
      } finally {
        switching = false;
      }
      if (problem || !next) {
        if (cur) await resume(cur);
        throw problem ?? new AuthError('form', 'Could not switch accounts.');
      }
      set({ recovery: false });
      await get().setUser(next);
    },

    async beginAdd() {
      if (get().user) await stopSync();
    },

    async cancelAdd() {
      const cur = get().user;
      if (cur) await resume(cur);
    },

    async forget() {
      const u = get().user;
      if (u) dropAccount(u.id);
      await stopSync(0);
      if (u) await clearLocal(u.id);
      await get().setUser(null);
    },

    endRecovery() {
      set({ recovery: false });
    },
  };
});
