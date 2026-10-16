# Agentes del proyecto Gestor de Barbería

Este archivo define la forma de trabajo multirol del repositorio. Toma como referencia una organización por especialidades y revisiones cruzadas, sin heredar reglas de negocio de otros sistemas.

## Fuentes de verdad

Antes de actuar, todo agente debe leer, en este orden:

1. `docs/PROJECT_CONTEXT.md`: arquitectura y contratos actuales.
2. `docs/PRD.md`: objetivos del producto y requisitos transversales.
3. `docs/RULES.md`: límites técnicos, de seguridad y operación.
4. El documento de la etapa en `docs/stages/`.
5. Su workflow homónimo en `.agents/workflows/`.

Si el código, el esquema inspeccionado y la documentación difieren, se detiene la implementación, se registra la discrepancia y el Orquestador decide qué fuente debe actualizarse. Nunca se adapta el código silenciosamente a una suposición.

## Roles

### Orquestador

- Confirma etapa activa, alcance, dependencias y riesgos antes de modificar archivos.
- Divide el trabajo por contratos verificables y define el orden de intervención.
- Evita que dos roles editen el mismo contrato sin un handoff explícito.
- Mantiene trazabilidad entre hallazgo, decisión, cambio, prueba y criterio de aceptación.
- Detiene el trabajo ante una operación remota, migración, despliegue, push o cambio de alcance no autorizado.
- Solo declara una etapa finalizada cuando Tester y Reviewer aprobaron sus gates.

### Backend

- Es responsable del contrato de datos, Supabase Auth, sesiones, roles, RLS, políticas, migraciones versionadas y semántica de borrado.
- Diseña primero las migraciones y pruebas en un entorno local o aislado; no aplica cambios remotos sin autorización expresa.
- Mantiene el principio de mínimo privilegio y documenta matrices de acceso por rol y tabla.
- Nunca consulta, registra ni copia valores reales de PIN, tokens, claves o datos personales innecesarios.
- Entrega al Frontend contratos estables: campos, errores, permisos, estados de sesión y operaciones permitidas.

### Frontend

- Es responsable de rutas, componentes, estado, accesibilidad, diseño responsive, temas y consumo seguro de contratos.
- No implementa autorización basada solo en ocultar controles o confiar en `localStorage`.
- Evita `select("*")`, limita datos a lo necesario y no persiste secretos ni perfiles completos en el navegador.
- Mantiene estados de carga, vacío, error, éxito y permisos denegados para cada flujo.
- Agrega o actualiza selectores y contratos de UI necesarios para pruebas E2E sin acoplarlas al estilo visual.

### Tester

- Define la estrategia de validación antes o junto con la implementación.
- Ejecuta lint, build y las pruebas aplicables; desde la Etapa 2 mantiene Playwright y, al cerrar etapas con cambios funcionales, ejecuta E2E.
- Cubre caminos felices, permisos, sesión expirada, entradas inválidas, errores de red, regresiones y operaciones destructivas.
- No escribe sobre datos remotos reales. Los datos de prueba deben ser locales, aislados o explícitamente autorizados.
- Reporta evidencia reproducible: comando, entorno, resultado y fallas pendientes.

### Reviewer

- Revisa después de las validaciones del Tester y es independiente del autor principal del cambio.
- Prioriza seguridad, pérdida de datos, regresiones, contratos rotos, accesibilidad y mantenibilidad.
- Verifica que el cambio respete `docs/RULES.md`, el stage activo y sus criterios de aceptación.
- Rechaza afirmaciones sin evidencia, pruebas omitidas sin justificación o documentación desactualizada.
- Clasifica hallazgos como bloqueante, alto, medio o bajo y exige resolver todo bloqueante antes del cierre.

## Orden de ejecución

El flujo base es:

1. **Orquestador:** abre la etapa, confirma alcance y asigna contratos.
2. **Backend:** interviene primero cuando cambian datos, autenticación, permisos o API; si no aplica, deja constancia.
3. **Frontend:** implementa contra el contrato aprobado; si no aplica, deja constancia.
4. **Tester:** valida en un entorno permitido y adjunta resultados.
5. **Reviewer:** realiza revisión final y puede devolver el trabajo a cualquier rol.
6. **Orquestador:** comprueba el gate de salida, actualiza documentación y cierra la etapa.

En la Etapa 1 los roles Backend y Frontend solo auditan; no implementan correcciones. Los ciclos de corrección siguen el orden del contrato afectado y vuelven a Tester y Reviewer.

## Handoffs obligatorios

Cada handoff debe indicar etapa y objetivo, archivos o contratos modificados, decisiones y supuestos, riesgos abiertos, verificaciones con resultado y próximo rol/acción. No puede incluir secretos, datos reales innecesarios ni resultados no reproducibles.

## Criterios de revisión

- **Alcance:** solo se implementó lo definido por el stage activo.
- **Seguridad:** autenticación real, autorización en servidor/RLS, mínimo privilegio y ausencia de secretos expuestos.
- **Datos:** migraciones reversibles o con recuperación documentada, integridad referencial y borrados deliberados.
- **Calidad:** lint y build exitosos, errores controlados, código entendible y documentación sincronizada.
- **UX:** flujos completos, responsive, accesibles, temas coherentes y acciones visibles.
- **Pruebas:** cobertura proporcional al riesgo; E2E con Playwright en toda etapa que cambie flujos implementados.

## Condiciones globales de finalización

Una etapa termina únicamente cuando todos sus criterios están satisfechos o existe una excepción aprobada, no quedan hallazgos bloqueantes/altos introducidos, pasan las verificaciones requeridas, Tester y Reviewer aprueban, la documentación refleja el estado real y no hubo operaciones remotas no autorizadas.

La aplicación **no puede declararse apta para producción** mientras persistan la autenticación por PIN desde el cliente, la autorización basada en estado manipulable del navegador, RLS desactivado o permisos amplios que expongan datos a `anon`.
