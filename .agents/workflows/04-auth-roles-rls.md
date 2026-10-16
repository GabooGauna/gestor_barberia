# Workflow 04 — Auth, roles y RLS

## Entrada

Matriz de acceso, ciclo de cuentas, entorno aislado y plan de migración aprobados.

## Secuencia

1. **Orquestador** congela matriz rol-operación-fila y gates.
2. **Backend** diseña migraciones, perfil/Auth, constraints, índices, grants y RLS; prueba permitido/denegado y cascadas localmente.
3. **Reviewer** realiza revisión de seguridad previa.
4. **Frontend** implementa sesión/guards/login/recuperación y elimina PIN/perfil completo del cliente.
5. **Tester** prueba roles, ids/payload/storage manipulados, expiración, revocación y E2E.
6. **Reviewer** verifica mínimo privilegio, ausencia de bypass y migración.
7. **Orquestador** evalúa gate; aplicar remoto requiere aprobación separada.

## Controles bloqueantes y salida

Ninguna política usa datos editables como autoridad, ninguna clave privilegiada llega al bundle, y no se habilita RLS ni migran datos sin políticas probadas/autorización. No leer PIN. Salida: contrato seguro y evidencia por rol. No iniciar Etapa 5.
