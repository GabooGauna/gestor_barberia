-- Etapa 3: color identificativo de las rutinas.
-- Esta migracion se prepara localmente y no implica su aplicacion en remoto.

begin;

alter table public.rutinas
  add column color text not null default 'copper';

alter table public.rutinas
  add constraint rutinas_color_palette_check
  check (color in ('copper', 'sage', 'steel', 'plum'));

comment on column public.rutinas.color is
  'Identificador semantico de paleta: copper, sage, steel o plum.';

commit;
