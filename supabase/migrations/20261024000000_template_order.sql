-- Minimal ordering persistence. Existing NULL values retain the title fallback.
begin;
alter table public.rutinas add column orden integer;

create function public.reorder_template_items(p_ids uuid[], p_rutina_id uuid default null)
returns void language plpgsql security invoker set search_path=pg_catalog set lock_timeout='5s' as $$
declare v_current uuid[];
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_ids is null or coalesce(array_ndims(p_ids),0) <> 1
    or cardinality(p_ids) = 0
    or exists(select 1 from unnest(p_ids) id where id is null)
    or (select count(distinct id) from unnest(p_ids) id) <> cardinality(p_ids)
  then raise exception 'invalid_order_ids' using errcode='22023'; end if;

  -- Serialize reorders and membership changes, including existing insert/archive
  -- callers. The small template catalog needs no new tables or lock protocol.
  lock table public.rutinas, public.tareas_rutina in share row exclusive mode;
  if p_rutina_id is null then
    select array_agg(id order by id) into v_current
      from public.rutinas where archivada_en is null;
  else
    if not exists(select 1 from public.rutinas where id=p_rutina_id and archivada_en is null)
    then raise exception 'routine_not_available' using errcode='22023'; end if;
    select array_agg(id order by id) into v_current from public.tareas_rutina
      where rutina_id=p_rutina_id and archivada_en is null;
  end if;
  if v_current is distinct from array(select id from unnest(p_ids) id order by id)
  then raise exception 'template_order_changed' using errcode='22023'; end if;

  if p_rutina_id is null then
    update public.rutinas r set orden=items.position::integer
      from unnest(p_ids) with ordinality items(id,position) where r.id=items.id;
  else
    update public.tareas_rutina t set orden=items.position::integer
      from unnest(p_ids) with ordinality items(id,position)
      where t.id=items.id and t.rutina_id=p_rutina_id;
  end if;
end;
$$;
revoke all on function public.reorder_template_items(uuid[],uuid) from public, anon, authenticated;
grant execute on function public.reorder_template_items(uuid[],uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
