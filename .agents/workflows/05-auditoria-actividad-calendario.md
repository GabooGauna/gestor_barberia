# Workflow 05 — Auditoría y actividad

## Entrada

Auth/RLS aprobados, retención definida y zona horaria acordada.

## Secuencia

1. **Orquestador** define casos, volúmenes y permisos.
2. **Backend** propone contrato paginado, filtros e índices; prueba integridad, rendimiento y RLS con datos sintéticos.
3. **Frontend** implementa actividad, filtros, historial y calendario con estados completos.
4. **Tester** cubre filtros, límites temporales, paginación, zona horaria, vacío/error y acceso denegado.
5. **Reviewer** contrasta vistas con el mismo conjunto de eventos y revisa privacidad/rendimiento.
6. **Orquestador** documenta contrato y riesgos.

## Controles y salida

No descargar tablas completas, exponer eventos fuera del rol ni corregir historial sin política trazable. Salida: vistas consistentes, consultas medidas y verificaciones verdes. No iniciar Etapa 6.
