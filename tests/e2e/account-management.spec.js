import AxeBuilder from "@axe-core/playwright";
import { expect, seedAuthSession, TEST_PASSWORD, test } from "./fixtures/supabase-mock";

const admin = {
  id: "10000000-0000-4000-8000-000000000001",
  auth_user_id: "20000000-0000-4000-8000-000000000001",
  nombre: "Administración",
  usuario: "admin.gns",
  rol: "admin",
  activo: true,
};
const employee = {
  id: "10000000-0000-4000-8000-000000000002",
  auth_user_id: "20000000-0000-4000-8000-000000000002",
  nombre: "Ana",
  usuario: "ana",
  rol: "empleado",
  activo: true,
};

async function seedOperationalTables(supabaseMock) {
  supabaseMock.setTable("rutinas", []);
  supabaseMock.setTable("tareas_rutina", []);
  supabaseMock.setTable("empleado_rutinas", []);
  supabaseMock.setTable("auditoria_diaria", []);
  supabaseMock.setTable("tareas_urgentes", []);
}

async function openTeam(page, supabaseMock) {
  await seedAuthSession(page, supabaseMock, admin);
  supabaseMock.registerUser(employee);
  supabaseMock.setTable("empleados", [admin, employee]);
  await seedOperationalTables(supabaseMock);
  await page.goto("/panel");
  await page.getByRole("button", { name: /Equipo/ }).click();
  await expect(page.getByRole("heading", { name: "Registrar integrante" })).toBeVisible();
}

test.describe("Administración segura de cuentas", () => {
  test("crea una cuenta con username y contraseña inicial", async ({ page, supabaseMock }) => {
    await openTeam(page, supabaseMock);
    await page.getByLabel("Nombre", { exact: true }).fill("Bruno");
    await page.getByLabel("Usuario", { exact: true }).fill("bruno.barber");
    await page.getByLabel("Contraseña inicial").fill(TEST_PASSWORD);
    await page.getByLabel("Repetir contraseña").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Cuenta creada" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bruno" })).toBeVisible();
    expect(supabaseMock.adminActions).toContainEqual(expect.objectContaining({
      action: "create", name: "Bruno", username: "bruno.barber", role: "empleado", actorId: admin.id,
    }));
    const browserStorage = await page.evaluate(() => JSON.stringify(localStorage));
    expect(browserStorage).not.toContain(TEST_PASSWORD);
  });

  test("valida contraseñas y confirmación antes de llamar la función", async ({ page, supabaseMock }) => {
    await openTeam(page, supabaseMock);
    await page.getByLabel("Nombre", { exact: true }).fill("Bruno");
    await page.getByLabel("Usuario", { exact: true }).fill("bruno");
    await page.getByLabel("Contraseña inicial").fill("muy-corta");
    await page.getByLabel("Repetir contraseña").fill("muy-corta");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByRole("alert")).toContainText("demasiado corta");
    expect(supabaseMock.adminActions).toEqual([]);
  });

  test("restablece contraseña mediante la función administrativa", async ({ page, supabaseMock }) => {
    await openTeam(page, supabaseMock);
    const row = page.getByRole("article").filter({ hasText: "Ana" });
    await row.getByRole("button", { name: "Cambiar contraseña" }).click();
    const dialog = page.getByRole("dialog", { name: "Cambiar contraseña" });
    await dialog.getByLabel("Nueva contraseña").fill("NuevaClave456!");
    await dialog.getByLabel("Repetir contraseña").fill("NuevaClave456!");
    await dialog.getByRole("button", { name: "Guardar contraseña" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Contraseña actualizada");
    expect(supabaseMock.adminActions).toContainEqual(expect.objectContaining({ action: "reset_password", employeeId: employee.id, actorId: admin.id }));
  });

  test("el diálogo de contraseña contiene el foco y permite cancelar con Escape", async ({ page, supabaseMock }) => {
    await openTeam(page, supabaseMock);
    const trigger = page.getByRole("article").filter({ hasText: "Ana" }).getByRole("button", { name: "Cambiar contraseña" });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: "Cambiar contraseña" });
        await expect(dialog.getByLabel("Nueva contraseña")).toBeFocused();
        await dialog.getByLabel("Nueva contraseña").fill("DescartarClave123!");
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press(i < 4 ? "Tab" : "Shift+Tab");
          await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
        }
        const accessibility = await new AxeBuilder({ page }).include(".security-dialog").analyze();
        expect(accessibility.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
        expect(await dialog.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(width);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expect(page.getByRole("dialog").getByLabel("Nueva contraseña")).toHaveValue("");
        await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
        await expect(trigger).toBeFocused();
      }
    }
    expect(supabaseMock.adminActions).toEqual([]);
  });

  test("desactiva y reactiva sin borrar el perfil", async ({ page, supabaseMock }) => {
    await openTeam(page, supabaseMock);
    let row = page.getByRole("article").filter({ hasText: "Ana" });
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByText("Cuenta desactivada. El historial se conserva.")).toBeVisible();

    row = page.getByRole("article").filter({ hasText: "Ana" });
    await expect(row.getByText("Cuenta desactivada", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Reactivar" }).click();
    await expect(page.getByText("Cuenta reactivada.")).toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: "Ana" }).getByText("Cuenta activa", { exact: true })).toBeVisible();

    expect(supabaseMock.adminActions.map(({ action }) => action).filter((action) => ["deactivate", "reactivate"].includes(action))).toEqual(["deactivate", "reactivate"]);
    expect(supabaseMock.tables.get("empleados").some(({ id }) => id === employee.id)).toBe(true);
  });

  test("cambia rol por la función y no mediante escritura directa", async ({ page, supabaseMock }) => {
    await openTeam(page, supabaseMock);
    const roleSelect = page.getByLabel("Rol de Ana");
    page.once("dialog", (dialog) => dialog.accept());
    await roleSelect.selectOption("admin");
    await expect(page.getByText("Rol actualizado.")).toBeVisible();

    expect(supabaseMock.adminActions).toContainEqual(expect.objectContaining({ action: "change_role", employeeId: employee.id, role: "admin" }));
    expect(supabaseMock.mutations.filter(({ table }) => table === "empleados")).toEqual([]);
  });

  test("un empleado no obtiene controles admin aunque manipule el rol legacy", async ({ page, supabaseMock }) => {
    await seedAuthSession(page, supabaseMock, employee);
    await seedOperationalTables(supabaseMock);
    await page.addInitScript(() => localStorage.setItem("usuarioBarberia", JSON.stringify({ rol: "admin" })));
    await page.goto("/panel");

    await expect(page.getByRole("heading", { name: "Mis Protocolos Asignados" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Secciones de administración" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Equipo/ })).toHaveCount(0);
  });
});
