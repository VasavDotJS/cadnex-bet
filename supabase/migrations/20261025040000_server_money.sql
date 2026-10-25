-- Server-owned money (part A: additive; safe while older app versions are still running)
--
-- The `money` Edge Function is now the only writer of wallets, ledger entries and bets.
-- It computes every change with the shared money rules and commits it here, atomically,
-- with an optimistic check that the balance hasn't moved since it was read.

create or replace function public.money_commit(p_user uuid, p_before text, p_wallet jsonb, p_ledger jsonb, p_bets jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur text;
  have boolean;
begin
  select w.balance_minor, true into cur, have from public.wallets w where w.user_id = p_user for update;
  if (cur is distinct from p_before) then
    raise exception 'conflict: balance moved' using errcode = '40001';
  end if;
  if p_wallet is not null then
    if have then
      update public.wallets
         set currency = p_wallet ->> 'currency', balance_minor = p_wallet ->> 'balanceMinor', client_updated_at = (p_wallet ->> 'updatedAt')::bigint
       where user_id = p_user;
    else
      insert into public.wallets (user_id, currency, balance_minor, client_updated_at)
      values (p_user, p_wallet ->> 'currency', p_wallet ->> 'balanceMinor', (p_wallet ->> 'updatedAt')::bigint);
    end if;
  end if;
  insert into public.ledger (id, user_id, type, amount_minor, balance_after_minor, currency, ref_id, note, created_at)
  select x ->> 'id', p_user, x ->> 'type', x ->> 'amountMinor', x ->> 'balanceAfterMinor', x ->> 'currency', x ->> 'refId', x ->> 'note', (x ->> 'createdAt')::bigint
    from jsonb_array_elements(coalesce(p_ledger, '[]'::jsonb)) x;
  insert into public.bets (id, user_id, type, status, currency, stake_minor, placed_at, settled_at, doc)
  select x ->> 'id', p_user, x ->> 'type', x ->> 'status', x ->> 'currency', x ->> 'stakeMinor', (x ->> 'placedAt')::bigint, (x ->> 'settledAt')::bigint,
         jsonb_set(x, '{userId}', to_jsonb(p_user::text))
    from jsonb_array_elements(coalesce(p_bets, '[]'::jsonb)) x
  on conflict (id) do update
     set status = excluded.status, settled_at = excluded.settled_at, doc = excluded.doc
   where public.bets.user_id = p_user;
end $$;
revoke all on function public.money_commit(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.money_commit(uuid, text, jsonb, jsonb, jsonb) to service_role;

-- ── shared rate limiting ───────────────────────────────────
create unlogged table if not exists private.rate_hits (
  bucket text primary key,
  n int not null,
  reset_at timestamptz not null
);
revoke all on private.rate_hits from public, anon, authenticated;

create or replace function private.rate_hit(p_bucket text, p_limit int, p_window_s int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v int;
begin
  insert into private.rate_hits as r (bucket, n, reset_at)
  values (left(p_bucket, 120), 1, now() + make_interval(secs => p_window_s))
  on conflict (bucket) do update
     set n = case when r.reset_at < now() then 1 else r.n + 1 end,
         reset_at = case when r.reset_at < now() then now() + make_interval(secs => p_window_s) else r.reset_at end
  returning n into v;
  return v <= p_limit;
end $$;
revoke all on function private.rate_hit(text, int, int) from public, anon, authenticated;

-- the money function: 60 requests a minute per player
create or replace function public.money_rate_hit(p_user uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$ select private.rate_hit('money:' || p_user::text, 60, 60); $$;
revoke all on function public.money_rate_hit(uuid) from public, anon, authenticated;
grant execute on function public.money_rate_hit(uuid) to service_role;

-- the sign-up username check: 30 a minute per visitor (keyed by the address Cloudflare saw)
create or replace function private.client_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    nullif(trim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
$$;

create or replace function public.username_available(name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.rate_hit('uname:' || private.client_ip(), 30, 60) then
    raise exception 'Too many checks. Wait a minute and try again.' using errcode = '54000';
  end if;
  return not exists (select 1 from public.profiles p where lower(p.username) = lower(trim(name)));
end $$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── self-exclusion and breaks can't be lifted early ────────
create or replace function private.guard_rg()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  now_ms numeric := extract(epoch from now()) * 1000;
  k text;
  o numeric;
  n numeric;
begin
  foreach k in array array['excludedUntil', 'coolOffUntil'] loop
    o := nullif(old.doc -> 'rg' ->> k, '')::numeric;
    if o is not null and o > now_ms then
      n := nullif(new.doc -> 'rg' ->> k, '')::numeric;
      if n is null or n < o then
        if jsonb_typeof(new.doc -> 'rg') is distinct from 'object' then
          new.doc := jsonb_set(new.doc, '{rg}', '{}'::jsonb, true);
        end if;
        new.doc := jsonb_set(new.doc, array['rg', k], to_jsonb(o), true);
      end if;
    end if;
  end loop;
  return new;
end $$;

create trigger settings_guard_rg before update on public.settings for each row execute function private.guard_rg();
