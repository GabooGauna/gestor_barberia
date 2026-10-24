import AxeBuilder from "@axe-core/playwright";
import { expect, seedAuthSession, test } from "./fixtures/supabase-mock";

const admin = { id: "10000000-0000-4000-8000-000000000001", nombre: "Administración", usuario: "admin.gns", rol: "admin", activo: true };
const tasks = [
  { id: "task-a", rutina_id: "routine-a", seccion: "Preparación", descripcion: "Preparar estación", orden: 1 },
  { id: "task-b", rutina_id: "routine-a", seccion: "Limpieza", descripcion: "Limpiar herramientas", orden: 2 },
  { id: "task-c", rutina_id: "routine-a", seccion: "Preparación", descripcion: "Revisar insumos", orden: 10 },
  { id: "task-other", rutina_id: "routine-b", seccion: "Cierre", descripcion: "Cerrar local", orden: 1 },
];
const routines = [
  { id: "routine-b", titulo: "Cierre", orden: 2, color: "sage", tareas_rutina: [tasks[3]] },
  { id: "routine-unordered", titulo: "Archivo sin orden", orden: null, color: "plum", tareas_rutina: [] },
  { id: "routine-a", titulo: "Apertura", orden: 1, color: "steel", tareas_rutina: [tasks[2], tasks[0], tasks[1]] },
];

function seed(mock) {
  mock.setTable("empleados", [admin]);
  mock.setTable("rutinas", routines);
  mock.setTable("tareas_rutina", tasks);
  mock.setTable("asignaciones_diarias", ["routine-b", "routine-a"].map((id) => ({ id: `daily-${id}`, empleado_id: admin.id, rutina_id: id, tarea_ids: tasks.filter((task) => task.rutina_id === id).map((task) => task.id), fecha: "2026-10-24", cancelada_en: null })));
  mock.setTable("auditoria_diaria", []);
  mock.setTable("tareas_urgentes", []);
}
async function open(page, mock, { theme = "light", color = false } = {}) {
  seed(mock);
  await page.clock.setFixedTime(new Date("2026-10-24T12:00:00Z"));
  await page.addInitScript((value) => localStorage.setItem("gestor-tema", value), theme);
  await seedAuthSession(page, mock, admin, { expiresAt: 2_000_000_000 });
  await page.goto(color ? "http://127.0.0.1:4174/panel" : "/panel");
  await expect(page.getByRole("list", { name: "Orden de rutinas" })).toBeVisible();
}
const listIds = (page, name) => page.getByRole("list", { name, exact: true }).locator(":scope > [data-sortable-id]").evaluateAll((rows) => rows.map((row) => row.dataset.sortableId));
const calls = (mock) => mock.rpcCalls.filter(({ rpc }) => rpc === "reorder_template_items");
async function keyboardMove(page, label, key = "ArrowDown") {
  const handle = page.getByRole("button", { name: `Reordenar ${label}`, exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".is-dragging")).toHaveCount(1);
  await page.keyboard.press(key);
  await expect(page.locator(".is-drop-target")).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect(page.locator(".is-dragging")).toHaveCount(0);
  await expect(page.getByText("Orden guardado.", { exact: true })).toBeVisible();
  await expect(handle).toBeFocused();
}
async function mouseMove(page, label, targetId) {
  const handle = page.getByRole("button", { name: `Reordenar ${label}`, exact: true });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const target = await page.locator(`[data-sortable-id="${targetId}"]`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 8, { steps: 3 });
  await expect(page.locator(".is-dragging")).toHaveCount(1);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 16 });
  await page.mouse.up();
  await expect(page.getByText("Orden guardado.", { exact: true })).toBeVisible();
}

test("teclado guarda rutinas y pasos, conserva identidades y persiste en recarga y otra sesión", async ({ page, supabaseMock, browser }) => {
  await open(page, supabaseMock);
  await expect.poll(() => listIds(page, "Orden de rutinas")).toEqual(["routine-a", "routine-b", "routine-unordered"]);
  const othersBefore = structuredClone(supabaseMock.tables.get("rutinas")[0]);
  await keyboardMove(page, "Apertura");
  expect(calls(supabaseMock)[0].body).toEqual({ p_ids: ["routine-b", "routine-a", "routine-unordered"], p_rutina_id: null });
  await page.getByRole("button", { name: "Apertura", exact: true }).click();
  await expect.poll(() => listIds(page, "Orden de pasos")).toEqual(["task-a", "task-b", "task-c"]);
  await keyboardMove(page, "Preparar estación");
  expect(calls(supabaseMock)[1].body).toEqual({ p_ids: ["task-b", "task-a", "task-c"], p_rutina_id: "routine-a" });
  expect(supabaseMock.tables.get("rutinas")[0]).toEqual({ ...othersBefore, orden: 1 });
  expect(supabaseMock.tables.get("tareas_rutina").find(({ id }) => id === "task-other")).toEqual(tasks[3]);
  expect(supabaseMock.tables.get("rutinas").map(({ id, color }) => ({ id, color }))).toEqual(routines.map(({ id, color }) => ({ id, color })));
  expect(supabaseMock.tables.get("auditoria_diaria")).toEqual([]);
  expect(supabaseMock.mutations).toEqual([]);
  await page.reload();
  await expect.poll(() => listIds(page, "Orden de rutinas")).toEqual(["routine-b", "routine-a", "routine-unordered"]);
  await page.getByRole("button", { name: "Apertura", exact: true }).click();
  await expect.poll(() => listIds(page, "Orden de pasos")).toEqual(["task-b", "task-a", "task-c"]);
  const context = await browser.newContext();
  const second = await context.newPage();
  try {
    await supabaseMock.install(second);
    await seedAuthSession(second, supabaseMock, admin);
    await second.goto("http://127.0.0.1:4173/panel");
    await expect.poll(() => listIds(second, "Orden de rutinas")).toEqual(["routine-b", "routine-a", "routine-unordered"]);
    await second.getByRole("button", { name: "Apertura", exact: true }).click();
    await expect.poll(() => listIds(second, "Orden de pasos")).toEqual(["task-b", "task-a", "task-c"]);
  } finally { await context.close(); }
});

test("mouse usa sólo el asa, indica destino y no mezcla pasos con rutinas", async ({ page, supabaseMock }) => {
  await open(page, supabaseMock);
  await mouseMove(page, "Apertura", "routine-b");
  await expect.poll(() => listIds(page, "Orden de rutinas")).toEqual(["routine-b", "routine-a", "routine-unordered"]);
  await page.getByRole("button", { name: "Apertura", exact: true }).click();
  await mouseMove(page, "Preparar estación", "task-b");
  await expect.poll(() => listIds(page, "Orden de pasos")).toEqual(["task-b", "task-a", "task-c"]);
  expect(calls(supabaseMock).map(({ body }) => body.p_rutina_id)).toEqual([null, "routine-a"]);
  const from = await page.getByText("Limpiar herramientas", { exact: true }).boundingBox();
  await page.mouse.move(from.x + 10, from.y + 5); await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 70, { steps: 8 }); await page.mouse.up();
  expect(calls(supabaseMock)).toHaveLength(2);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Archivar tarea: Limpiar herramientas", exact: true }).click();
  expect(calls(supabaseMock)).toHaveLength(2);
  await page.getByRole("button", { name: "Cierre", exact: true }).click();
  await expect.poll(() => listIds(page, "Orden de pasos")).toEqual(["task-other"]);
});

test("Escape y soltar en el mismo lugar no escriben", async ({ page, supabaseMock }) => {
  await open(page, supabaseMock);
  const before = structuredClone([...supabaseMock.tables]);
  const handle = page.getByRole("button", { name: "Reordenar Apertura", exact: true });
  await handle.focus(); await page.keyboard.press("Space");
  await expect(page.locator(".is-dragging")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".is-drop-target")).toHaveAttribute("data-drop-position", "after");
  await page.keyboard.press("Escape");
  await expect(page.locator(".is-dragging")).toHaveCount(0);
  await handle.focus(); await page.keyboard.press("Space");
  await expect(page.locator(".is-dragging")).toHaveCount(1);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.press("Space");
  await expect(page.locator(".is-dragging")).toHaveCount(0);
  const lowerHandle = page.getByRole("button", { name: "Reordenar Cierre", exact: true });
  await lowerHandle.focus(); await page.keyboard.press("Space");
  await expect(page.locator(".is-dragging")).toHaveCount(1);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".is-drop-target")).toHaveAttribute("data-drop-position", "before");
  await page.keyboard.press("Escape");
  await expect(page.locator(".is-dragging")).toHaveCount(0);
  expect(calls(supabaseMock)).toEqual([]);
  expect([...supabaseMock.tables]).toEqual(before);
});

for (const steps of [false, true]) {
  test(`guardado fallido restaura ${steps ? "pasos" : "rutinas"} y habilita reintento`, async ({ page, supabaseMock }) => {
    await open(page, supabaseMock);
    if (steps) await page.getByRole("button", { name: "Apertura", exact: true }).click();
    const list = steps ? "Orden de pasos" : "Orden de rutinas";
    const before = await listIds(page, list);
    const dataBefore = structuredClone([...supabaseMock.tables]);
    supabaseMock.failTable("reorder_template_items", "permission_denied");
    supabaseMock.delayTable("reorder_template_items", 300);
    const handle = page.getByRole("button", { name: steps ? "Reordenar Preparar estación" : "Reordenar Apertura", exact: true });
    await handle.focus(); await page.keyboard.press("Space");
    await expect(page.locator(".is-dragging")).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".is-drop-target")).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(page.getByText("Guardando orden…", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reordenar Apertura", exact: true })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("alert")).toContainText("Restauramos el orden anterior");
    await expect.poll(() => listIds(page, list)).toEqual(before);
    expect([...supabaseMock.tables]).toEqual(dataBefore);
    supabaseMock.failures.delete("reorder_template_items");
    await keyboardMove(page, steps ? "Preparar estación" : "Apertura");
    expect(calls(supabaseMock)).toHaveLength(2);
  });
}

test("asignaciones, Mis tareas y auditoría respetan el nuevo orden sin alterar cumplimiento", async ({ page, supabaseMock }) => {
  await open(page, supabaseMock);
  await keyboardMove(page, "Apertura");
  await page.getByRole("button", { name: "Apertura", exact: true }).click();
  await keyboardMove(page, "Preparar estación");
  await page.getByRole("button", { name: /^Asignaciones/ }).click();
  await page.getByRole("button", { name: "Administración (vos) Administración", exact: true }).click();
  await expect(page.getByRole("button", { name: /^(Cierre|Apertura|Archivo sin orden)$/ })).toHaveText(["Cierre✓", "Apertura✓", "Archivo sin orden+"]);
  await page.getByRole("button", { name: /^Mis tareas/ }).click();
  await expect(page.getByRole("button", { name: /Cerrar local|Limpiar herramientas|Preparar estación|Revisar insumos/ })).toHaveCount(4);
  const workLabels = await page.getByRole("button", { name: /Cerrar local|Limpiar herramientas|Preparar estación|Revisar insumos/ }).allTextContents();
  expect(workLabels[0]).toContain("Cerrar local"); expect(workLabels[1]).toContain("Limpiar herramientas"); expect(workLabels[2]).toContain("Preparar estación");
  await page.getByRole("button", { name: /^Auditoría/ }).click();
  await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
  await expect(page.locator(".audit-task-group")).toHaveCount(2);
  expect(await page.locator(".audit-task-group").evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")))).toEqual(["Rutina: Cierre", "Rutina: Apertura"]);
  const descriptions = await page.getByRole("region", { name: "Rutina: Apertura", exact: true }).locator(".audit-task").allTextContents();
  expect(descriptions[0]).toContain("Limpiar herramientas"); expect(descriptions[1]).toContain("Preparar estación");
  expect(supabaseMock.tables.get("auditoria_diaria")).toEqual([]);
  expect(supabaseMock.rpcCalls.filter(({ rpc }) => rpc.startsWith("set_"))).toEqual([]);
});

for (const theme of ["light", "dark"]) {
  test(`touch emulado real y accesibilidad en tema ${theme}`, async ({ page, supabaseMock, context }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, supabaseMock, { theme, color: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    const handle = page.getByRole("button", { name: "Reordenar Apertura", exact: true });
    await page.getByRole("list", { name: "Orden de rutinas", exact: true }).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const from = await handle.boundingBox(); const target = await page.locator('[data-sortable-id="routine-b"]').boundingBox();
    const x = Math.round(from.x + from.width / 2); const y = Math.round(from.y + from.height / 2);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: Math.round(y + (target.y + target.height / 2 - y) * i / 12) }] });
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await expect(page.locator(".is-dragging")).toHaveCount(1);
    await expect(page.locator(".is-drop-target")).toHaveCount(1);
    await testInfo.attach(`drag-touch-${theme}`, { body: await page.screenshot(), contentType: "image/png" });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.getByText("Orden guardado.", { exact: true })).toBeVisible();
    await expect.poll(() => listIds(page, "Orden de rutinas")).toEqual(["routine-b", "routine-a", "routine-unordered"]);
    await expect(page.locator('[data-sortable-id="routine-a"] .routine-choice')).toHaveClass(/routine-accent--steel/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
  });
}
