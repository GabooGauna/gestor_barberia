import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures/supabase-mock";

test.describe("Acceso transitorio", () => {
  test("muestra el estado vacío sin contactar datos reales", async ({
    page,
    supabaseMock,
  }) => {
    supabaseMock.setTable("empleados", []);

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "La jornada, en orden." }),
    ).toBeVisible();
    await expect(
      page.getByText("No hay empleados registrados en la base de datos."),
    ).toBeVisible();
    expect(supabaseMock.mutations).toEqual([]);
  });

  test("permite recorrer la selección de perfil sin fijar el PIN como contrato", async ({
    page,
    supabaseMock,
  }) => {
    supabaseMock.setTable("empleados", [
      { id: "empleado-1", nombre: "Ana", rol: "empleado" },
    ]);

    await page.goto("/");
    await page.getByRole("button", { name: /Ana/ }).click();

    await expect(page.getByLabel("Ingresa tu PIN de 4 dígitos")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirmar e Ingresar" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Cambiar" }).click();
    await expect(page.getByRole("button", { name: /Ana/ })).toBeVisible();
    expect(supabaseMock.mutations).toEqual([]);
  });

  test("presenta un error controlado cuando falla la carga", async ({
    page,
    supabaseMock,
  }) => {
    supabaseMock.failTable("empleados");

    await page.goto("/");

    await expect(
      page.getByText("No se pudo conectar con la lista de empleados."),
    ).toBeVisible();
    expect(supabaseMock.mutations).toEqual([]);
  });

  test("no tiene violaciones críticas o serias de accesibilidad en el acceso vacío", async ({
    page,
    supabaseMock,
  }) => {
    supabaseMock.setTable("empleados", []);
    await page.goto("/");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const seriousViolations = results.violations.filter(({ impact }) =>
      ["critical", "serious"].includes(impact),
    );

    expect(seriousViolations).toEqual([]);
  });
});
