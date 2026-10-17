import {
  expect,
  seedAuthSession,
  test,
} from "./fixtures/supabase-mock";

const admin = { id: "10000000-0000-4000-8000-000000000001", auth_user_id: "20000000-0000-4000-8000-000000000001", nombre: "Administración", usuario: "admin.gns", rol: "admin", activo: true };

test("mantiene compatibilidad con el esquema sin color cuando la capacidad está apagada", async ({
  page,
  supabaseMock,
}) => {
  await seedAuthSession(page, supabaseMock, admin);
  supabaseMock.setTable("empleados", [admin]);
  supabaseMock.setTable("rutinas", [
    {
      id: "rutina-1",
      titulo: "Apertura del estudio",
      tareas_rutina: [],
    },
  ]);
  supabaseMock.setTable("tareas_rutina", []);
  supabaseMock.setTable("empleado_rutinas", []);
  supabaseMock.setTable("auditoria_diaria", []);
  supabaseMock.setTable("tareas_urgentes", []);

  await page.goto("/panel");

  const routineButton = page.getByRole("button", {
    name: "Apertura del estudio",
    exact: true,
  });
  await expect(routineButton).toBeVisible();
  await expect(routineButton.locator("..")).toHaveClass(/routine-accent--copper/);
  await expect(
    page.getByRole("group", { name: "Color de identificación" }),
  ).toHaveCount(0);

  const routineRequests = supabaseMock.requests.filter(
    ({ table }) => table === "rutinas",
  );
  expect(routineRequests.length).toBeGreaterThan(0);
  for (const request of routineRequests) {
    const selectedColumns = new URL(request.url).searchParams.get("select") ?? "";
    expect(selectedColumns).not.toMatch(/(^|,|\s)color(,|\s|$)/);
    expect(request.body).toBeNull();
  }
  expect(supabaseMock.mutations).toEqual([]);
});
