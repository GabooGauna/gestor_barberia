import AxeBuilder from "@axe-core/playwright";
import { expect, seedAuthSession, test } from "./fixtures/supabase-mock";

const admin = { id: "10000000-0000-4000-8000-000000000001", auth_user_id: "20000000-0000-4000-8000-000000000001", nombre: "Administración", usuario: "admin.gns", rol: "admin", activo: true };
const employee = { id: "10000000-0000-4000-8000-000000000002", nombre: "Ana", usuario: "ana", rol: "empleado", activo: true };
const task = { id: "admin-task", rutina_id: "admin-routine", seccion: "Apertura", descripcion: "Preparar mi estación", orden: 1, archivada_en: null };
const routine = { id: "admin-routine", titulo: "Apertura propia", color: "sage", archivada_en: null, tareas_rutina: [task] };
const today = "2026-10-20";

function seedWork(mock, date = today) {
  mock.setTable("empleados", [admin, employee]);
  mock.setTable("rutinas", [routine]);
  mock.setTable("tareas_rutina", [task]);
  mock.setTable("asignaciones_diarias", [{ id: "own-daily", empleado_id: admin.id, rutina_id: routine.id, tarea_ids: [task.id], fecha: date, cancelada_en: null }]);
  mock.setTable("auditoria_diaria", []);
  mock.setTable("tareas_urgentes", [{ id: "own-urgent", empleado_id: admin.id, descripcion: "Revisar mi equipamiento", fecha: date, completada: false, cancelada_en: null }]);
}

async function openOwnTasks(page, mock, { time = "2026-10-20T04:00:00Z", url = "/panel" } = {}) {
  await page.clock.setFixedTime(new Date(time));
  await seedAuthSession(page, mock, admin, { expiresAt: 2_000_000_000 });
  await page.goto(url);
  await page.getByRole("button", { name: /^Mis tareas/ }).click();
  await expect(page.getByRole("heading", { name: "Mis tareas", exact: true })).toBeVisible();
}

test("autoasigna rutina y urgencia con la cuenta administrativa y refleja cumplimiento en auditoría", async ({ page, supabaseMock }) => {
  seedWork(supabaseMock);
  supabaseMock.setTable("asignaciones_diarias", []);
  supabaseMock.setTable("tareas_urgentes", []);
  supabaseMock.allowMutationsFor("tareas_urgentes");
  await openOwnTasks(page, supabaseMock);
  await expect(page.getByText("Sin tareas asignadas para hoy", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Asignaciones/ }).click();
  await page.getByRole("button", { name: "Administración (vos) Administración", exact: true }).click();
  const choice = page.getByRole("button", { name: routine.titulo, exact: true });
  await expect(choice).toHaveAttribute("aria-pressed", "false");
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  expect(supabaseMock.rpcCalls.find(({ rpc }) => rpc === "set_daily_routine_assignment")).toMatchObject({ authUserId: admin.auth_user_id, body: { p_empleado_id: admin.id, p_rutina_id: routine.id, p_assigned: true, p_fecha: today } });
  await page.getByRole("button", { name: /^Urgencias/ }).click();
  await page.getByLabel("Seleccionar Empleado").selectOption(admin.id);
  await page.getByLabel("Descripción de la Urgencia").fill("Revisar mi equipamiento");
  await page.getByRole("button", { name: "Enviar Alerta Urgente" }).click();
  await expect(page.getByText("¡Tarea urgente enviada con éxito!")).toBeVisible();
  await page.getByRole("button", { name: /^Mis tareas/ }).click();
  await expect(page.getByText("0 de 2 tareas completadas · 0%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Preparar mi estación/ }).click();
  await page.getByRole("button", { name: /Revisar mi equipamiento/ }).click();
  await expect(page.getByText("2 de 2 tareas completadas · 100%", { exact: true })).toBeVisible();
  expect(supabaseMock.rpcCalls.filter(({ rpc }) => ["set_task_completion", "set_urgent_completion"].includes(rpc)).every(({ authUserId, body }) => authUserId === admin.auth_user_id && !Object.hasOwn(body, "p_empleado_id"))).toBe(true);
  expect(supabaseMock.tables.get("auditoria_diaria")[0]).toMatchObject({ empleado_id: admin.id, tarea_id: task.id, fecha: today, anulada_en: null });
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await expect(page.getByRole("heading", { name: admin.nombre, exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  await expect(page.getByText("Realizadas: 2 de 2", { exact: true })).toBeVisible();
  await expect(page.getByText(task.descripcion, { exact: true })).toBeVisible();
  await expect(page.getByText("Revisar mi equipamiento", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Mis tareas/ }).click();
  const ownTask = page.getByRole("button", { name: /Preparar mi estación/ });
  const ownUrgent = page.getByRole("button", { name: /Revisar mi equipamiento/ });
  await expect(ownTask).toHaveAttribute("aria-pressed", "true");
  await expect(ownUrgent).toHaveAttribute("aria-pressed", "true");
  await ownTask.click();
  await ownUrgent.click();
  await expect(page.getByText("0 de 2 tareas completadas · 0%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  await expect(page.getByText("Realizadas: 0 de 2", { exact: true })).toBeVisible();
  expect(supabaseMock.tables.get("auditoria_diaria")[0].anulada_en).toBeTruthy();
  expect(supabaseMock.tables.get("empleados")).toHaveLength(2);
  expect(supabaseMock.users.get(admin.auth_user_id).profile.rol).toBe("admin");
  expect(supabaseMock.adminActions).toEqual([]);
  await page.getByRole("button", { name: /^Equipo/ }).click();
  await expect(page.getByRole("heading", { name: "Registrar integrante" })).toBeVisible();
});

test("Mis tareas limita persona, fecha y vigencia sin incorporar rutinas archivadas", async ({ page, supabaseMock }) => {
  seedWork(supabaseMock);
  for (const [id, owner, date, cancelled] of [["other", employee.id, today, null], ["old", admin.id, "2026-10-19", null], ["cancelled", admin.id, today, `${today}T03:00:00Z`]]) {
    const extraTask = { ...task, id: `task-${id}`, descripcion: `Trabajo excluido ${id}` };
    const extraRoutine = { ...routine, id: `routine-${id}`, titulo: `Rutina excluida ${id}`, tareas_rutina: [extraTask] };
    supabaseMock.tables.get("rutinas").push(extraRoutine);
    supabaseMock.tables.get("asignaciones_diarias").push({ id, empleado_id: owner, rutina_id: extraRoutine.id, tarea_ids: [extraTask.id], fecha: date, cancelada_en: cancelled });
    supabaseMock.tables.get("tareas_urgentes").push({ id, empleado_id: owner, descripcion: `Urgencia excluida ${id}`, fecha: date, completada: false, cancelada_en: cancelled });
  }
  supabaseMock.tables.get("rutinas").push({ ...routine, id: "archived", titulo: "Rutina archivada", archivada_en: `${today}T03:00:00Z` });
  supabaseMock.tables.get("asignaciones_diarias").push({ id: "archived-assignment", empleado_id: admin.id, rutina_id: "archived", tarea_ids: [task.id], fecha: today, cancelada_en: null });
  supabaseMock.tables.get("rutinas")[0].tareas_rutina.push({ ...task, id: "archived-task", descripcion: "Tarea archivada", archivada_en: `${today}T03:00:00Z` });
  supabaseMock.tables.get("asignaciones_diarias")[0].tarea_ids.push("archived-task");
  await openOwnTasks(page, supabaseMock);
  await expect(page.getByText("0 de 2 tareas completadas · 0%", { exact: true })).toBeVisible();
  await expect(page.getByText(/excluid[oa]|Rutina archivada|Tarea archivada/)).toHaveCount(0);
  for (const table of ["asignaciones_diarias", "tareas_urgentes", "auditoria_diaria"]) {
    const reads = supabaseMock.requests.filter((request) => request.table === table);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every(({ url }) => new URL(url).searchParams.get("empleado_id") === `eq.${admin.id}` && new URL(url).searchParams.get("fecha") === `eq.${today}`)).toBe(true);
  }
});

test("nuevo día argentino vacía Mis tareas y asignaciones conservando plantillas e historial", async ({ page, supabaseMock }) => {
  seedWork(supabaseMock);
  await openOwnTasks(page, supabaseMock, { time: "2026-10-21T02:59:50Z" });
  await page.getByRole("button", { name: /Preparar mi estación/ }).click();
  await expect(page.getByRole("button", { name: /Preparar mi estación/ })).toHaveAttribute("aria-pressed", "true");
  const previous = structuredClone([...supabaseMock.tables]);
  await page.clock.setFixedTime(new Date("2026-10-21T03:00:01Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Sin tareas asignadas para hoy", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Preparar mi estación|Revisar mi equipamiento/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Asignaciones/ }).click();
  await page.getByRole("button", { name: "Administración (vos) Administración", exact: true }).click();
  await expect(page.getByRole("button", { name: routine.titulo, exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await page.getByRole("button", { name: "20/10/2026, con asignaciones", exact: true }).click();
  await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  await expect(page.getByText("Realizadas: 1 de 2", { exact: true })).toBeVisible();
  expect([...supabaseMock.tables]).toEqual(previous);
});

for (const failure of ["lectura", "permiso rutina", "permiso urgencia"]) {
  test(`recupera error de ${failure} sin acreditar cumplimiento fallido`, async ({ page, supabaseMock }) => {
    seedWork(supabaseMock);
    const resource = failure === "lectura" ? "asignaciones_diarias" : failure === "permiso rutina" ? "set_task_completion" : "set_urgent_completion";
    supabaseMock.failTable(resource, "permission_denied");
    if (failure === "lectura") {
      await page.clock.setFixedTime(new Date("2026-10-20T04:00:00Z"));
      await seedAuthSession(page, supabaseMock, admin);
      await page.goto("/panel");
      await page.getByRole("button", { name: /^Mis tareas/ }).click();
    } else {
      await openOwnTasks(page, supabaseMock);
      await page.getByRole("button", { name: failure === "permiso rutina" ? /Preparar mi estación/ : /Revisar mi equipamiento/ }).click();
    }
    await expect(page.getByRole("alert")).toContainText(failure === "lectura" ? "No se pudieron cargar tus tareas" : "No se pudo actualizar la tarea");
    expect(supabaseMock.tables.get("auditoria_diaria")).toEqual([]);
    expect(supabaseMock.tables.get("tareas_urgentes")[0].completada).toBe(false);
    supabaseMock.failures.delete(resource);
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect(page.getByText("0 de 2 tareas completadas · 0%", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Preparar mi estación/ }).click();
    await expect(page.getByText("1 de 2 tareas completadas · 50%", { exact: true })).toBeVisible();
  });
}

for (const theme of ["light", "dark"]) {
  test(`Mis tareas móvil conserva colores, tema ${theme}, teclado y accesibilidad`, async ({ page, supabaseMock }, testInfo) => {
    seedWork(supabaseMock);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript((value) => localStorage.setItem("gestor-tema", value), theme);
    await openOwnTasks(page, supabaseMock, { url: "http://127.0.0.1:4174/panel" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".surface-panel.routine-accent--sage")).toBeVisible();
    const toggle = page.getByRole("button", { name: /Preparar mi estación/ });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const progress = page.getByRole("progressbar", { name: "Tareas completadas hoy" });
    await expect(progress).toHaveAttribute("value", "1");
    await expect(progress).toHaveAttribute("max", "2");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
    await testInfo.attach(`mis-tareas-${theme}-375px`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}
