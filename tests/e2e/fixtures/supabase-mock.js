import { expect, test as base } from "@playwright/test";

const SAFE_SUPABASE_ORIGIN = "http://127.0.0.1:54321";

const clone = (value) => JSON.parse(JSON.stringify(value));

function applyFilters(rows, searchParams) {
  return rows.filter((row) => {
    for (const [column, expression] of searchParams.entries()) {
      if (["select", "order", "limit", "offset"].includes(column)) continue;

      if (expression.startsWith("eq.")) {
        const expected = expression.slice(3);
        if (String(row[column]) !== expected) return false;
      }

      if (expression.startsWith("in.(")) {
        const expected = expression.slice(4, -1).split(",");
        if (!expected.includes(String(row[column]))) return false;
      }
    }

    return true;
  });
}

class SupabaseMock {
  constructor() {
    this.tables = new Map();
    this.failures = new Map();
    this.allowedMutationTables = new Set();
    this.delays = new Map();
    this.requests = [];
    this.mutations = [];
    this.productionRequests = [];
  }

  setTable(table, rows) {
    this.tables.set(table, clone(rows));
  }

  failTable(table, message = "Error controlado de prueba") {
    this.failures.set(table, message);
  }

  allowMutationsFor(table) {
    this.allowedMutationTables.add(table);
  }

  delayTable(table, milliseconds) {
    this.delays.set(table, milliseconds);
  }

  async install(page) {
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const isRemoteSupabase = url.hostname.endsWith(".supabase.co");

      if (isRemoteSupabase) {
        this.productionRequests.push(request.url());
        await route.abort("blockedbyclient");
        return;
      }

      const isMockedRestRequest =
        url.origin === SAFE_SUPABASE_ORIGIN &&
        url.pathname.startsWith("/rest/v1/");

      if (!isMockedRestRequest) {
        await route.continue();
        return;
      }

      const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
      const method = request.method();
      const body = request.postDataJSON?.() ?? null;
      this.requests.push({ method, table, url: request.url(), body });

      const delay = this.delays.get(table);
      if (delay) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (!["GET", "HEAD"].includes(method)) {
        this.mutations.push({ method, table, url: request.url(), body });

        if (this.allowedMutationTables.has(table)) {
          const currentRows = this.tables.get(table) ?? [];

          if (method === "POST") {
            const insertedRows = (Array.isArray(body) ? body : [body]).map(
              (row, index) => ({
                id: row.id ?? `${table}-mock-${currentRows.length + index + 1}`,
                ...row,
              }),
            );
            this.tables.set(table, [...currentRows, ...insertedRows]);
            await route.fulfill({
              status: 201,
              contentType: "application/json",
              body: JSON.stringify(insertedRows),
            });
            return;
          }

          if (method === "PATCH") {
            const matchingRows = applyFilters(currentRows, url.searchParams);
            const matchingIds = new Set(matchingRows.map(({ id }) => id));
            const updatedRows = currentRows.map((row) =>
              matchingIds.has(row.id) ? { ...row, ...body } : row,
            );
            this.tables.set(table, updatedRows);
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(
                updatedRows.filter(({ id }) => matchingIds.has(id)),
              ),
            });
            return;
          }

          if (method === "DELETE") {
            const matchingRows = applyFilters(currentRows, url.searchParams);
            const matchingIds = new Set(matchingRows.map(({ id }) => id));
            this.tables.set(
              table,
              currentRows.filter(({ id }) => !matchingIds.has(id)),
            );
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(matchingRows),
            });
            return;
          }
        }

        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: "E2E_WRITE_BLOCKED",
            message: "Las escrituras están bloqueadas por el entorno E2E",
          }),
        });
        return;
      }

      if (this.failures.has(table)) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            code: "E2E_CONTROLLED_ERROR",
            message: this.failures.get(table),
          }),
        });
        return;
      }

      const rows = applyFilters(this.tables.get(table) ?? [], url.searchParams);
      const wantsSingleObject = request
        .headers()["accept"]
        ?.includes("application/vnd.pgrst.object+json");
      const response = wantsSingleObject ? (rows[0] ?? null) : rows;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
        body: method === "HEAD" ? "" : JSON.stringify(response),
      });
    });
  }
}

export const test = base.extend({
  supabaseMock: [
    async ({ page }, use) => {
      const mock = new SupabaseMock();
      await mock.install(page);
      await use(mock);

      expect(
        mock.productionRequests,
        "Ninguna prueba puede intentar conectarse a un proyecto Supabase remoto",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

export async function seedLegacySession(page, user) {
  await page.addInitScript((sessionUser) => {
    localStorage.setItem("usuarioBarberia", JSON.stringify(sessionUser));
  }, user);
}
