-- CADNEX admin panel.
--
-- Security model
--  * Admins are listed in public.admins. Nobody can read or change that table from the app:
--    row level security is on with no policies, and table privileges are revoked.
--  * Every admin read and action goes through a SECURITY DEFINER function that first calls
--    public.assert_admin(), which demands (1) a signed-in user listed in public.admins and
--    (2) a session verified with an authenticator-app code (aal2) in the last 12 hours.
--  * Players' own tables keep their row level security unchanged: the admin powers exist
--    only inside these functions.
--  * Every admin action is written to public.admin_audit (also unreadable from the app
--    except through the admin functions).
--  * A banned player can't sign in or refresh their session, so they are locked out within
--    the hour their current access token lasts.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid,
  action text not null,
  target uuid,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists admin_audit_at_idx on public.admin_audit (at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

-- true when this session proved an authenticator code within the window
create or replace function public.admin_mfa_fresh(window_hours int default 12)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (
       select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
       where e ->> 'method' = 'totp'
         and to_timestamp((e ->> 'timestamp')::bigint) > now() - make_interval(hours => window_hours)
     );
$$;
revoke all on function public.admin_mfa_fresh(int) from public, anon, authenticated;

-- the gate every admin function goes through
create or replace function public.assert_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.admins a where a.user_id = uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.admin_mfa_fresh(12) then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  return uid;
end $$;
revoke all on function public.assert_admin() from public, anon, authenticated;

-- what the app asks first: am I an admin, and is my second factor fresh?
create or replace function public.admin_whoami()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.admins a where a.user_id = uid) then
    return jsonb_build_object('admin', false);
  end if;
  return jsonb_build_object('admin', true, 'mfa', public.admin_mfa_fresh(12));
end $$;
revoke all on function public.admin_whoami() from public, anon;
grant execute on function public.admin_whoami() to authenticated;

-- ───────────── dashboard ─────────────
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.assert_admin();
  res jsonb;
begin
  select jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_today', (select count(*) from auth.users where created_at > date_trunc('day', now())),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active_24h', (select count(distinct user_id) from (
        select user_id from public.bets where updated_at > now() - interval '24 hours'
        union select user_id from public.ledger where updated_at > now() - interval '24 hours'
        union select id from auth.users where last_sign_in_at > now() - interval '24 hours') a),
    'bets_total', (select count(*) from public.bets),
    'bets_open', (select count(*) from public.bets where status in ('OPEN', 'PARTIALLY_CASHED_OUT')),
    'bets_today', (select count(*) from public.bets where to_timestamp(placed_at / 1000.0) > date_trunc('day', now())),
    'staked', (select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) from (
        select currency, sum(stake_minor::numeric)::text as total from public.bets group by currency) s),
    'paid_out', (select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) from (
        select currency, sum(amount_minor::numeric)::text as total from public.ledger where type in ('BET_WON', 'BET_REFUND', 'CASHOUT') group by currency) s),
    'signups_30d', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(n, 0)) order by d), '[]'::jsonb)
        from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
        left join (select date_trunc('day', created_at) k, count(*) n from auth.users group by 1) x on x.k = d),
    'bets_30d', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(n, 0)) order by d), '[]'::jsonb)
        from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
        left join (select date_trunc('day', to_timestamp(placed_at / 1000.0)) k, count(*) n from public.bets group by 1) x on x.k = d),
    'top_events', (select coalesce(jsonb_agg(t order by t.n desc), '[]'::jsonb) from (
        select l ->> 'eventId' as event_id, max(l ->> 'home') as home, max(l ->> 'away') as away, max(l ->> 'leagueId') as league, count(*) as n
        from public.bets b, jsonb_array_elements(b.doc -> 'legs') l
        where b.placed_at > (extract(epoch from now() - interval '7 days') * 1000)
        group by 1 order by count(*) desc limit 8) t),
    'big_wins', (select coalesce(jsonb_agg(w), '[]'::jsonb) from (
        select p.username, l.currency, l.amount_minor as amount, l.note, l.created_at
        from public.ledger l left join public.profiles p on p.id = l.user_id
        where l.type = 'BET_WON' order by l.amount_minor::numeric desc limit 8) w)
  ) into res;
  return res;
end $$;

create or replace function public.admin_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.assert_admin();
  q text := '%' || lower(coalesce(trim(p_search), '')) || '%';
begin
  return (
    select jsonb_build_object(
      'total', (select count(*) from auth.users u left join public.profiles p on p.id = u.id where lower(coalesce(p.username, '')) like q or lower(u.email) like q),
      'rows', coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb))
    from (
      select u.id, p.username, u.email, u.created_at, u.last_sign_in_at,
             (u.banned_until is not null and u.banned_until > now()) as banned,
             exists (select 1 from public.admins a where a.user_id = u.id) as is_admin,
             w.currency, w.balance_minor,
             (select count(*) from public.bets b where b.user_id = u.id) as bets,
             (select count(*) from public.bets b where b.user_id = u.id and b.status in ('OPEN', 'PARTIALLY_CASHED_OUT')) as open_bets,
             greatest(u.last_sign_in_at, w.updated_at, (select max(b.updated_at) from public.bets b where b.user_id = u.id)) as last_active
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.wallets w on w.user_id = u.id
      where lower(coalesce(p.username, '')) like q or lower(u.email) like q
      order by u.created_at desc
      limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
    ) r
  );
end $$;

create or replace function public.admin_user(p_target uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.assert_admin();
begin
  return jsonb_build_object(
    'user', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
              'banned', (u.banned_until is not null and u.banned_until > now()), 'username', p.username, 'dob', p.dob, 'currency', p.currency,
              'is_admin', exists (select 1 from public.admins a where a.user_id = u.id))
             from auth.users u left join public.profiles p on p.id = u.id where u.id = p_target),
    'wallet', (select to_jsonb(w) - 'user_id' from public.wallets w where w.user_id = p_target),
    'bets', (select coalesce(jsonb_agg(b.doc order by b.placed_at desc), '[]'::jsonb) from (select doc, placed_at from public.bets where user_id = p_target order by placed_at desc limit 50) b),
    'ledger', (select coalesce(jsonb_agg(to_jsonb(l) - 'user_id' order by l.created_at desc), '[]'::jsonb) from (select * from public.ledger where user_id = p_target order by created_at desc limit 50) l),
    'audit', (select coalesce(jsonb_agg(to_jsonb(a) order by a.at desc), '[]'::jsonb) from (select * from public.admin_audit where target = p_target order by at desc limit 20) a)
  );
end $$;

create or replace function public.admin_audit_log(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public.assert_admin();
begin
  return (select coalesce(jsonb_agg(x order by x.at desc), '[]'::jsonb) from (
    select a.id, a.action, a.detail, a.at, a.target, ap.username as admin, tp.username as target_name
    from public.admin_audit a
    left join public.profiles ap on ap.id = a.admin_id
    left join public.profiles tp on tp.id = a.target
    order by a.at desc limit greatest(1, least(p_limit, 500))) x);
end $$;

-- ───────────── actions (all audited) ─────────────
create or replace function public.admin_gift(p_target uuid, p_amount_minor text, p_note text default 'Gift from CADNEX')
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := public.assert_admin();
  w public.wallets;
  new_bal numeric;
begin
  if p_amount_minor !~ '^[0-9]{1,30}$' or p_amount_minor::numeric <= 0 then
    raise exception 'amount must be a positive whole number of minor units';
  end if;
  select * into w from public.wallets where user_id = p_target for update;
  if not found then raise exception 'that player has no wallet yet'; end if;
  new_bal := w.balance_minor::numeric + p_amount_minor::numeric;
  update public.wallets set balance_minor = new_bal::text, client_updated_at = (extract(epoch from now()) * 1000)::bigint where user_id = p_target;
  insert into public.ledger (id, user_id, type, amount_minor, balance_after_minor, currency, note, created_at)
  values ('l_admin_' || replace(gen_random_uuid()::text, '-', ''), p_target, 'BONUS', p_amount_minor, new_bal::text, w.currency,
          left(coalesce(nullif(trim(p_note), ''), 'Gift from CADNEX'), 120), (extract(epoch from now()) * 1000)::bigint);
  insert into public.admin_audit (admin_id, action, target, detail) values (me, 'gift', p_target, jsonb_build_object('amount_minor', p_amount_minor, 'currency', w.currency, 'note', p_note));
  return jsonb_build_object('balance_minor', new_bal::text, 'currency', w.currency);
end $$;

create or replace function public.admin_set_ban(p_target uuid, p_banned boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := public.assert_admin();
begin
  if p_target = me then raise exception 'you cannot ban yourself'; end if;
  if exists (select 1 from public.admins a where a.user_id = p_target) then raise exception 'admins cannot be banned here'; end if;
  update auth.users set banned_until = case when p_banned then now() + interval '100 years' else null end where id = p_target;
  insert into public.admin_audit (admin_id, action, target, detail) values (me, case when p_banned then 'ban' else 'unban' end, p_target, '{}'::jsonb);
  return jsonb_build_object('banned', p_banned);
end $$;

-- who may call what: signed-in users can call the admin functions, which then refuse
-- anyone who isn't an admin with a fresh second factor. Signed-out visitors can't call them.
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_overview()', 'public.admin_users(text, int, int)', 'public.admin_user(uuid)', 'public.admin_audit_log(int)',
    'public.admin_gift(uuid, text, text)', 'public.admin_set_ban(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- the one admin: the CADNEX account "vlonevasu"
insert into public.admins (user_id)
select p.id from public.profiles p where lower(p.username) = 'vlonevasu'
on conflict do nothing;
