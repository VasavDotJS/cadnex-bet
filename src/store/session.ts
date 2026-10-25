/**
 * Signed-in user, wallet, bets and settings. The account lives in the cloud (Supabase);
 * the device keeps a synced copy in IndexedDB so screens stay instant and work offline.
 */
import { create } from 'zustand';
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
  /** Account deleted in the cloud: drop it from this device too. */
  forget(): Promise<void>;
  endRecovery(): void;
}

const DEVICE_DEFAULT: DeviceRow = { id: 'device', speedMinutes: 10, ageConfirmed: false };

let opening: { id: string; p: Promise<void> } | null = null;
let listening = false;

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
      set({ user: { ...u, username: String(row.username ?? u.username), avatarSeed: Number(row.avatar_seed ?? u.avatarSeed) } });
    });
    cloud().auth.onAuthStateChange((event, session) => {
      // keep this callback synchronous (supabase-js requirement); do the work just after
      setTimeout(() => {
        const cur = get().user;
        if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
        if (event === 'SIGNED_OUT' && cur) {
          void stopSync(0).then(() => get().setUser(null));
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
      if (get().user?.id === user.id && get().wallet) {
        set({ user });
        return;
      }
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
      // the account is safe in the cloud; leave nothing of it on this device
      if (u && clean) await clearLocal(u.id);
      set({ recovery: false });
      await get().setUser(null);
    },

    async forget() {
      const u = get().user;
      await stopSync(0);
      if (u) await clearLocal(u.id);
      await get().setUser(null);
    },

    endRecovery() {
      set({ recovery: false });
    },
  };
});
