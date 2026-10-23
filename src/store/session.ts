/** Signed-in user, wallet, bets and settings, hydrated from IndexedDB. */
import { create } from 'zustand';
import { BetRow, db, DeviceRow, LedgerRow, SettingsRow, WalletRow } from '../db/db';
import { authService, defaultSettings, PublicUser } from '../services/authService';
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
  boot(): Promise<void>;
  setUser(u: PublicUser | null): Promise<void>;
  refreshWallet(): Promise<void>;
  refreshBets(): Promise<void>;
  refreshLedger(): Promise<void>;
  refreshAll(): Promise<void>;
  updateSettings(patch: Partial<SettingsRow>): Promise<void>;
  updateDevice(patch: Partial<DeviceRow>): Promise<void>;
  logOut(): Promise<void>;
}

const DEVICE_DEFAULT: DeviceRow = { id: 'device', speedMinutes: 10, ageConfirmed: false };

export const useSession = create<SessionState>((set, get) => ({
  booted: false,
  user: null,
  wallet: null,
  bets: [],
  ledger: [],
  settings: null,
  device: DEVICE_DEFAULT,

  async boot() {
    const device = (await db.device.get('device')) ?? DEVICE_DEFAULT;
    const user = await authService.getSession();
    set({ device });
    await get().setUser(user);
    set({ booted: true });
  },

  async setUser(user) {
    set({ user });
    if (!user) {
      set({ wallet: null, bets: [], ledger: [], settings: null });
      return;
    }
    let settings = await db.settings.get(user.id);
    if (!settings) {
      settings = defaultSettings(user.id);
      await db.settings.put(settings);
    }
    set({ settings });
    await get().refreshAll();
  },

  async refreshWallet() {
    const u = get().user;
    if (!u) return;
    set({ wallet: await walletService.getWallet(u.id) });
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
    await authService.logOut();
    await get().setUser(null);
  },
}));
