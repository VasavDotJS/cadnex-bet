-- The owner's personal avatar (seed 9000) is reserved for admins.
-- Anyone else who tries to set it (sign-up metadata or a profile update) is refused.
create or replace function private.guard_owner_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.avatar_seed = 9000
     and (tg_op = 'INSERT' or old.avatar_seed is distinct from 9000)
     and not exists (select 1 from public.admins a where a.user_id = new.id) then
    raise exception 'That avatar is reserved.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_owner_avatar() from public, anon, authenticated;

create trigger profiles_guard_owner_avatar
  before insert or update of avatar_seed on public.profiles
  for each row execute function private.guard_owner_avatar();
