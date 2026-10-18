# Contrato de color por rutina

## Estado y alcance

Actualización del 18 de octubre de 2026: el propietario autorizó la aplicación
real como operación independiente posterior a verificar autenticación,
RLS y seguridad. Aún no aplicada ni activada; ver
`../decisions/stage-04-manual-backup-and-color-authorization.md`. La autorización
no sustituye verificar esquema, integridad, recuperación y frontend compatible.

Este contrato pertenece a la Etapa 3. La migracion
`supabase/migrations/20261016000000_add_rutinas_color.sql` esta preparada en el
repositorio, pero **no fue aplicada** a Supabase remoto ni a datos reales.

La inspeccion documentada del esquema vigente solo confirma `id`, `titulo` y
`creado_en` en `public.rutinas`. Hasta que un entorno aplique y verifique la
migracion, el frontend debe asumir que la columna `color` no existe.

## Contrato de datos

La migracion agrega:

| Propiedad | Contrato |
|---|---|
| Columna | `public.rutinas.color` |
| Tipo | `text` |
| Nulabilidad | `NOT NULL` |
| Valor por defecto | `copper` |
| Valores validos | `copper`, `sage`, `steel`, `plum` |
| Constraint | `rutinas_color_palette_check` |

Los valores son identificadores semanticos de una paleta estable. No se
persisten codigos hexadecimales, nombres de clases CSS ni colores arbitrarios.
La presentacion resuelve cada identificador a tokens adecuados para tema claro
y oscuro.

La constante por defecto hace que las filas existentes adopten `copper` al
aplicar la migracion. Crear una rutina sin enviar `color` tambien produce
`copper`. Restaurar el color predeterminado equivale a actualizarlo a
`copper`; no se usa `NULL`.

## Capacidad y despliegue seguro

La capacidad del cliente se controla con la variable de build:

```text
VITE_ENABLE_RUTINAS_COLOR=true
```

Solo el valor normalizado exactamente igual a `true` habilita la capacidad. La
normalizacion contractual es
`String(import.meta.env.VITE_ENABLE_RUTINAS_COLOR ?? "").trim().toLowerCase() === "true"`.
Una variable ausente, vacia o con cualquier otro valor equivale a `false`. Esta
bandera no es un control de seguridad: solo coordina la version del cliente con
la version del esquema.

Con la capacidad deshabilitada:

- las consultas a `rutinas` no incluyen `color`;
- los `INSERT` y `UPDATE` no incluyen `color`;
- la interfaz usa `copper` como fallback visual local;
- no se reintenta una consulta fallida agregando o quitando columnas.

Con la capacidad habilitada:

- las consultas que muestran rutinas incluyen `color` explicitamente;
- un alta puede omitir `color` para usar el default de base o enviar un valor
  valido;
- la edicion envia unicamente uno de los cuatro identificadores permitidos;
- el cliente conserva un fallback defensivo `color ?? "copper"` para respuestas
  simuladas o cacheadas, sin convertirlo en una escritura.

El orden de habilitacion por ambiente es obligatorio:

1. Aplicar y verificar la migracion en una base local o staging aislada.
2. Comprobar filas existentes, default, constraint y rollback con datos
   sinteticos.
3. Aplicar la migracion en el ambiente autorizado.
4. Confirmar que la columna y el constraint existen.
5. Recién entonces construir/desplegar el frontend con
   `VITE_ENABLE_RUTINAS_COLOR=true` para ese ambiente.

Nunca se debe habilitar primero el cliente: PostgREST rechazaria lecturas o
escrituras que nombren una columna inexistente. Tampoco se debe habilitar la
bandera solo porque el mock E2E acepte el campo.

## Contratos de lectura y escritura

Ejemplos de proyeccion:

```text
# Capacidad deshabilitada
id, titulo, tareas_rutina (id, seccion, descripcion, orden)

# Capacidad habilitada
id, titulo, color, tareas_rutina (id, seccion, descripcion, orden)
```

Ejemplos de payload:

```json
{ "titulo": "Apertura" }
```

```json
{ "titulo": "Apertura", "color": "steel" }
```

```json
{ "color": "copper" }
```

Un valor fuera de la paleta falla con el constraint
`rutinas_color_palette_check`. La interfaz debe validarlo antes de enviar y
mostrar un error recuperable si la base rechaza la operacion.

## Verificacion local pendiente de aplicacion

En una base descartable, el gate minimo es:

- las filas previas quedan con `color = 'copper'`;
- omitir `color` en un alta produce `copper`;
- cada identificador permitido se puede insertar y actualizar;
- `NULL`, un hexadecimal y cualquier otro texto son rechazados;
- el rollback elimina constraint y columna dentro de una transaccion;
- tras rollback, el cliente con la capacidad deshabilitada sigue operando sin
  mencionar `color`.

No existe una base PostgreSQL/Supabase local configurada en este repositorio, de
modo que este documento no afirma que la migracion haya sido ejecutada.

## Rollback

El rollback manual esta en
`supabase/rollbacks/20261016000000_add_rutinas_color.down.sql` y no forma parte
del directorio autoaplicable de migraciones. Antes de ejecutarlo se debe:

1. volver a desplegar o construir el cliente con la capacidad deshabilitada;
2. confirmar que ninguna consulta o escritura menciona `color`;
3. exportar los valores si deben conservarse;
4. ejecutar el rollback solo en un entorno autorizado;
5. verificar que los flujos base de rutinas siguen funcionando.

Eliminar la columna pierde la personalizacion de color. El resto de los datos
de `rutinas` no se modifica.
