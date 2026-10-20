import {
  expect,
  seedAuthSession,
  test,
} from "./fixtures/supabase-mock";

const admin = { id: "10000000-0000-4000-8000-000000000001", auth_user_id: "20000000-0000-4000-8000-000000000001", nombre: "Administración", usuario: "admin.gns", rol: "admin", activo: true };
const empleado = { id: "10000000-0000-4000-8000-000000000002", auth_user_id: "20000000-0000-4000-8000-000000000002", nombre: "Ana", usuario: "ana", rol: "empleado", activo: true };

test("recorre los componentes principales del panel administrador", async ({
  page,
  supabaseMock,
}) => {
  await seedAuthSession(page, supabaseMock, admin);
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
    page.getByRole("heading", { name: "Registrar integrante" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Asignaciones/ }).click();
  await expect(
    page.getByRole("heading", { name: "Asignaciones del día" }),
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
  await seedAuthSession(page, supabaseMock, empleado);
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
