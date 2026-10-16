-- Rollback manual de 20261016000000_add_rutinas_color.sql.
-- Ejecutar solo en un entorno autorizado y despues de evaluar/exportar los
-- valores de color, ya que eliminar la columna descarta esa personalizacion.

begin;

alter table public.rutinas
  drop constraint rutinas_color_palette_check;

alter table public.rutinas
  drop column color;

commit;
