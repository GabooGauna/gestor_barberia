import AxeBuilder from "@axe-core/playwright";
import { expect, seedAuthSession, test } from "./fixtures/supabase-mock";

const admin = { id: "10000000-0000-4000-8000-000000000001", nombre: "Admin MFA", usuario: "admin.mfa", rol: "admin", activo: true };
const factorId = "40000000-0000-4000-8000-000000000001";

async function mockMfa(page, mock, session, enrolled) {
  const record = mock.users.get(session.user.id);
  record.user.factors = enrolled ? [{ id: factorId, factor_type: "totp", status: "verified", friendly_name: "Autenticador" }] : [];
  let enrollments = 0;
  await page.route("**/auth/v1/factors**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = data => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    if (path.endsWith("/factors")) {
      enrollments++;
      return json({ id: factorId, type: "totp", totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>', secret: "synthetic-only-secret" } });
    }
    if (path.endsWith("/challenge")) return json({ id: "synthetic-challenge", expires_at: Math.floor(Date.now() / 1000) + 120 });
    if (path.endsWith("/verify")) {
      if (request.postDataJSON().code !== "123456") return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ msg: "invalid code" }) });
      const payload = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString());
      payload.aal = "aal2";
      record.user.factors = [{ id: factorId, factor_type: "totp", status: "verified" }];
      return json({ ...session, access_token: `${session.access_token.split(".")[0]}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.playwright-signature`, user: record.user });
    }
    return json({ id: factorId });
  });
  return () => enrollments;
}

test("admin AAL1 no consulta negocio; código inválido falla y AAL2 abre panel", async ({ page, supabaseMock }) => {
  const session = await seedAuthSession(page, supabaseMock, admin, { aal: "aal1" });
  await mockMfa(page, supabaseMock, session, true);
  await page.goto("/panel");
  await expect(page.getByRole("heading", { name: "Verificación de administración" })).toBeVisible();
  expect(supabaseMock.requests).toEqual([]);
  await page.getByLabel("Código de autenticación").fill("000000");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await expect(page.getByRole("alert")).toContainText("No pudimos verificar el código");
  await expect(page.getByLabel("Código de autenticación")).toHaveValue("");
  expect(supabaseMock.requests).toEqual([]);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
  await page.getByLabel("Código de autenticación").fill("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await expect(page.getByRole("heading", { name: "Mesa de trabajo" })).toBeVisible();
});

test("admin sin factor enrola por acción explícita y no persiste secreto TOTP", async ({ page, supabaseMock }) => {
  const session = await seedAuthSession(page, supabaseMock, admin, { aal: "aal1" });
  const enrollments = await mockMfa(page, supabaseMock, session, false);
  await page.goto("/panel");
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  await expect(page.getByAltText("Código QR para vincular tu aplicación de autenticación")).toBeVisible();
  expect(enrollments()).toBe(1);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(axe.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
    }
  }
  await page.getByLabel("Código de autenticación").fill("123456");
  await page.getByRole("button", { name: "Verificar código" }).click();
  await expect(page.getByRole("heading", { name: "Mesa de trabajo" })).toBeVisible();
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(persisted).not.toContain("synthetic-only-secret");
  expect(persisted).not.toContain("<svg");
});

test("empleado AAL1 conserva acceso sin desafío administrativo", async ({ page, supabaseMock }) => {
  const employee = { ...admin, id: "10000000-0000-4000-8000-000000000002", rol: "empleado", usuario: "empleado.mfa" };
  await seedAuthSession(page, supabaseMock, employee, { aal: "aal1" });
  await page.goto("/panel");
  await expect(page.getByRole("heading", { name: "Mesa de trabajo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verificación de administración" })).toHaveCount(0);
});

test("admin pendiente puede cerrar sesión sin consultar negocio", async ({ page, supabaseMock }) => {
  const session = await seedAuthSession(page, supabaseMock, admin, { aal: "aal1" });
  await mockMfa(page, supabaseMock, session, true);
  await page.goto("/panel");
  await expect(page.getByRole("heading", { name: "Verificación de administración" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
