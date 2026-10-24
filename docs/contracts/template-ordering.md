# Orden de plantillas

## Persistencia

`rutinas.orden integer NULL` es el único dato nuevo. No tiene backfill: hasta el
primer reordenamiento se conserva la lectura alfabética. Posiciones explícitas
se leen primero, luego nulos; desempate por título y UUID. Las rutinas nuevas
quedan al final del orden explícito. Las tareas reutilizan `tareas_rutina.orden`;
se agregan después del máximo vigente, incluso si hay huecos por archivado.

`public.reorder_template_items(p_ids uuid[], p_rutina_id uuid default null)`
guarda posiciones consecutivas desde 1. Sin rutina ordena todas las rutinas
activas; con rutina ordena solamente sus tareas activas. Lista sin nulos,
duplicados ni elementos omitidos/agregados. Rechaza conjuntos desactualizados,
archivados y tareas de otras rutinas. Una transacción y locks en orden fijo
serializan guardados e inserciones/archivados; lock timeout de 5 segundos.

RPC SECURITY INVOKER con `private.is_admin()` vigente: administrador activo AAL2
y servicio abierto. No cambia grants/políticas/guards existentes. Anónimo sin
EXECUTE; empleado, sesión ausente, AAL1 y mantenimiento no permiten reordenar.
UUID, relaciones, colores y registros históricos se conservan. Escrituras
concurrentes sobre el mismo conjunto: gana la última operación aceptada.

## UI y consumidores

dnd-kit core/sortable con asas PointerSensor y KeyboardSensor. Espacio levanta,
flechas desplazan, espacio guarda, Escape cancela; instrucciones y anuncios en
español. Contextos independientes impiden mover pasos entre rutinas. Sólo el asa
captura el gesto, con `touch-action:none`; el resto permite scroll/selección y
los controles conservan sus acciones. Estilos usan tokens GNS y movimiento
reducido. Mientras se arrastra o guarda se bloquean acciones incompatibles.

Actualización optimista de la lista; error restaura la lista anterior en UI y
explica cómo comprobar/reintentar. Una respuesta perdida puede corresponder a
un COMMIT aceptado: se recomienda recargar y no se afirma reversión del servidor.
Plantillas, Asignaciones, Mis tareas y detalles de Auditoría leen el orden actual;
no se modifica cumplimiento ni se crean snapshots históricos de posiciones.

## Publicación y recuperación

Aplicar sólo `20261024000000_template_order.sql` antes del frontend. No usar
`db push` sobre la cadena histórica. `scripts/apply-template-order.ps1 -Action
Inspect` verifica esquema/agregados sin datos personales. `Apply` valida destino
exacto y conserva internamente huellas de las siete tablas, ACL/RLS/políticas;
aborta atómicamente ante diferencias. No reejecutar si ya existe columna/RPC.

Rollback: revertir primero el frontend; luego el SQL homónimo de `rollbacks/`
elimina únicamente columna/RPC. Las posiciones de tareas existentes se conservan.
`node scripts/template-order-drill.mjs` verifica SQL, atomicidad, autorización,
transacción Apply exacta y rollback en PostgreSQL local descartable sin red.
