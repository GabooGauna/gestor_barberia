import AxeBuilder from "@axe-core/playwright";
import { expect, seedAuthSession, test } from "./fixtures/supabase-mock";

const employee = { id: "10000000-0000-4000-8000-000000000002", nombre: "Ana", usuario: "ana", rol: "empleado", activo: true };
const admin = { id: "10000000-0000-4000-8000-000000000001", nombre: "Administración", usuario: "admin.gns", rol: "admin", activo: true };
const task = { id: "task-daily", seccion: "Apertura", descripcion: "Desinfectar herramientas", orden: 1 };
const routine = { id: "routine-daily", titulo: "Rutina permanente", tareas_rutina: [task] };

function seedWork(mock) {
  mock.setTable("empleados", [admin, employee]);
  mock.setTable("rutinas", [routine]);
  mock.setTable("tareas_rutina", [task]);
  mock.setTable("empleado_rutinas", [{ id: "assignment", empleado_id: employee.id, rutina_id: routine.id }]);
  mock.setTable("asignaciones_diarias", [{ id: "daily-yesterday", tarea_ids: [task.id], empleado_id: employee.id, rutina_id: routine.id, fecha: "2026-10-19", cancelada_en: null }]);
  mock.setTable("auditoria_diaria", [{
    id: "completion-yesterday", tarea_id: task.id, empleado_id: employee.id, fecha: "2026-10-19", anulada_en: null,
    empleados: employee, tareas_rutina: { ...task, rutinas: { id: routine.id, titulo: routine.titulo } },
  }]);
  mock.setTable("tareas_urgentes", [
    { id: "urgent-yesterday", empleado_id: employee.id, fecha: "2026-10-19", descripcion: "Indicación del lunes", completada: true, cancelada_en: null, empleados: employee },
    { id: "urgent-today", empleado_id: employee.id, fecha: "2026-10-20", descripcion: "Indicación del martes", completada: false, cancelada_en: null, empleados: employee },
    { id: "urgent-cancelled", empleado_id: employee.id, fecha: "2026-10-18", descripcion: "Indicación cancelada", completada: false, cancelada_en: "2026-10-18T15:00:00Z", empleados: employee },
    { id: "urgent-september", empleado_id: employee.id, fecha: "2026-09-30", descripcion: "Indicación del mes anterior", completada: false, cancelada_en: null, empleados: employee },
  ]);
}

async function freezeAt(page, time) {
  await page.clock.install({ time: new Date(time) });
  await page.clock.pauseAt(new Date(time));
}

function businessReads(mock, table) {
  return mock.requests.filter((request) => request.table === table && request.method === "GET");
}

test("asignaciones del día comienzan vacías, guardan por fecha y se vacían mañana sin tocar el legado", async ({ page, supabaseMock }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T04:00:00Z"));
  seedWork(supabaseMock);
  const legacy = structuredClone(supabaseMock.tables.get("empleado_rutinas"));
  const yesterday = structuredClone(supabaseMock.tables.get("asignaciones_diarias"));
  await seedAuthSession(page, supabaseMock, admin, { expiresAt: 2_000_000_000 });
  await page.goto("/panel");
  await page.getByRole("button", { name: /^Asignaciones/ }).click();
  await page.getByRole("button", { name: "Ana Empleado", exact: true }).click();
  const routineButton = page.getByRole("button", { name: routine.titulo, exact: true });
  await expect(routineButton).toHaveAttribute("aria-pressed", "false");
  await routineButton.click();
  await expect(routineButton).toHaveAttribute("aria-pressed", "true");
  expect(supabaseMock.rpcCalls.find(({ rpc }) => rpc === "set_daily_routine_assignment")?.body).toEqual({
    p_empleado_id: employee.id, p_rutina_id: routine.id, p_assigned: true, p_fecha: "2026-10-20",
  });
  await page.reload();
  await page.getByRole("button", { name: /^Asignaciones/ }).click();
  await page.getByRole("button", { name: "Ana Empleado", exact: true }).click();
  await expect(routineButton).toHaveAttribute("aria-pressed", "true");
  await page.clock.setFixedTime(new Date("2026-10-21T03:00:01Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(routineButton).toHaveAttribute("aria-pressed", "false");
  expect(supabaseMock.tables.get("empleado_rutinas")).toEqual(legacy);
  expect(supabaseMock.tables.get("asignaciones_diarias").filter(({ fecha }) => fecha === "2026-10-19")).toEqual(yesterday);
  expect(supabaseMock.mutations).toEqual([]);
});

test("una asignación pendiente real marca el calendario y desasignarla conserva su historial", async ({ page, supabaseMock }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T04:00:00Z"));
  seedWork(supabaseMock);
  supabaseMock.setTable("tareas_urgentes", []);
  supabaseMock.setTable("auditoria_diaria", []);
  await seedAuthSession(page, supabaseMock, admin);
  await page.goto("/panel");
  await page.getByRole("button", { name: /^Asignaciones/ }).click();
  await page.getByRole("button", { name: "Ana Empleado", exact: true }).click();
  const routineButton = page.getByRole("button", { name: routine.titulo, exact: true });
  await routineButton.click();
  await expect(routineButton).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await expect(page.getByRole("button", { name: "20/10/2026, con asignaciones", exact: true }).getByTestId("audit-assignment-dot")).toBeVisible();
  await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  await expect(page.getByText(task.descripcion, { exact: true })).toBeVisible();
  await expect(page.getByText("Realizadas: 0 de 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Asignaciones/ }).click();
  await page.getByRole("button", { name: "Ana Empleado", exact: true }).click();
  await routineButton.click();
  await expect(routineButton).toHaveAttribute("aria-pressed", "false");
  const cancelled = supabaseMock.tables.get("asignaciones_diarias").find(({ fecha }) => fecha === "2026-10-20");
  expect(cancelled.cancelada_en).toBeTruthy();
  expect(cancelled.tarea_ids).toEqual([task.id]);
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await expect(page.getByRole("button", { name: "20/10/2026, con asignaciones", exact: true }).getByTestId("audit-assignment-dot")).toBeVisible();
  await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  await expect(page.getByText("Asignación cancelada", { exact: true })).toBeVisible();
  expect(supabaseMock.mutations).toEqual([]);
});

test("al cambiar de persona una respuesta atrasada no restaura asignaciones ajenas", async ({ page, supabaseMock }) => {
  await page.clock.setFixedTime(new Date("2026-10-19T04:00:00Z"));
  seedWork(supabaseMock);
  await seedAuthSession(page, supabaseMock, admin);
  await page.goto("/panel");
  await page.getByRole("button", { name: /^Asignaciones/ }).click();
  supabaseMock.delayTable("asignaciones_diarias", 350);
  await page.getByRole("button", { name: "Ana Empleado", exact: true }).click();
  await expect.poll(() => businessReads(supabaseMock, "asignaciones_diarias").length).toBeGreaterThan(0);
  supabaseMock.delays.delete("asignaciones_diarias");
  await page.getByRole("button", { name: "Administración Administración", exact: true }).click();
  const routineButton = page.getByRole("button", { name: routine.titulo, exact: true });
  await expect(routineButton).toHaveAttribute("aria-pressed", "false");
  // Wait for the original server response, then recheck the selected person's state.
  await page.waitForTimeout(400);
  await expect(routineButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Rutinas de hoy para Administración", exact: true })).toBeVisible();
});

test("medianoche argentina renueva tareas con pestaña abierta y conserva historial al recargar", async ({ page, supabaseMock }) => {
  await freezeAt(page, "2026-10-20T02:59:50Z");
  seedWork(supabaseMock);
  const history = structuredClone(supabaseMock.tables.get("auditoria_diaria"));
  await seedAuthSession(page, supabaseMock, employee);
  await page.goto("/panel");
  const dailyTask = page.getByRole("button", { name: /Desinfectar herramientas/ });
  await expect(dailyTask).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Indicación del lunes/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Indicación del martes")).toHaveCount(0);

  await page.clock.runFor(11_000);
  await expect(dailyTask).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Indicación del martes/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Indicación del lunes")).toHaveCount(0);
  await expect(page.getByText("Rutina permanente", { exact: true })).toHaveCount(0);
  await expect.poll(() => businessReads(supabaseMock, "auditoria_diaria").some(({ url }) => new URL(url).searchParams.get("fecha") === "eq.2026-10-20")).toBe(true);

  await page.reload();
  await expect(dailyTask).toHaveCount(0);
  await expect(page.getByText("Indicación del lunes")).toHaveCount(0);
  expect(supabaseMock.tables.get("auditoria_diaria")).toEqual(history);
  expect(supabaseMock.tables.get("empleado_rutinas")).toHaveLength(1);
  expect(supabaseMock.mutations).toEqual([]);
  expect(supabaseMock.rpcCalls.filter(({ rpc }) => rpc !== "get_current_employee_profile")).toEqual([]);
});

test("medianoche UTC mantiene el mismo cumplimiento del día argentino", async ({ page, supabaseMock }) => {
  await freezeAt(page, "2026-10-19T23:59:50Z");
  seedWork(supabaseMock);
  await seedAuthSession(page, supabaseMock, employee);
  await page.goto("/panel");
  const dailyTask = page.getByRole("button", { name: /Desinfectar herramientas/ });
  await expect(dailyTask).toHaveAttribute("aria-pressed", "true");
  const previousReads = businessReads(supabaseMock, "auditoria_diaria").length;
  await page.clock.runFor(11_000);
  await expect(dailyTask).toHaveAttribute("aria-pressed", "true");
  expect(businessReads(supabaseMock, "auditoria_diaria")).toHaveLength(previousReads);
  expect(businessReads(supabaseMock, "tareas_urgentes").every(({ url }) => new URL(url).searchParams.get("fecha") === "eq.2026-10-19")).toBe(true);
});

for (const event of ["focus", "visibilitychange"]) {
  test(`actualiza día al reanudar con ${event} sin esperar el intervalo`, async ({ page, supabaseMock }) => {
    await freezeAt(page, "2026-10-20T02:59:50Z");
    seedWork(supabaseMock);
    await seedAuthSession(page, supabaseMock, employee);
    await page.goto("/panel");
    await expect(page.getByRole("button", { name: /Desinfectar herramientas/ })).toHaveAttribute("aria-pressed", "true");
    await page.clock.setSystemTime(new Date("2026-10-20T03:00:01Z"));
    await page.evaluate((name) => (name === "focus" ? window : document).dispatchEvent(new Event(name)), event);
    await expect(page.getByRole("button", { name: /Desinfectar herramientas/ })).toHaveCount(0);
    await expect(page.getByText("Indicación del lunes")).toHaveCount(0);
  });
}

test("auditoría sigue hoy al cambiar día y conserva una fecha histórica elegida", async ({ page, supabaseMock }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T02:59:50Z"));
  seedWork(supabaseMock);
  await seedAuthSession(page, supabaseMock, admin);
  await page.goto("/panel");
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await expect(page.getByRole("heading", { name: "Registros del 19/10/2026" })).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-10-20T03:00:01Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Registros del 20/10/2026" })).toBeVisible();
  await page.getByRole("button", { name: "19/10/2026, con asignaciones", exact: true }).click();
  await page.clock.setFixedTime(new Date("2026-10-21T03:00:01Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Registros del 19/10/2026" })).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`calendario ${theme}: puntos reales, selección histórica y mes acotado`, async ({ page, supabaseMock }) => {
    await page.clock.setFixedTime(new Date("2026-10-20T04:00:00Z"));
    await page.addInitScript((value) => localStorage.setItem("gestor-tema", value), theme);
    seedWork(supabaseMock);
    await seedAuthSession(page, supabaseMock, admin);
    await page.goto("/panel");
    await page.getByRole("button", { name: /^Auditoría/ }).click();
    await expect(page.getByRole("region", { name: "Calendario de asignaciones", exact: true })).toHaveCount(1);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    const monday = page.getByRole("button", { name: "19/10/2026, con asignaciones", exact: true });
    const tuesday = page.getByRole("button", { name: "20/10/2026, con asignaciones", exact: true });
    await expect(monday.getByTestId("audit-assignment-dot")).toBeVisible();
    await expect(tuesday.getByTestId("audit-assignment-dot")).toBeVisible();
    await expect(page.getByRole("button", { name: "21/10/2026, sin asignaciones", exact: true }).getByTestId("audit-assignment-dot")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Ana", exact: true })).toBeVisible();
    const historicalDetails = page.getByRole("button", { name: /Ver detalle de tareas/ });
    if (await historicalDetails.count()) await historicalDetails.click();
    await expect(page.getByText("Indicación del martes", { exact: true })).toBeVisible();
    await expect(page.getByText(/Pendiente/)).toBeVisible();
    await expect(page.getByText("Desinfectar herramientas", { exact: true })).toHaveCount(0);
    await monday.click();
    await expect(monday).toHaveAttribute("aria-pressed", "true");
    if (await historicalDetails.count()) await historicalDetails.click();
    await expect(page.getByText("Desinfectar herramientas", { exact: true })).toBeVisible();
    await expect(page.getByText("Indicación del lunes", { exact: true })).toBeVisible();
    await expect(page.getByText("Realizadas: 2 de 2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "21/10/2026, sin asignaciones", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ana", exact: true })).toHaveCount(0);
    await expect(page.getByText("Desinfectar herramientas", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Mes anterior", exact: true }).click();
    await expect(page.getByRole("button", { name: "30/09/2026, con asignaciones", exact: true }).getByTestId("audit-assignment-dot")).toBeVisible();
    const monthlyReads = supabaseMock.requests.filter(({ url }) => new URL(url).searchParams.has("fecha") && new URL(url).searchParams.get("fecha")?.startsWith("gte."));
    expect(monthlyReads.length).toBeGreaterThan(0);
    for (const { url } of monthlyReads) {
      const params = new URL(url).searchParams;
      expect(params.getAll("fecha")).toEqual(expect.arrayContaining([expect.stringMatching(/^gte\.2026-(09|10)-01$/), expect.stringMatching(/^lt\.2026-(10|11)-01$/)]));
      expect(Number(params.get("limit"))).toBeLessThanOrEqual(500);
    }
    expect(supabaseMock.requests.filter(({ table }) => table === "empleado_rutinas")).toEqual([]);
    expect(supabaseMock.mutations).toEqual([]);
  });
}

test("sólo permite cancelar urgencias pendientes de hoy con confirmación accesible", async ({ page, supabaseMock }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T04:00:00Z"));
  seedWork(supabaseMock);
  await seedAuthSession(page, supabaseMock, admin);
  let nativeDialogs = 0;
  page.on("dialog", async (dialog) => { nativeDialogs++; await dialog.dismiss(); });
  await page.goto("/panel");
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  const cancel = page.getByRole("button", { name: "Cancelar tarea urgente: Indicación del martes" });
  await cancel.click();
  const modal = page.getByRole("dialog", { name: "¿Cancelar esta tarea urgente?" });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: "Volver", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(cancel).toBeFocused();
  await cancel.click();
  await modal.getByRole("button", { name: "Volver", exact: true }).click();
  expect(supabaseMock.rpcCalls.filter(({ rpc }) => rpc === "cancel_urgent_task")).toEqual([]);
  await cancel.click();
  supabaseMock.failTable("cancel_urgent_task");
  await modal.getByRole("button", { name: "Cancelar tarea", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("No se pudo cancelar");
  supabaseMock.failures.delete("cancel_urgent_task");
  supabaseMock.delayTable("cancel_urgent_task", 400);
  await modal.getByRole("button", { name: "Cancelar tarea", exact: true }).click();
  await expect(modal.getByRole("button", { name: "Cancelando...", exact: true })).toBeDisabled();
  await expect(modal.getByRole("button", { name: "Volver", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
  await expect(cancel).toHaveCount(0);
  expect(nativeDialogs).toBe(0);
  await page.getByRole("button", { name: "19/10/2026, con asignaciones", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ana", exact: true })).toBeVisible();
  if (await page.getByRole("button", { name: /Ver detalle de tareas/ }).count()) await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  await expect(page.getByRole("button", { name: /Cancelar tarea urgente/ })).toHaveCount(0);
  expect(supabaseMock.rpcCalls.filter(({ rpc }) => rpc === "cancel_urgent_task")).toHaveLength(2);
});

test("cerrar el día retira una confirmación abierta y no envía cancelación antigua", async ({ page, supabaseMock }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T02:59:50Z"));
  seedWork(supabaseMock);
  supabaseMock.tables.get("tareas_urgentes")[0].completada = false;
  await seedAuthSession(page, supabaseMock, admin);
  await page.goto("/panel");
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  await page.getByRole("button", { name: "Cancelar tarea urgente: Indicación del lunes" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-10-20T03:00:01Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(supabaseMock.rpcCalls.filter(({ rpc }) => rpc === "cancel_urgent_task")).toEqual([]);
});

test("el calendario informa fallas de lectura y permite reintentar", async ({ page, supabaseMock }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T04:00:00Z"));
  seedWork(supabaseMock);
  await seedAuthSession(page, supabaseMock, admin);
  supabaseMock.failTable("auditoria_diaria");
  await page.goto("/panel");
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  supabaseMock.failures.delete("auditoria_diaria");
  await page.getByRole("button", { name: /Reintentar/ }).first().click();
  await expect(page.getByRole("button", { name: "20/10/2026, con asignaciones", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ana", exact: true })).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`calendario ${theme}: accesibilidad y responsive`, async ({ page, supabaseMock }, testInfo) => {
    await page.clock.setFixedTime(new Date("2026-10-20T04:00:00Z"));
    await page.addInitScript((value) => localStorage.setItem("gestor-tema", value), theme);
    seedWork(supabaseMock);
    await seedAuthSession(page, supabaseMock, admin);
    await page.goto("/panel");
    await page.getByRole("button", { name: /^Auditoría/ }).click();
    await expect(page.getByRole("heading", { name: "Ana", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter(({ impact }) => ["serious", "critical"].includes(impact))).toEqual([]);
      const screenshotPath = testInfo.outputPath(`calendario-${theme}-${width}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
      await testInfo.attach(`calendario-${theme}-${width}`, { path: screenshotPath, contentType: "image/png" });
    }
  });
}
