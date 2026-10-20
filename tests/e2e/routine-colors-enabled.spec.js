import {
  expect,
  seedAuthSession,
  test,
} from "./fixtures/supabase-mock";

const admin = { id: "10000000-0000-4000-8000-000000000001", auth_user_id: "20000000-0000-4000-8000-000000000001", nombre: "Administración", usuario: "admin.gns", rol: "admin", activo: true };
const employee = { id: "10000000-0000-4000-8000-000000000002", auth_user_id: "20000000-0000-4000-8000-000000000002", nombre: "Ana", usuario: "ana", rol: "empleado", activo: true };

async function seedColorEnvironment(page, supabaseMock, user = admin) {
  await seedAuthSession(page, supabaseMock, user);
  supabaseMock.setTable("empleados", [admin, employee]);
  supabaseMock.setTable("rutinas", [
    {
      id: "rutina-1",
      titulo: "Apertura del estudio",
      color: "steel",
      tareas_rutina: [
        {
          id: "tarea-1",
          seccion: "Preparación",
          descripcion: "Preparar herramientas",
          orden: 1,
        },
      ],
    },
  ]);
  supabaseMock.setTable("tareas_rutina", []);
  supabaseMock.setTable("asignaciones_diarias", [
    {
      id: "assignment-1", tarea_ids: ["tarea-1"], fecha: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()), cancelada_en: null,
      empleado_id: employee.id,
      rutina_id: "rutina-1",
    },
  ]);
  supabaseMock.setTable("auditoria_diaria", []);
  supabaseMock.setTable("tareas_urgentes", []);
}

test("crea y edita colores semánticos cuando la capacidad está habilitada", async ({
  page,
  supabaseMock,
}) => {
  await seedColorEnvironment(page, supabaseMock);
  supabaseMock.allowMutationsFor("rutinas");

  await page.goto("/panel");
  await expect(page.getByText("Cargando rutinas…")).toHaveCount(0);

  const initialRoutineRequest = supabaseMock.requests.find(
    ({ method, table }) => method === "GET" && table === "rutinas",
  );
  expect(initialRoutineRequest).toBeDefined();
  expect(
    new URL(initialRoutineRequest.url).searchParams.get("select"),
  ).toMatch(/(^|,|\s)color(,|\s|$)/);

  const createColorPicker = page
    .getByRole("group", { name: "Color de identificación" })
    .first();
  await expect(createColorPicker).toBeVisible();
  await expect(
    createColorPicker.getByRole("radio", { name: "Cobre" }),
  ).toBeChecked();

  await page.getByLabel("Nombre de la rutina").fill("Cierre del estudio");
  await createColorPicker.getByRole("radio", { name: "Violeta" }).locator("..").click();
  supabaseMock.delayTable("rutinas", 300);
  await page.getByRole("button", { name: "Crear rutina" }).click();
  const creatingButton = page.getByRole("button", { name: "Creando rutina…" });
  await expect(creatingButton).toBeDisabled();
  await expect(page.getByText("Rutina creada.")).toBeVisible();

  const insert = supabaseMock.mutations.find(
    ({ method, table }) => method === "POST" && table === "rutinas",
  );
  expect(insert?.body).toEqual([
    { titulo: "Cierre del estudio", color: "plum" },
  ]);

  await page
    .getByRole("button", { name: "Apertura del estudio", exact: true })
    .click();
  const editColorPicker = page
    .getByRole("group", { name: "Color de identificación" })
    .nth(1);
  await expect(
    editColorPicker.getByRole("radio", { name: "Azul" }),
  ).toBeChecked();

  await editColorPicker.getByRole("radio", { name: "Verde" }).locator("..").click();
  await expect(page.getByText("Guardando color…")).toBeVisible();
  await expect(page.getByText("Color de rutina actualizado.")).toBeVisible();

  await editColorPicker
    .getByRole("radio", { name: "Cobre" })
    .click();
  await expect
    .poll(
      () =>
        supabaseMock.mutations.filter(
          ({ method, table }) => method === "PATCH" && table === "rutinas",
        ).length,
    )
    .toBe(2);

  const updates = supabaseMock.mutations.filter(
    ({ method, table }) => method === "PATCH" && table === "rutinas",
  );
  expect(updates.map(({ body }) => body)).toEqual([
    { color: "sage" },
    { color: "copper" },
  ]);
  expect(
    updates.every(({ url }) =>
      new URL(url).searchParams.get("id")?.startsWith("eq."),
    ),
  ).toBe(true);
});

test("conserva el color de rutina en el panel empleado sin confundir estados", async ({
  page,
  supabaseMock,
}) => {
  await seedColorEnvironment(page, supabaseMock, employee);

  await page.goto("/panel");

  const routineCard = page
    .getByText("Apertura del estudio", { exact: true })
    .locator("../..");
  await expect(routineCard).toHaveClass(/routine-accent--steel/);
  const pendingTask = page.getByRole("button", { name: /Preparar herramientas/ });
  await expect(pendingTask).toHaveAttribute("aria-pressed", "false");
  await expect(pendingTask).not.toHaveClass(/routine-accent--steel/);
  expect(supabaseMock.mutations).toEqual([]);
});
