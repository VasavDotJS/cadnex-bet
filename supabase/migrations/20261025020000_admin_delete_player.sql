-- Optional: lets the admin panel permanently delete a player (login and every row of data).
-- Kept separate because it deletes from auth.users; run it in the Supabase SQL editor if wanted.

create or replace function public.admin_delete_user(p_target uuid, p_confirm_username text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := public.assert_admin();
  uname text;
begin
  if p_target = me then raise exception 'you cannot delete your own admin account here'; end if;
  if exists (select 1 from public.admins a where a.user_id = p_target) then raise exception 'admins cannot be deleted here'; end if;
  select username into uname from public.profiles where id = p_target;
  if uname is null or lower(uname) <> lower(trim(p_confirm_username)) then raise exception 'type the username exactly to confirm'; end if;
  insert into public.admin_audit (admin_id, action, target, detail) values (me, 'delete_user', null, jsonb_build_object('username', uname, 'id', p_target));
  delete from auth.users where id = p_target;
  return jsonb_build_object('deleted', true);
end $$;

revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;
