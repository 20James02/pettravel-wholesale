-- Verification checks for update_v7_accounting_order_posting.sql on Supabase.
-- Expected result: every row should return ok = true.

with checks as (
  select
    'pt_ensure_accounting_period function exists' as check_name,
    to_regprocedure('public.pt_ensure_accounting_period(text,date)') is not null as ok,
    to_regprocedure('public.pt_ensure_accounting_period(text,date)')::text as detail

  union all

  select
    'pt_post_order_accounting function exists',
    to_regprocedure('public.pt_post_order_accounting(text,text,text,integer,boolean)') is not null,
    to_regprocedure('public.pt_post_order_accounting(text,text,text,integer,boolean)')::text

  union all

  select
    'payment_allocations idempotency index exists',
    to_regclass('public.idx_payment_allocations_unique_payment_request') is not null,
    coalesce(to_regclass('public.idx_payment_allocations_unique_payment_request')::text, 'missing')

  union all

  select
    'journal_lines supplier_id column exists',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'journal_lines'
        and column_name = 'supplier_id'
    ),
    coalesce((
      select data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'journal_lines'
        and column_name = 'supplier_id'
    ), 'missing')

  union all

  select
    'anon cannot execute pt_post_order_accounting',
    not has_function_privilege(
      'anon',
      'public.pt_post_order_accounting(text,text,text,integer,boolean)',
      'EXECUTE'
    ),
    has_function_privilege(
      'anon',
      'public.pt_post_order_accounting(text,text,text,integer,boolean)',
      'EXECUTE'
    )::text

  union all

  select
    'authenticated cannot execute pt_post_order_accounting',
    not has_function_privilege(
      'authenticated',
      'public.pt_post_order_accounting(text,text,text,integer,boolean)',
      'EXECUTE'
    ),
    has_function_privilege(
      'authenticated',
      'public.pt_post_order_accounting(text,text,text,integer,boolean)',
      'EXECUTE'
    )::text

  union all

  select
    'service_role can execute pt_post_order_accounting',
    has_function_privilege(
      'service_role',
      'public.pt_post_order_accounting(text,text,text,integer,boolean)',
      'EXECUTE'
    ),
    has_function_privilege(
      'service_role',
      'public.pt_post_order_accounting(text,text,text,integer,boolean)',
      'EXECUTE'
    )::text
)
select *
from checks
order by check_name;
