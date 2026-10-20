import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  seedAuthSession,
  test,
} from "./fixtures/supabase-mock";

const admin = { id: "10000000-0000-4000-8000-000000000001", auth_user_id: "20000000-0000-4000-8000-000000000001", nombre: "Administración", usuario: "admin.gns", rol: "admin", activo: true };
const empleado = { id: "10000000-0000-4000-8000-000000000002", auth_user_id: "20000000-0000-4000-8000-000000000002", nombre: "Ana", usuario: "ana", rol: "empleado", activo: true };

const viewportMatrix = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
];

async function seedAdminPanel(page, supabaseMock) {
  await seedAuthSession(page, supabaseMock, admin);
  supabaseMock.setTable("empleados", [admin]);
  supabaseMock.setTable("rutinas", []);
  supabaseMock.setTable("tareas_rutina", []);
  supabaseMock.setTable("asignaciones_diarias", []);
  supabaseMock.setTable("auditoria_diaria", []);
  supabaseMock.setTable("tareas_urgentes", []);
}

function seedVisualData(supabaseMock, populated = false) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  supabaseMock.setTable("empleados", populated ? [admin, empleado] : []);
  supabaseMock.setTable(
    "rutinas",
    populated
      ? [
          {
            id: "rutina-1",
            titulo: "Apertura del estudio",
            tareas_rutina: [
              {
                id: "tarea-1",
                seccion: "Preparación",
                descripcion: "Preparar herramientas",
                orden: 1,
              },
              {
                id: "tarea-2",
                seccion: "Recepción",
                descripcion: "Revisar agenda del día",
                orden: 2,
              },
            ],
          },
        ]
      : [],
  );
  supabaseMock.setTable("tareas_rutina", []);
  supabaseMock.setTable(
    "asignaciones_diarias",
    populated
      ? [
          {
            id: "asignacion-1", tarea_ids: ["tarea-1", "tarea-2"], fecha: today, cancelada_en: null,
            empleado_id: empleado.id,
            rutina_id: "rutina-1",
          },
        ]
      : [],
  );
  supabaseMock.setTable(
    "auditoria_diaria",
    populated
      ? [
          {
            id: "auditoria-1",
            tarea_id: "tarea-1",
            empleado_id: empleado.id,
            fecha: today,
          },
        ]
      : [],
  );
  supabaseMock.setTable(
    "tareas_urgentes",
    populated
      ? [
          {
            id: "urgente-1",
            empleado_id: empleado.id,
            descripcion: "Confirmar insumos para el cierre",
            completada: false,
            fecha: today,
          },
        ]
      : [],
  );
}

async function seedPopulatedAudit(page, supabaseMock) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  await seedAuthSession(page, supabaseMock, admin);
  supabaseMock.setTable("empleados", [empleado]);
  supabaseMock.setTable("asignaciones_diarias", [
    {
      id: "asignacion-1", tarea_ids: ["tarea-1", "tarea-2"], fecha: today, cancelada_en: null,
      empleado_id: empleado.id,
      rutina_id: "rutina-1",
    },
  ]);
  supabaseMock.setTable("rutinas", [
    {
      id: "rutina-1",
      titulo: "Apertura del local",
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
  supabaseMock.setTable("auditoria_diaria", [
    {
      id: "auditoria-1",
      tarea_id: "tarea-1",
      empleado_id: empleado.id,
      fecha: today,
    },
  ]);
  supabaseMock.setTable("tareas_urgentes", [
    {
      id: "urgente-1",
      empleado_id: empleado.id,
      descripcion: "Revisar cierre de caja",
      completada: true,
      fecha: today,
    },
  ]);
}

async function openExpandedAudit(page) {
  await page.goto("/panel");
  await page.getByRole("button", { name: /Auditoría/ }).click();
  await expect(
    page.getByRole("heading", { name: "Calendario Operativo y Auditoría" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ana" })).toBeVisible();

  const detailButton = page.getByRole("button", {
    name: /detalle de tareas/i,
  });
  await detailButton.click();
  await expect(detailButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Preparar herramientas")).toBeVisible();
  await expect(page.getByText("Revisar cierre de caja")).toBeVisible();
}

async function openPanelAs(page, supabaseMock, user) {
  await seedAuthSession(page, supabaseMock, user);
  await page.goto("/panel");
}

async function expectNoDocumentOverflow(page, screenName) {
  const viewportMetrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(
    viewportMetrics.documentWidth,
    `${screenName} no debe producir desbordamiento horizontal del documento`,
  ).toBeLessThanOrEqual(viewportMetrics.viewportWidth);
}

async function attachScreen(page, testInfo, name) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(
      [...document.images].map(async (image) => {
        if (!image.complete || image.naturalWidth === 0) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }

        if (typeof image.decode === "function") {
          await image.decode().catch(() => {});
        }
      }),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await testInfo.attach(name, {
    body: await page.screenshot({
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    }),
    contentType: "image/png",
  });
}

async function expectNoSeriousAxe(page, context) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const seriousViolations = results.violations.filter(({ impact }) =>
    ["critical", "serious"].includes(impact),
  );

  expect(
    seriousViolations,
    `${context} no debe tener violaciones Axe críticas o serias`,
  ).toEqual([]);
}

async function expectTheme(page, preference, resolvedTheme) {
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    preference,
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    resolvedTheme,
  );
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    )
    .toContain(resolvedTheme);
}

async function focusWithKeyboard(page, locator) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }

  throw new Error("El control no fue alcanzable con Tab");
}

test.describe("Tema de la interfaz", () => {
  test("permite elegir claro y oscuro y persiste la selección", async ({
    page,
    supabaseMock,
  }) => {
    supabaseMock.setTable("empleados", []);
    await page.goto("/");

    const appearance = page.getByRole("group", { name: "Apariencia" });
    await expect(appearance).toBeVisible();

    await appearance.getByRole("radio", { name: "Oscuro" }).check();
    await expectTheme(page, "dark", "dark");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("gestor-tema")))
      .toBe("dark");

    await page.reload();
    await expectTheme(page, "dark", "dark");
    await expect(
      page.getByRole("radio", { name: "Oscuro" }),
    ).toBeChecked();

    await page.getByRole("radio", { name: "Claro" }).check();
    await expectTheme(page, "light", "light");
    await page.reload();
    await expectTheme(page, "light", "light");
    await expect(page.getByRole("radio", { name: "Claro" })).toBeChecked();
    expect(supabaseMock.mutations).toEqual([]);
  });

  test("sigue la preferencia del sistema sin reemplazarla por un tema fijo", async ({
    page,
    supabaseMock,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    supabaseMock.setTable("empleados", []);
    await page.goto("/");

    await page.getByRole("radio", { name: "Sistema" }).check();
    await expectTheme(page, "system", "dark");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("gestor-tema")))
      .toBe("system");

    await page.emulateMedia({ colorScheme: "light" });
    await expectTheme(page, "system", "light");
    expect(supabaseMock.mutations).toEqual([]);
  });

  test("aplica el tema persistido antes de la primera pintura y usa la paleta casi negra", async ({
    page,
    supabaseMock,
  }) => {
    supabaseMock.setTable("empleados", []);
    await page.addInitScript(() => {
      localStorage.setItem("gestor-tema", "dark");
      window.__themeAtFirstFrame = new Promise((resolve) => {
        requestAnimationFrame(() => {
          resolve({
            preference: document.documentElement.dataset.themePreference,
            theme: document.documentElement.dataset.theme,
          });
        });
      });
    });

    await page.goto("/");

    await expect
      .poll(() => page.evaluate(() => window.__themeAtFirstFrame))
      .toEqual({ preference: "dark", theme: "dark" });
    const darkTokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        canvas: style.getPropertyValue("--canvas").trim(),
        navigation: style.getPropertyValue("--nav").trim(),
        surface: style.getPropertyValue("--surface-1").trim(),
        elevated: style.getPropertyValue("--surface-elevated").trim(),
        accent: style.getPropertyValue("--accent").trim(),
      };
    });
    expect(darkTokens).toEqual({
      canvas: "#0b0d0f",
      navigation: "#111417",
      surface: "#191d21",
      elevated: "#252a30",
      accent: "#c99460",
    });
  });
});

for (const viewport of viewportMatrix) {
  for (const theme of ["light", "dark"]) {
    test(`valida todas las pantallas en ${theme}, ${viewport.name} (${viewport.width}px)`, async ({
      page,
      supabaseMock,
    }, testInfo) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      seedVisualData(supabaseMock);
      await page.addInitScript((preference) => {
        localStorage.setItem("gestor-tema", preference);
      }, theme);

      const adminScreens = [
        {
          slug: "plantillas",
          button: /Plantillas/,
          heading: "Creador de Plantillas (SOP)",
        },
        {
          slug: "equipo",
          button: /Equipo/,
          heading: "Registrar integrante",
        },
        {
          slug: "asignaciones",
          button: /Asignaciones/,
          heading: "Asignaciones del día",
        },
        {
          slug: "urgencias",
          button: /Urgencias/,
          heading: /Enviar Tarea Urgente/,
        },
        {
          slug: "auditoria",
          button: /Auditoría/,
          heading: "Calendario Operativo y Auditoría",
        },
      ];

      for (const state of ["empty", "populated"]) {
        seedVisualData(supabaseMock, state === "populated");
        await page.goto("/");
        await expect(
          page.getByRole("heading", { name: "La jornada, en orden." }),
        ).toBeVisible();
        await expect(
          page.getByRole("group", { name: "Apariencia" }),
        ).toBeVisible();
        await expectTheme(page, theme, theme);
        await expectNoDocumentOverflow(page, `Login ${state}`);
        await attachScreen(
          page,
          testInfo,
          `login-${state}-${theme}-${viewport.name}-${viewport.width}px`,
        );
      }

      for (const state of ["empty", "populated"]) {
        seedVisualData(supabaseMock, state === "populated");
        await openPanelAs(page, supabaseMock, empleado);
        await expect(page.getByRole("banner")).toBeVisible();
        await expect(page.getByRole("main")).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Mis Protocolos Asignados" }),
        ).toBeVisible();
        await expectTheme(page, theme, theme);
        await expectNoDocumentOverflow(page, `Panel empleado ${state}`);
        await attachScreen(
          page,
          testInfo,
          `empleado-${state}-${theme}-${viewport.name}-${viewport.width}px`,
        );
      }

      for (const state of ["empty", "populated"]) {
        seedVisualData(supabaseMock, state === "populated");
        await openPanelAs(page, supabaseMock, admin);

        await expect(page.getByRole("banner")).toBeVisible();
        await expect(page.getByRole("main")).toBeVisible();
        const navigation = page.getByRole("navigation", {
          name: "Secciones de administración",
        });
        await expect(navigation).toBeVisible();
        await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
        await expectTheme(page, theme, theme);

        for (const screen of adminScreens) {
          const navigationButton = navigation.getByRole("button", {
            name: screen.button,
          });
          await navigationButton.click();
          await expect(navigationButton).toHaveAttribute("aria-current", "page");
          await expect(
            page.getByRole("heading", { name: screen.heading }),
          ).toBeVisible();

          if (screen.slug === "auditoria" && state === "populated") {
            const detailButton = page.getByRole("button", {
              name: /detalle de tareas/i,
            }).last();
            await detailButton.click();
            await expect(detailButton).toHaveAttribute("aria-expanded", "true");
          }

          await expectNoDocumentOverflow(page, `Admin ${screen.slug} ${state}`);
          await attachScreen(
            page,
            testInfo,
            `admin-${screen.slug}-${state}-${theme}-${viewport.name}-${viewport.width}px`,
          );
        }
      }

      expect(supabaseMock.mutations).toEqual([]);
    });
  }
}

test.describe("Interacción accesible", () => {
  test("el selector de tema y la navegación se operan con teclado y muestran foco", async ({
    page,
    supabaseMock,
  }) => {
    await seedAdminPanel(page, supabaseMock);
    await page.goto("/panel");

    const menuTrigger = page
      .locator(".user-menu--desktop")
      .getByRole("button", { name: "Abrir menú de acciones" });
    await menuTrigger.click();
    const selectedTheme = page
      .locator(".user-menu--desktop")
      .getByRole("radio", { checked: true });
    await expect(selectedTheme).toBeFocused();
    await expect(selectedTheme).toHaveAccessibleName(/Claro|Oscuro|Sistema/);
    await page.keyboard.press("Escape");
    await expect(menuTrigger).toBeFocused();

    const employeesButton = page.getByRole("button", { name: /Equipo/ });
    await focusWithKeyboard(page, employeesButton);
    await expect(employeesButton).toBeFocused();
    await expect(employeesButton).toHaveCSS("outline-style", /^(?!none$).+/);
    await page.keyboard.press("Enter");

    await expect(employeesButton).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: "Registrar integrante" }),
    ).toBeVisible();

    const employeeNameInput = page.getByLabel("Nombre", { exact: true });
    await focusWithKeyboard(page, employeeNameInput);
    await expect(employeeNameInput).toBeFocused();
    const focusOutline = await employeeNameInput.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.outlineColor,
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(focusOutline.style).not.toBe("none");
    expect(focusOutline.width).toBeGreaterThanOrEqual(3);
    expect(focusOutline.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(supabaseMock.mutations).toEqual([]);
  });

  test("conserva feedback hover en acciones primaria y destructiva", async ({
    page,
    supabaseMock,
  }) => {
    await seedPopulatedAudit(page, supabaseMock);
    // Only pending tasks from today expose the cancellation action.
    supabaseMock.tables.get("tareas_urgentes")[0].completada = false;
    await page.goto("/panel");
    await page.getByRole("button", { name: /Equipo/ }).click();

    const primaryButton = page.getByRole("button", {
      name: "Crear cuenta",
    });
    const primaryBefore = await primaryButton.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await primaryButton.hover();
    await expect
      .poll(() =>
        primaryButton.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .not.toBe(primaryBefore);

    await page.getByRole("button", { name: /Auditoría/ }).click();
    await expect(page.getByRole("heading", { name: "Ana" })).toBeVisible();
    await page.getByRole("button", { name: /Ver detalle de tareas/ }).click();
    const destructiveButton = page.getByRole("button", {
      name: "Cancelar tarea urgente: Revisar cierre de caja",
    });
    const destructiveBefore = await destructiveButton.evaluate(
      (element) => getComputedStyle(element).color,
    );
    await destructiveButton.hover();
    await expect
      .poll(() =>
        destructiveButton.evaluate((element) => getComputedStyle(element).color),
      )
      .not.toBe(destructiveBefore);
    expect(supabaseMock.mutations).toEqual([]);
  });

  test("distingue estados disabled, hover, active y loading en una acción primaria", async ({
    page,
    supabaseMock,
  }) => {
    await seedAdminPanel(page, supabaseMock);
    supabaseMock.allowMutationsFor("rutinas");
    await page.goto("/panel");
    await expect(page.getByText("Cargando rutinas…")).toHaveCount(0);

    const createButton = page.getByRole("button", { name: "Crear rutina" });
    await expect(createButton).toBeDisabled();
    await page.getByLabel("Nombre de la rutina").fill("Preparación semanal");
    await expect(createButton).toBeEnabled();

    const idleStyle = await createButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, transform: style.transform };
    });
    await createButton.hover();
    await expect
      .poll(() =>
        createButton.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .not.toBe(idleStyle.background);

    const box = await createButton.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect
      .poll(() =>
        createButton.evaluate((element) => getComputedStyle(element).transform),
      )
      .not.toBe(idleStyle.transform);
    await page.mouse.move(0, 0);
    await page.mouse.up();

    supabaseMock.delayTable("rutinas", 500);
    await createButton.click();
    const loadingButton = page.getByRole("button", {
      name: "Creando rutina…",
    });
    await expect(loadingButton).toBeDisabled();
    await expect(page.getByText("Rutina creada.")).toBeVisible();
    expect(supabaseMock.mutations).toContainEqual(
      expect.objectContaining({
        method: "POST",
        table: "rutinas",
        body: [{ titulo: "Preparación semanal" }],
      }),
    );
  });

  test("desactiva animaciones y transiciones con movimiento reducido", async ({
    page,
    supabaseMock,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedAdminPanel(page, supabaseMock);
    await page.goto("/panel");

    const motionState = await page.evaluate(() => {
      const toMilliseconds = (duration) =>
        duration
          .split(",")
          .map((value) => value.trim())
          .map((value) =>
            value.endsWith("ms")
              ? Number.parseFloat(value)
              : Number.parseFloat(value) * 1000,
          );
      const elements = [...document.querySelectorAll("*")];
      const durations = elements.flatMap((element) => {
        const style = getComputedStyle(element);
        return [
          ...toMilliseconds(style.animationDuration),
          ...toMilliseconds(style.transitionDuration),
        ];
      });

      return {
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        maxDuration: Math.max(0, ...durations.filter(Number.isFinite)),
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      };
    });

    expect(motionState.reduced).toBe(true);
    expect(motionState.maxDuration).toBeLessThanOrEqual(1);
    expect(motionState.scrollBehavior).toBe("auto");
    expect(supabaseMock.mutations).toEqual([]);
  });

  for (const theme of ["light", "dark"]) {
    test(`no presenta violaciones Axe críticas o serias en las siete vistas pobladas ${theme}`, async ({
      page,
      supabaseMock,
    }) => {
      seedVisualData(supabaseMock, true);
      await page.addInitScript((preference) => {
        localStorage.setItem("gestor-tema", preference);
      }, theme);

      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "La jornada, en orden." }),
      ).toBeVisible();
      await expectNoSeriousAxe(page, `Login ${theme}`);

      await openPanelAs(page, supabaseMock, empleado);
      await expect(
        page.getByRole("heading", { name: "Mis Protocolos Asignados" }),
      ).toBeVisible();
      await expectNoSeriousAxe(page, `Panel empleado ${theme}`);

      await openPanelAs(page, supabaseMock, admin);
      const navigation = page.getByRole("navigation", {
        name: "Secciones de administración",
      });
      for (const section of [
        /Plantillas/,
        /Equipo/,
        /Asignaciones/,
        /Urgencias/,
        /Auditoría/,
      ]) {
        await navigation.getByRole("button", { name: section }).click();
        await expectNoSeriousAxe(page, `Vista ${section} ${theme}`);
      }

      expect(supabaseMock.mutations).toEqual([]);
    });

    test(`no presenta violaciones Axe críticas o serias en el shell ${theme}`, async ({
      page,
      supabaseMock,
    }) => {
      await seedAdminPanel(page, supabaseMock);
      await page.addInitScript((preference) => {
        localStorage.setItem("gestor-tema", preference);
      }, theme);
      await page.goto("/panel");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const seriousViolations = results.violations.filter(({ impact }) =>
        ["critical", "serious"].includes(impact),
      );

      expect(seriousViolations).toEqual([]);
      expect(supabaseMock.mutations).toEqual([]);
    });

    test(`no presenta violaciones Axe críticas o serias en Auditoría poblada ${theme}`, async ({
      page,
      supabaseMock,
    }) => {
      await seedPopulatedAudit(page, supabaseMock);
      await page.addInitScript((preference) => {
        localStorage.setItem("gestor-tema", preference);
      }, theme);
      await openExpandedAudit(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const seriousViolations = results.violations.filter(({ impact }) =>
        ["critical", "serious"].includes(impact),
      );

      expect(seriousViolations).toEqual([]);
      expect(supabaseMock.mutations).toEqual([]);
    });
  }
});
