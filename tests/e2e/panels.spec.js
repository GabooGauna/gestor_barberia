import {
  expect,
  seedLegacySession,
  test,
} from "./fixtures/supabase-mock";

const admin = { id: "admin-1", nombre: "Administración", rol: "admin" };
const empleado = { id: "empleado-1", nombre: "Ana", rol: "empleado" };

test("recorre los componentes principales del panel administrador", async ({
  page,
  supabaseMock,
}) => {
  await seedLegacySession(page, admin);
  supabaseMock.setTable("empleados", [admin]);
  supabaseMock.setTable("rutinas", []);
  supabaseMock.setTable("tareas_rutina", []);
  supabaseMock.setTable("empleado_rutinas", []);
  supabaseMock.setTable("auditoria_diaria", []);
  supabaseMock.setTable("tareas_urgentes", []);

  await page.goto("/panel");

  await expect(
    page.getByRole("heading", { name: "Mesa de trabajo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Creador de Plantillas (SOP)" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Equipo/ }).click();
  await expect(
    page.getByRole("heading", { name: "Registrar Nuevo Empleado" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Asignaciones/ }).click();
  await expect(
    page.getByRole("heading", { name: "Asignación de Rutinas al Personal" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Urgencias/ }).click();
  await expect(
    page.getByRole("heading", { name: /Enviar Tarea Urgente/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Auditoría" }).click();
  await expect(
    page.getByRole("heading", { name: "Calendario Operativo y Auditoría" }),
  ).toBeVisible();
  expect(supabaseMock.mutations).toEqual([]);
});

test("muestra el estado vacío del panel de empleado", async ({
  page,
  supabaseMock,
}) => {
  await seedLegacySession(page, empleado);
  supabaseMock.setTable("empleado_rutinas", []);
  supabaseMock.setTable("rutinas", []);
  supabaseMock.setTable("tareas_urgentes", []);
  supabaseMock.setTable("auditoria_diaria", []);

  await page.goto("/panel");

  await expect(
    page.getByRole("heading", { name: "Mis Protocolos Asignados" }),
  ).toBeVisible();
  await expect(
    page.getByText("No tienes tareas ni rutinas asignadas en este momento."),
  ).toBeVisible();
  expect(supabaseMock.mutations).toEqual([]);
});
