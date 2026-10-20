import {
  expect,
  seedAuthSession,
  test,
} from "./fixtures/supabase-mock";

const admin = { id: "10000000-0000-4000-8000-000000000001", auth_user_id: "20000000-0000-4000-8000-000000000001", nombre: "Administración", usuario: "admin.gns", rol: "admin", activo: true };

async function seedPanel(page, supabaseMock) {
  await seedAuthSession(page, supabaseMock, admin);
  supabaseMock.setTable("empleados", [admin]);
  supabaseMock.setTable("rutinas", []);
  supabaseMock.setTable("tareas_rutina", []);
  supabaseMock.setTable("empleado_rutinas", []);
  supabaseMock.setTable("auditoria_diaria", []);
  supabaseMock.setTable("tareas_urgentes", []);
}

test("integra la marca GNS y el título del navegador", async ({
  page,
  supabaseMock,
}) => {
  supabaseMock.setTable("empleados", []);

  await page.goto("/");

  await expect(page).toHaveTitle("Gestor GNS Barberia");
  const loginLogo = page.getByRole("img", { name: "GNS Hair Studio" });
  await expect(loginLogo).toBeVisible();
  await expect(loginLogo).toHaveAttribute(
    "src",
    /gns-hairstudio-logo\.webp/,
  );

  const dimensions = await loginLogo.evaluate((image) => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    renderedWidth: image.getBoundingClientRect().width,
    renderedHeight: image.getBoundingClientRect().height,
  }));
  expect(dimensions.naturalWidth).toBeGreaterThan(0);
  expect(dimensions.naturalHeight).toBeGreaterThan(0);
  expect(
    dimensions.renderedWidth / dimensions.renderedHeight,
    "el logo debe conservar sus proporciones originales",
  ).toBeCloseTo(dimensions.naturalWidth / dimensions.naturalHeight, 1);
});

for (const viewport of [
  { name: "mobile", width: 375, height: 812, menu: ".user-menu--mobile" },
  { name: "desktop", width: 1440, height: 1000, menu: ".user-menu--desktop" },
]) {
  test(`el menú de acciones es accesible y cierra sesión en ${viewport.name}`, async ({
    page,
    supabaseMock,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await seedPanel(page, supabaseMock);
    await page.goto("/panel");

    const visibleMenu = page.locator(viewport.menu);
    const trigger = visibleMenu.locator(".user-menu__trigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAccessibleName("Abrir menú de acciones");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    if (viewport.name === "mobile") {
      const logo = page.locator(".brand-logo--mobile");
      await expect(logo).toBeVisible();
      const logoBox = await logo.boundingBox();
      expect(logoBox).not.toBeNull();
      expect(
        logoBox.x + logoBox.width / 2,
        "el logo móvil debe quedar centrado respecto de la pantalla",
      ).toBeCloseTo(viewport.width / 2, 0);
    } else {
      await expect(page.locator(".brand-logo--rail")).toBeVisible();
    }

    await trigger.click();
    const dialog = visibleMenu.getByRole("dialog", {
      name: "Cuenta y apariencia",
    });
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAccessibleName("Cerrar menú de acciones");
    await expect(dialog.getByText("Administración", { exact: true })).toBeVisible();
    await expect(dialog.getByText("admin", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("radio", { checked: true })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAccessibleName("Abrir menú de acciones");

    await trigger.click();
    await visibleMenu.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token")))).toEqual([]);
    expect(supabaseMock.authRequests.some(({ path }) => path === "/auth/v1/logout")).toBe(true);
    expect(supabaseMock.mutations).toEqual([]);
  });
}
