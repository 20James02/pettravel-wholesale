-- Security hotfix: remove the arbitrary-SQL RPC introduced by update_v2.sql.
-- Run this migration even when update_v2 was applied previously.

do $$
begin
  if to_regprocedure('public.exec_sql(text)') is not null then
    revoke execute on function public.exec_sql(text) from public, anon, authenticated;
  end if;
end
$$;
drop function if exists public.exec_sql(text);
