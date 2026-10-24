-- Removes only ordering metadata. UUIDs, tasks, colors and history survive.
-- Run only after reverting the frontend that selects rutinas.orden.
begin;
drop function public.reorder_template_items(uuid[],uuid);
alter table public.rutinas drop column orden;
notify pgrst, 'reload schema';
commit;
