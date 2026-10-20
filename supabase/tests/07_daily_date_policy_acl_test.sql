-- Isolated PostgreSQL only: reproduce the invoker ACL required by an RLS helper.
\set ON_ERROR_STOP on
create role authenticated;
create role anon;
create schema private;
grant usage on schema private to authenticated;
create function private.business_today() returns date language sql stable set search_path=pg_catalog
as $$select (current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date$$;
revoke all on function private.business_today() from public,anon,authenticated;
create table public.acl_probe(fecha date not null);
insert into public.acl_probe values ((current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date);
alter table public.acl_probe enable row level security;
alter table public.acl_probe force row level security;
grant select on public.acl_probe to authenticated;
create policy date_select on public.acl_probe for select to authenticated using(fecha=private.business_today());
set role authenticated;
do $$begin
 begin perform count(*) from public.acl_probe;
 exception when insufficient_privilege then
  if sqlerrm <> 'permission denied for function business_today' then raise; end if;
  raise notice 'PASS: reproduces missing helper execute'; return;
 end;
 raise exception 'Expected helper permission failure';
end$$;
reset role;
\ir ../migrations/20261020010000_daily_assignment_date_policy_grant.sql
set role authenticated;
do $$begin
 if (select count(*) from public.acl_probe)<>1 then raise exception 'RLS date read failed'; end if;
 raise notice 'PASS: authenticated RLS date read';
end$$;
reset role;
do $$begin
 if has_function_privilege('anon','private.business_today()','EXECUTE')
 or has_table_privilege('anon','public.acl_probe','SELECT')
 or has_table_privilege('authenticated','public.acl_probe','INSERT,UPDATE,DELETE')
 then raise exception 'Unexpected privilege expansion'; end if;
 raise notice 'PASS: anonymous and direct write privileges remain denied';
end$$;
