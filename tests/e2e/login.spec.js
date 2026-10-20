import AxeBuilder from "@axe-core/playwright";
import { expect, loginThroughUi, seedAuthSession, TEST_PASSWORD, test } from "./fixtures/supabase-mock";

const admin = {
  id: "10000000-0000-4000-8000-000000000001",
  auth_user_id: "20000000-0000-4000-8000-000000000001",
  nombre: "Administración",
  usuario: "admin.gns",
  rol: "admin",
  activo: true,
};

test.describe("Supabase Auth y rutas protegidas", () => {
  test("muestra el login limpio en la primera visita y al recargar sin sesión", async ({ page, supabaseMock }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByLabel("Usuario")).toHaveValue("");
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("");

    await page.reload();
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(supabaseMock.authRequests).toEqual([]);
    expect(supabaseMock.rpcCalls).toEqual([]);
  });

  test("inicia sesión con username canónico y contraseña sin exponer PIN", async ({ page, supabaseMock }) => {
    supabaseMock.registerUser(admin, { password: TEST_PASSWORD });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "La jornada, en orden." })).toBeVisible();
    await expect(page.getByLabel("Usuario")).toBeVisible();
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "password");
    await expect(page.getByText(/PIN/i)).toHaveCount(0);

    await page.getByLabel("Usuario").fill("  ADMIN.GNS  ");
    await page.getByLabel("Contraseña", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole("heading", { name: "Mesa de trabajo" })).toBeVisible();
    const passwordRequest = supabaseMock.authRequests.find(({ query }) => query.includes("grant_type=password"));
    expect(passwordRequest?.body.email).toBe("admin.gns@auth.gestor-barberia.invalid");
    expect(passwordRequest?.body.password).toBe(TEST_PASSWORD);
    expect(supabaseMock.rpcCalls.some(({ rpc }) => rpc === "get_current_employee_profile")).toBe(true);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("usuarioBarberia"))).toBeNull();
  });

  test("mantiene el login limpio después del cierre voluntario y de recargar", async ({ page, supabaseMock }) => {
    await loginThroughUi(page, supabaseMock, admin);
    const menu = page.locator(".user-menu--desktop");
    await menu.getByRole("button", { name: "Abrir menú de acciones" }).click();
    await menu.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("usa un error genérico ante credenciales incorrectas", async ({ page, supabaseMock }) => {
    supabaseMock.registerUser(admin, { password: TEST_PASSWORD });
    await page.goto("/");
    await page.getByLabel("Usuario").fill(admin.usuario);
    await page.getByLabel("Contraseña", { exact: true }).fill("Incorrecta123!");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page.getByRole("alert")).toHaveText("No pudimos iniciar sesión con esas credenciales.");
    await expect(page).toHaveURL(/\/$/);
  });

  test("rechaza username inválido en cliente sin consultar Auth", async ({ page, supabaseMock }) => {
    await page.goto("/");
    await page.getByLabel("Usuario").fill("Usuario con espacios");
    await page.getByLabel("Contraseña", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page.getByRole("alert")).toHaveText("Revisá el usuario y la contraseña.");
    expect(supabaseMock.authRequests).toEqual([]);
  });

  test("redirige acceso directo sin sesión", async ({ page, supabaseMock }) => {
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Ingresar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(supabaseMock.rpcCalls).toEqual([]);
  });

  test("rechaza una sesión expirada cuyo refresh token ya no es válido", async ({ page, supabaseMock }) => {
    await seedAuthSession(page, supabaseMock, admin, { expired: true });
    await page.goto("/panel");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("alert")).toHaveText("La sesión venció. Ingresá nuevamente.");
    expect(supabaseMock.authRequests.some(({ query }) => query.includes("grant_type=refresh_token"))).toBe(true);
  });

  test("no acepta usuarioBarberia manipulado como identidad o rol", async ({ page, supabaseMock }) => {
    await page.addInitScript(() => {
      localStorage.setItem("usuarioBarberia", JSON.stringify({ id: "intruso", rol: "admin", nombre: "Intruso" }));
    });
    await page.goto("/panel");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("navigation", { name: "Secciones de administración" })).toHaveCount(0);
    expect(supabaseMock.rpcCalls).toEqual([]);
  });

  test("no presenta violaciones Axe críticas o serias en login", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
  });
});
