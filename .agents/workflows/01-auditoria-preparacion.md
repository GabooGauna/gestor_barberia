# Workflow 01 — Auditoría y preparación

## Entrada

Pedido explícito de Etapa 1 y acceso read-only a repositorio y Supabase.

## Secuencia

1. **Orquestador** congela alcance: solo lectura técnica y documentación.
2. **Backend** inspecciona esquema, constraints, índices, RLS, políticas, grants, cascadas, funciones, triggers y migraciones sin consultar PIN ni filas innecesarias.
3. **Frontend** inventaría rutas, componentes, estados, persistencia, llamadas y flujos.
4. **Orquestador** cruza contratos y prioriza riesgos.
5. **Tester** ejecuta `npm run lint` y `npm run build` sin corregir lógica.
6. **Reviewer** contrasta documentos/evidencia, busca secretos y valida el gate de producción.
7. **Orquestador** entrega resultados y se detiene.

## Evidencia mínima

Inventario de archivos/dependencias, matriz tabla-operación-consumidor, RLS/políticas/grants, cascadas, verificaciones y estado Git con excepción segura por comando.

## Stop conditions

Detener ante escritura remota, necesidad de leer secretos, cambio funcional o intento de iniciar otra etapa sin autorización.
