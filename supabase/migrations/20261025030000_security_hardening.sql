-- Security hardening (audit, 25 Oct 2026)
--
-- 1. Least privilege: signed-out visitors get nothing on player tables; signed-in players
--    can't truncate or alter references, and can only edit their own username, avatar and
--    currency on their profile (date of birth is fixed at sign-up).
-- 2. A banned player's still-valid session can no longer write anything (bans used to bite
--    only when the session refreshed, up to an hour later).
-- 3. Sane sizes and formats on everything a player can write, so nobody can bloat the free
--    database or feed absurd numbers into the admin dashboard's totals.
-- 4. A per-player row cap on the append-only tables.

-- ── 1. privileges ─────────────────────────────────────────────
revoke all on public.profiles, public.wallets, public.ledger, public.bets, public.settings, public.notifications from anon;
revoke truncate, references, trigger on public.profiles, public.wallets, public.ledger, public.bets, public.settings, public.notifications from authenticated;

revoke update on public.profiles from authenticated;
grant update (username, avatar_seed, currency) on public.profiles to authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ── 2. banned players can't write ─────────────────────────────
create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.banned_until > now() from auth.users u where u.id = auth.uid()), false);
$$;
revoke all on function public.is_banned() from public, anon;
grant execute on function public.is_banned() to authenticated;

alter policy "own wallet: insert" on public.wallets with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own wallet: update" on public.wallets using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own ledger: insert" on public.ledger with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own ledger: update" on public.ledger using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own bets: insert" on public.bets with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own bets: update" on public.bets using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own settings: insert" on public.settings with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own settings: update" on public.settings using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own notifications: insert" on public.notifications with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own notifications: update" on public.notifications using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and not (select public.is_banned()));
alter policy "own profile: update" on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()) and not (select public.is_banned()));

-- ── 3. sizes and formats ──────────────────────────────────────
alter table public.profiles
  add constraint profiles_currency_fmt check (currency ~ '^[A-Z0-9]{2,6}$'),
  add constraint profiles_avatar_seed_range check (avatar_seed between 0 and 1000000);

alter table public.wallets
  add constraint wallets_currency_fmt check (currency ~ '^[A-Z0-9]{2,6}$'),
  add constraint wallets_balance_len check (length(balance_minor) <= 30);

alter table public.ledger
  add constraint ledger_id_len check (length(id) between 1 and 100),
  add constraint ledger_type_fmt check (type ~ '^[A-Z_]{2,30}$'),
  add constraint ledger_currency_fmt check (currency ~ '^[A-Z0-9]{2,6}$'),
  add constraint ledger_amount_len check (length(amount_minor) <= 30 and length(balance_after_minor) <= 30),
  add constraint ledger_ref_len check (ref_id is null or length(ref_id) <= 100),
  add constraint ledger_note_len check (note is null or length(note) <= 200);

alter table public.bets
  add constraint bets_id_len check (length(id) between 1 and 100),
  add constraint bets_type_fmt check (type ~ '^[A-Z_]{2,20}$'),
  add constraint bets_status_fmt check (status ~ '^[A-Z_]{2,20}$'),
  add constraint bets_currency_fmt check (currency ~ '^[A-Z0-9]{2,6}$'),
  add constraint bets_stake_fmt check (stake_minor ~ '^[0-9]{1,30}$'),
  add constraint bets_doc_size check (pg_column_size(doc) <= 65536);

alter table public.settings
  add constraint settings_doc_size check (pg_column_size(doc) <= 32768);

alter table public.notifications
  add constraint notifications_id_len check (length(id) between 1 and 100),
  add constraint notifications_kind_len check (length(kind) <= 30),
  add constraint notifications_text_len check (length(title) <= 200 and length(body) <= 1000),
  -- in-app paths only: no external or javascript: links in a player's notifications
  add constraint notifications_link_fmt check (link is null or (length(link) <= 300 and link ~ '^/([^/\\].*)?$'));

-- ── 4. row caps on append-only tables ─────────────────────────
create or replace function public.enforce_row_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap int := tg_argv[0]::int;
  n int;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into n using new.user_id;
  if n >= cap then
    raise exception 'row limit reached for this account' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function public.enforce_row_cap() from public, anon, authenticated;

create trigger bets_row_cap before insert on public.bets for each row execute function public.enforce_row_cap('25000');
create trigger ledger_row_cap before insert on public.ledger for each row execute function public.enforce_row_cap('100000');
create trigger notifications_row_cap before insert on public.notifications for each row execute function public.enforce_row_cap('20000');

-- keep the ban check out of the public API (policies follow the function to its new schema)
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_banned() set schema private;
