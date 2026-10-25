-- Server-owned money (part B: lockdown, applied once the app that uses the money function was live)
--
-- Players can read their wallet, ledger and bets, but only the `money` Edge Function (through
-- money_commit, as the service role) can write them. The write policies are also closed, so
-- even a future grant by mistake wouldn't reopen direct writes.

revoke insert, update on public.wallets, public.ledger, public.bets from authenticated;

alter policy "own wallet: insert" on public.wallets with check (false);
alter policy "own wallet: update" on public.wallets using (false) with check (false);
alter policy "own ledger: insert" on public.ledger with check (false);
alter policy "own ledger: update" on public.ledger using (false) with check (false);
alter policy "own bets: insert" on public.bets with check (false);
alter policy "own bets: update" on public.bets using (false) with check (false);
