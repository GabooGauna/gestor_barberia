-- RLS evaluates this date-only helper as the querying authenticated role.
-- The earlier cutover revoked it because only SECURITY DEFINER RPCs used it.
-- No table data, RLS predicate, anonymous access or RPC privilege changes.
begin;
revoke execute on function private.business_today() from public, anon;
grant execute on function private.business_today() to authenticated;
commit;
