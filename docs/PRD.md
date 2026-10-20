# PRD — Gestor de Barbería

## Visión

Convertir el prototipo en una herramienta segura y profesional para organizar rutinas operativas, asignar trabajo y auditar cumplimiento diario sin exponer identidades, credenciales ni datos del negocio.

## Usuarios

- **Administrador:** administra equipo, plantillas, asignaciones, urgencias y auditoría; también realiza tareas asignadas a su propia cuenta.
- **Empleado/barbero:** consulta únicamente su trabajo permitido y registra cumplimiento.
- **Responsable operativo:** posible rol de consulta histórica; debe confirmarse antes de modelarlo.

## Problemas

- El prototipo confía en PIN y estado local manipulable.
- La base pública carece de RLS y concede CRUD completo a clientes anónimos.
- La interfaz no tiene sistema visual, navegación ni temas consistentes.
- La auditoría es una vista calculada limitada, mutable y difícil de explorar.
- No hay suite E2E ni gates confiables de regresión.

## Objetivos

1. Proteger identidad y datos mediante Supabase Auth, sesiones, roles y RLS.
2. Ofrecer una experiencia clara, responsive y accesible en modo claro y oscuro.
3. Mantener administración de rutinas, tareas, equipo, asignaciones y urgencias.
4. Proveer actividad reciente, filtros, historial visual y calendario secundario.
5. Hacer el sistema mantenible, observable y verificable con pruebas automatizadas.

## Requisitos funcionales objetivo

### Identidad y acceso

- Inicio de sesión con usuario y contraseña mediante Supabase Auth.
- Persistencia, renovación, cierre y recuperación de sesión según política aprobada.
- Roles confiables vinculados a `auth.users`, nunca definidos por el navegador.
- Rutas y acciones protegidas con estados de carga, expiración y permiso denegado.

### Administración operativa

- Administrar plantillas, tareas, integrantes, asignaciones y urgencias.
- Evitar manipular credenciales desde tablas públicas.
- Evitar asignaciones duplicadas.
- Explicar impacto de acciones destructivas y aplicar conservación aprobada.
- Permitir autoasignación administrativa sin otra cuenta ni cambio de rol.
- Ofrecer «Mis tareas» en administración con trabajo vigente de hoy, cumplimiento
  reversible y progreso diario compartidos con el panel de empleados. Registrar
  el trabajo con la identidad propia en la auditoría común; cada nuevo día sin
  asignaciones heredadas, conservando plantillas e historial.

### Trabajo del empleado

- Ver solo rutinas y urgencias autorizadas.
- Registrar cumplimiento dentro de reglas definidas.
- Recibir confirmación, error recuperable y estado sincronizado.

### Auditoría

- Actividad reciente, filtros por fecha/persona/tipo/estado/rutina e historial visual.
- Calendario secundario como navegación temporal, no como única vista.
- Conservación y mutabilidad explícitas; terceros no autorizados no pueden alterar historial.

### Experiencia visual

- Tokens para ambas paletas, tipografía, espaciado, elevación y estados.
- Modo claro/oscuro persistido y navegación profesional responsive.
- Botones primarios, secundarios y destructivos claramente visibles.
- Animaciones sutiles compatibles con `prefers-reduced-motion`.
- Teclado, foco, etiquetas y contraste accesibles.

## Requisitos no funcionales

- **Seguridad:** mínimo privilegio, RLS por defecto, secretos fuera del cliente y pruebas negativas.
- **Integridad:** constraints/índices coherentes y borrados/migraciones con recuperación.
- **Rendimiento:** evitar consultas completas y agregación innecesaria en cliente.
- **Calidad:** lint/build obligatorios; Playwright desde la Etapa 2.
- **Mantenibilidad:** contratos centralizados, componentes acotados y documentación sincronizada.
- **Privacidad:** datos mínimos; nunca registrar credenciales o PIN.
- **Compatibilidad:** navegadores modernos desktop/móvil; matriz en Etapa 2.

## Métricas de aceptación global

- Cero acceso anónimo no previsto a tablas de negocio.
- Cero elevación de rol alterando storage o requests.
- Escenarios críticos de sesión/autorización cubiertos por pruebas.
- Build y lint reproducibles; E2E verdes en la matriz acordada.
- Sin hallazgos bloqueantes o altos abiertos para producción.

## Roadmap

1. Auditoría, documentación y agentes.
2. Skills de frontend y Playwright.
3. Rediseño visual completo.
4. Supabase Auth, sesiones, roles y RLS.
5. Nueva experiencia de auditoría.
6. Refactorización, optimización y regresión.

Cada etapa requiere cierre explícito; ninguna habilita automáticamente la siguiente.

## Fuera de alcance

Agenda de turnos, caja, inventario, pagos, clientes, notificaciones push, apps nativas, despliegue no autorizado y requisitos regulatorios no provistos.

## Bloqueo de producción

Mientras sigan activos el PIN en cliente, los roles confiados a `localStorage`, la ausencia de Supabase Auth/RLS y los permisos CRUD de `anon`, el producto es un prototipo inseguro y no puede promoverse a producción.
