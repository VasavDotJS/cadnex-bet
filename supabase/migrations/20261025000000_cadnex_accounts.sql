-- CADNEX cloud accounts.
-- Every row belongs to one signed-in user and row level security keeps it that way.
-- Money is stored as text of integer minor units, so crypto amounts stay exact.

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- profiles: the public face of an account (the email address lives in auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  avatar_seed integer not null default 0,
  dob date not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_lower_key on public.profiles (lower(username));

create table public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  currency text not null,
  balance_minor text not null check (balance_minor ~ '^-?[0-9]+$'),
  client_updated_at bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.ledger (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  amount_minor text not null check (amount_minor ~ '^-?[0-9]+$'),
  balance_after_minor text not null check (balance_after_minor ~ '^-?[0-9]+$'),
  currency text not null,
  ref_id text,
  note text,
  created_at bigint not null,
  updated_at timestamptz not null default now()
);
create index ledger_user_created_idx on public.ledger (user_id, created_at desc);
create index ledger_user_updated_idx on public.ledger (user_id, updated_at);

create table public.bets (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  status text not null,
  currency text not null,
  stake_minor text not null,
  placed_at bigint not null,
  settled_at bigint,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
create index bets_user_placed_idx on public.bets (user_id, placed_at desc);
create index bets_user_updated_idx on public.bets (user_id, updated_at);

create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  read boolean not null default false,
  created_at bigint not null,
  updated_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_updated_idx on public.notifications (user_id, updated_at);

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger wallets_updated before update on public.wallets for each row execute function public.set_updated_at();
create trigger ledger_updated before update on public.ledger for each row execute function public.set_updated_at();
create trigger bets_updated before update on public.bets for each row execute function public.set_updated_at();
create trigger settings_updated before update on public.settings for each row execute function public.set_updated_at();
create trigger notifications_updated before update on public.notifications for each row execute function public.set_updated_at();

-- row level security: people can only ever see and change their own rows
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger enable row level security;
alter table public.bets enable row level security;
alter table public.settings enable row level security;
alter table public.notifications enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own wallet: read" on public.wallets for select to authenticated using (user_id = (select auth.uid()));
create policy "own wallet: insert" on public.wallets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own wallet: update" on public.wallets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own ledger: read" on public.ledger for select to authenticated using (user_id = (select auth.uid()));
create policy "own ledger: insert" on public.ledger for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own ledger: update" on public.ledger for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own bets: read" on public.bets for select to authenticated using (user_id = (select auth.uid()));
create policy "own bets: insert" on public.bets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own bets: update" on public.bets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own settings: read" on public.settings for select to authenticated using (user_id = (select auth.uid()));
create policy "own settings: insert" on public.settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own settings: update" on public.settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own notifications: read" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "own notifications: insert" on public.notifications for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own notifications: update" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- a new sign-up gets its profile straight away, from the details given at sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := nullif(trim(meta ->> 'username'), '');
  birth date := nullif(meta ->> 'dob', '')::date;
begin
  if uname is null then
    uname := 'player' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  if birth is null or birth > (current_date - interval '18 years') then
    raise exception 'CADNEX accounts are for adults (18+)' using errcode = 'check_violation';
  end if;
  insert into public.profiles (id, username, avatar_seed, dob, currency)
  values (new.id, uname, coalesce((meta ->> 'avatar_seed')::int, 0), birth, coalesce(nullif(meta ->> 'currency', ''), 'USD'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- sign-up form check: is this username free? Answers only yes or no.
create or replace function public.username_available(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles p where lower(p.username) = lower(trim(name)));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- delete my account: removes the login and, through the foreign keys, every row of data
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- live updates between a user's devices
alter publication supabase_realtime add table public.wallets, public.ledger, public.bets, public.settings, public.notifications, public.profiles;
