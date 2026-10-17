import { expect, test as base } from "@playwright/test";

const SAFE_SUPABASE_ORIGIN = "http://127.0.0.1:54321";
const AUTH_STORAGE_KEY = "sb-127-auth-token";
const TEST_PASSWORD = "ClaveSegura123!";

const clone = (value) => JSON.parse(JSON.stringify(value));
const base64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function jwtFor(authUserId, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  return `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({
    aud: "authenticated", exp: expiresAt, iat: Math.floor(Date.now() / 1000),
    role: "authenticated", sub: authUserId,
  })}.playwright-signature`;
}

function authUser(authUserId, username) {
  return {
    id: authUserId, aud: "authenticated", role: "authenticated",
    email: `${username}@auth.gestor-barberia.invalid`,
    email_confirmed_at: "2026-10-16T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
    created_at: "2026-10-16T00:00:00.000Z", updated_at: "2026-10-16T00:00:00.000Z",
  };
}

function sessionFor(user, { expired = false } = {}) {
  const expiresAt = Math.floor(Date.now() / 1000) + (expired ? -120 : 3600);
  return {
    access_token: jwtFor(user.id, expiresAt),
    refresh_token: expired ? "expired-refresh-token" : `refresh-${user.id}`,
    expires_in: 3600, expires_at: expiresAt, token_type: "bearer", user,
  };
}

function authUserIdFromRequest(request) {
  const token = (request.headers().authorization || "").replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1];
  if (!payload) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).sub || null; }
  catch { return null; }
}

function applyFilters(rows, searchParams) {
  return rows.filter((row) => {
    for (const [column, expression] of searchParams.entries()) {
      if (["select", "order", "limit", "offset"].includes(column)) continue;
      if (expression.startsWith("eq.") && String(row[column]) !== expression.slice(3)) return false;
      if (expression.startsWith("in.(")) {
        const expected = expression.slice(4, -1).split(",");
        if (!expected.includes(String(row[column]))) return false;
      }
      if (expression === "is.null" && row[column] != null) return false;
    }
    return true;
  });
}

class SupabaseMock {
  constructor() {
    this.tables = new Map(); this.failures = new Map(); this.delays = new Map();
    this.allowedMutationTables = new Set(); this.users = new Map(); this.credentials = new Map();
    this.requests = []; this.mutations = []; this.rpcCalls = []; this.authRequests = [];
    this.adminActions = []; this.productionRequests = []; this.nextEmployee = 1;
  }

  setTable(table, rows) { this.tables.set(table, clone(rows)); }

  registerUser(profile, { password = TEST_PASSWORD, authUserId } = {}) {
    const authId = authUserId || profile.auth_user_id || profile.id;
    const normalized = {
      activo: true, usuario: profile.usuario || profile.nombre.toLowerCase(),
      ...clone(profile), auth_user_id: authId,
    };
    const user = authUser(authId, normalized.usuario);
    this.users.set(authId, { profile: normalized, user });
    this.credentials.set(normalized.usuario, { password, authUserId: authId });
    const employees = this.tables.get("empleados") || [];
    if (!employees.some(({ id }) => id === normalized.id)) this.tables.set("empleados", [...employees, normalized]);
    return { profile: normalized, user };
  }

  failTable(table, message = "Error controlado de prueba") { this.failures.set(table, message); }
  allowMutationsFor(table) { this.allowedMutationTables.add(table); }
  delayTable(table, milliseconds) { this.delays.set(table, milliseconds); }

  async install(page) {
    await page.route("**/*", async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.hostname.endsWith(".supabase.co")) {
        this.productionRequests.push(request.url()); await route.abort("blockedbyclient"); return;
      }
      if (url.origin !== SAFE_SUPABASE_ORIGIN) { await route.continue(); return; }
      if (url.pathname.startsWith("/auth/v1/")) { await this.handleAuth(route, request, url); return; }
      if (url.pathname === "/functions/v1/admin-users") { await this.handleAdminUsers(route, request); return; }
      if (!url.pathname.startsWith("/rest/v1/")) { await route.continue(); return; }
      const resource = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
      if (resource.startsWith("rpc/")) { await this.handleRpc(route, request, resource.slice(4)); return; }
      await this.handleTable(route, request, url, resource);
    });
  }

  async handleAuth(route, request, url) {
    const body = request.postDataJSON?.() ?? null;
    this.authRequests.push({ method: request.method(), path: url.pathname, query: url.search, body });
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const username = String(body?.email || "").split("@")[0];
      const credential = this.credentials.get(username); const record = credential && this.users.get(credential.authUserId);
      if (!credential || credential.password !== body?.password || !record?.profile.activo) {
        await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }) }); return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionFor(record.user)) }); return;
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      if (body?.refresh_token === "expired-refresh-token") {
        await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_grant", error_description: "Refresh Token Not Found" }) }); return;
      }
      const authUserId = String(body?.refresh_token || "").replace(/^refresh-/, ""); const record = this.users.get(authUserId);
      if (!record?.profile.activo) { await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_grant" }) }); return; }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionFor(record.user)) }); return;
    }
    if (url.pathname === "/auth/v1/user" && request.method() === "GET") {
      const record = this.users.get(authUserIdFromRequest(request));
      await route.fulfill({ status: record ? 200 : 401, contentType: "application/json", body: JSON.stringify(record?.user || { message: "invalid token" }) }); return;
    }
    if (url.pathname === "/auth/v1/logout") { await route.fulfill({ status: 204, body: "" }); return; }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Auth route not mocked" }) });
  }

  async handleRpc(route, request, rpc) {
    const body = request.postDataJSON?.() ?? {}; const authUserId = authUserIdFromRequest(request);
    this.rpcCalls.push({ rpc, body, authUserId });
    if (rpc === "get_current_employee_profile") {
      const profile = this.users.get(authUserId)?.profile;
      const result = profile?.activo ? [{ id: profile.id, nombre: profile.nombre, usuario: profile.usuario, rol: profile.rol, activo: true }] : [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) }); return;
    }
    if (["set_task_completion", "set_urgent_completion", "cancel_urgent_task"].includes(rpc)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }); return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST202", message: "RPC not mocked" }) });
  }

  async handleAdminUsers(route, request) {
    const body = request.postDataJSON?.() ?? {}; const actor = this.users.get(authUserIdFromRequest(request))?.profile;
    this.adminActions.push({ ...clone(body), actorId: actor?.id || null });
    if (!actor?.activo || actor.rol !== "admin") {
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "admin_required" }) }); return;
    }
    const employees = this.tables.get("empleados") || [];
    if (body.action === "create") {
      const id = `00000000-0000-4000-9000-${String(this.nextEmployee++).padStart(12, "0")}`;
      this.registerUser({ id, nombre: body.name, usuario: body.username, rol: body.role, activo: true }, { password: body.password });
    } else {
      const index = employees.findIndex(({ id }) => id === body.employeeId);
      if (index < 0) { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "account_not_found" }) }); return; }
      const updated = employees.map((employee) => {
        if (employee.id !== body.employeeId) return employee;
        if (body.action === "deactivate") return { ...employee, activo: false };
        if (body.action === "reactivate") return { ...employee, activo: true };
        if (body.action === "change_role") return { ...employee, rol: body.role };
        return employee;
      });
      this.tables.set("empleados", updated); const target = updated[index];
      const record = [...this.users.values()].find(({ profile }) => profile.id === body.employeeId);
      if (record) record.profile = { ...record.profile, ...target };
      if (body.action === "reset_password" && record) this.credentials.set(record.profile.usuario, { password: body.password, authUserId: record.user.id });
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  }

  async handleTable(route, request, url, table) {
    const method = request.method(); const body = request.postDataJSON?.() ?? null;
    this.requests.push({ method, table, url: request.url(), body });
    const delay = this.delays.get(table); if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (!["GET", "HEAD"].includes(method)) {
      this.mutations.push({ method, table, url: request.url(), body });
      if (this.allowedMutationTables.has(table)) {
        const currentRows = this.tables.get(table) ?? [];
        if (method === "POST") {
          const insertedRows = (Array.isArray(body) ? body : [body]).map((row, index) => ({ id: row.id ?? `${table}-mock-${currentRows.length + index + 1}`, ...row }));
          this.tables.set(table, [...currentRows, ...insertedRows]);
          await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(insertedRows) }); return;
        }
        if (method === "PATCH") {
          const matchingRows = applyFilters(currentRows, url.searchParams); const matchingIds = new Set(matchingRows.map(({ id }) => id));
          const updatedRows = currentRows.map((row) => matchingIds.has(row.id) ? { ...row, ...body } : row);
          this.tables.set(table, updatedRows);
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(updatedRows.filter(({ id }) => matchingIds.has(id))) }); return;
        }
        if (method === "DELETE") {
          const matchingRows = applyFilters(currentRows, url.searchParams); const matchingIds = new Set(matchingRows.map(({ id }) => id));
          this.tables.set(table, currentRows.filter(({ id }) => !matchingIds.has(id)));
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(matchingRows) }); return;
        }
      }
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "E2E_WRITE_BLOCKED", message: "Las escrituras están bloqueadas por el entorno E2E" }) }); return;
    }
    if (this.failures.has(table)) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "E2E_CONTROLLED_ERROR", message: this.failures.get(table) }) }); return;
    }
    const rows = applyFilters(this.tables.get(table) ?? [], url.searchParams);
    const wantsSingleObject = request.headers()["accept"]?.includes("application/vnd.pgrst.object+json");
    const response = wantsSingleObject ? (rows[0] ?? null) : rows;
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` }, body: method === "HEAD" ? "" : JSON.stringify(response) });
  }
}

export const test = base.extend({
  supabaseMock: [async ({ page }, use) => {
    const mock = new SupabaseMock(); await mock.install(page); await use(mock);
    expect(mock.productionRequests, "Ninguna prueba puede intentar conectarse a un proyecto Supabase remoto").toEqual([]);
  }, { auto: true }],
});

export { expect } from "@playwright/test";
export { TEST_PASSWORD };

export async function seedAuthSession(page, supabaseMock, profile, options = {}) {
  const { user } = supabaseMock.registerUser(profile, options); const session = sessionFor(user, options);
  const storage = { key: AUTH_STORAGE_KEY, value: session };
  if (page.url().startsWith("http://127.0.0.1:")) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), storage);
  } else {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), storage);
  }
  return session;
}

export async function loginThroughUi(page, supabaseMock, profile, options = {}) {
  const password = options.password || TEST_PASSWORD;
  supabaseMock.registerUser(profile, { ...options, password }); await page.goto("/");
  await page.getByLabel("Usuario").fill(profile.usuario);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/panel$/);
}
