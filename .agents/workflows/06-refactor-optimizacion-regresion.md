# Workflow 06 — Refactorización y regresión

## Entrada

Etapas previas aceptadas, suite estable y métricas base.

## Secuencia

1. **Orquestador** prioriza deuda por riesgo/valor y congela producto.
2. **Backend** refactoriza contratos/consultas en incrementos con equivalencia probada.
3. **Frontend** separa sesión/datos/presentación y elimina duplicación/código muerto con evidencia.
4. **Tester** ejecuta regresión por lote y compara métricas.
5. **Reviewer** busca comportamiento encubierto, sobreingeniería, seguridad y docs obsoletos.
6. **Orquestador** consolida readiness y riesgos.

## Controles y salida

Optimizar requiere medición; eliminar requiere demostrar no uso; toda regresión repite validación. Salida: instalación reproducible, suite verde y recomendación. Push/deploy no incluidos.
