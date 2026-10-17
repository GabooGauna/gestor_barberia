-- Esquema sintetico previo a Etapa 4 para pruebas locales descartables.
-- No contiene datos reales ni valores de PIN existentes.

begin;

create table public.empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  pin text unique,
  rol text default 'empleado',
  creado_en timestamptz default timezone('utc', now())
);

create table public.rutinas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  creado_en timestamptz default timezone('utc', now())
);

create table public.tareas_rutina (
  id uuid primary key default gen_random_uuid(),
  rutina_id uuid references public.rutinas(id) on delete cascade,
  seccion text not null,
  descripcion text not null,
  orden integer default 0
);

create table public.empleado_rutinas (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete cascade,
  rutina_id uuid references public.rutinas(id) on delete cascade,
  unique (empleado_id, rutina_id)
);

create table public.auditoria_diaria (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid references public.tareas_rutina(id) on delete cascade,
  empleado_id uuid references public.empleados(id) on delete cascade,
  fecha date default current_date,
  completado_en timestamptz default timezone('utc', now())
);

create table public.tareas_urgentes (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete cascade,
  descripcion text not null,
  completada boolean default false,
  fecha date default current_date,
  creado_en timestamptz not null default timezone('utc', now())
);

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;

commit;
