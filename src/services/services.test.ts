import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { toE4 } from '../lib/money';
import { authService, PublicUser } from './authService';
import { betService } from './betService';
import { walletService } from './walletService';

async function reset() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

let n = 0;
/** A signed-up account as the app sees it after its first login (wallet + settings opened). */
async function account(username: string, currency = 'USD'): Promise<PublicUser> {
  n++;
  const u: PublicUser = { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, username, email: `${username}@x.io`, avatarSeed: 1, createdAt: Date.now(), dob: '1990-01-01', currency };
  await authService.openAccount(u);
  return u;
}

const legFor = (eventId: string, odds: number) => ({
  selectionId: `${eventId}|1x2|1`, eventId, marketKey: '1x2', code: '1', sport: 'football' as const, leagueId: 'epl',
  home: 'Arsenal', away: 'Chelsea', marketName: 'Match result', label: 'Arsenal', odds, oddsE4: toE4(odds).toString(), startTime: Date.now(), live: false,
});

describe('accounts, wallet and ledger', () => {
  beforeEach(reset);

  it('opens a new account with a starting balance, once', async () => {
    const a = await account('alice', 'USD');
    const b = await account('bob', 'INR');
    expect((await walletService.getWallet(a.id)).currency).toBe('USD');
    expect((await walletService.getWallet(b.id)).currency).toBe('INR');
    expect(BigInt((await walletService.getWallet(a.id)).balanceMinor)).toBe(100000n);
    // opening again (e.g. a second device) must not top up twice
    await authService.openAccount(a);
    expect((await walletService.getLedger(a.id)).length).toBe(1);
  });

  it('rejects under-18 sign ups', async () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 17);
    await expect(authService.signUp({ username: 'kid', email: 'k@x.io', password: 'password1', dob: dob.toISOString().slice(0, 10), currency: 'USD' })).rejects.toThrow(/18/);
  });

  it('keeps the ledger consistent with the balance through bets and settlement', async () => {
    const u = await account('carol', 'USD');
    await walletService.setBalance(u.id, 50000n); // 500.00
    const [bet] = await betService.place(u.id, [{ type: 'SINGLE', legs: [legFor('e1', 2.5)], stakeMinor: 10000n }]);
    expect(BigInt((await walletService.getWallet(u.id)).balanceMinor)).toBe(40000n);
    expect(bet.potentialReturnMinor).toBe('25000');
    const { settled } = await betService.settle(() => 'WON');
    expect(settled[0].status).toBe('WON');
    expect(BigInt((await walletService.getWallet(u.id)).balanceMinor)).toBe(65000n);
    // replaying settlement must not pay twice
    await betService.settle(() => 'WON');
    expect(BigInt((await walletService.getWallet(u.id)).balanceMinor)).toBe(65000n);
    // ledger sums to balance and each balanceAfter chains
    const rows = (await walletService.getLedger(u.id)).reverse();
    let run = 0n;
    for (const r of rows) {
      if (r.type === 'CURRENCY_CONVERT') run = BigInt(r.balanceAfterMinor);
      else run += BigInt(r.amountMinor);
      expect(run).toBe(BigInt(r.balanceAfterMinor));
    }
  });

  it('blocks stakes above balance and below the minimum', async () => {
    const u = await account('dave', 'USD');
    await walletService.setBalance(u.id, 1000n);
    await expect(betService.place(u.id, [{ type: 'SINGLE', legs: [legFor('e1', 2)], stakeMinor: 2000n }])).rejects.toThrow(/Insufficient/);
    await expect(betService.place(u.id, [{ type: 'SINGLE', legs: [legFor('e1', 2)], stakeMinor: 5n }])).rejects.toThrow(/Minimum/);
  });

  it('converts currency and logs it', async () => {
    const u = await account('erin', 'USD');
    await walletService.setBalance(u.id, 10000n);
    const w = await walletService.changeCurrency(u.id, 'INR', 'convert');
    expect(w.balanceMinor).toBe('842000');
    const w2 = await walletService.changeCurrency(u.id, 'JPY', 'keep');
    expect(w2.balanceMinor).toBe('8420');
  });

  it('cashes out fully and partially', async () => {
    const u = await account('fay', 'USD');
    await walletService.setBalance(u.id, 10000n);
    const [bet] = await betService.place(u.id, [{ type: 'SINGLE', legs: [legFor('e1', 2.0)], stakeMinor: 10000n }]);
    const q = [{ fair: 0.6, available: true }];
    const part = await betService.cashOut(u.id, bet.id, 0.5, q, 11400n);
    expect(part.paid).toBe(5700n);
    expect(part.bet.activeStakeMinor).toBe('5000');
    const full = await betService.cashOut(u.id, bet.id, 1, q, 5700n);
    expect(full.paid).toBe(5700n);
    expect(full.bet.status).toBe('CASHED_OUT');
    expect(BigInt((await walletService.getWallet(u.id)).balanceMinor)).toBe(11400n);
  });
});
