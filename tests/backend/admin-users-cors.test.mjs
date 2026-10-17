import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import * as authContract from "../../supabase/functions/_shared/auth-contract.ts";

// Execute the actual Edge handler with the native Fetch implementation. CORS
// must terminate before constructing any Auth/database client.
async function loadHandler(allowedOrigin) {
  const source = await readFile(new URL("../../supabase/functions/admin-users/index.ts", import.meta.url), "utf8");
  const executable = stripTypeScriptTypes(source)
    .replace(/import \{ createClient \} from "npm:@supabase\/supabase-js@2";/, "")
    .replace(/import \{[\s\S]*?\} from "\.\.\/_shared\/auth-contract\.ts";/, "");
  let handler;
  const deno = {
    env: { get: (name) => name === "ALLOWED_ORIGIN" ? allowedOrigin : undefined },
    serve: (callback) => { handler = callback; },
  };
  const createClient = () => { throw new Error("Preflight must not contact Auth or PostgreSQL"); };
  const dependencies = { Deno: deno, createClient, ...authContract };
  new Function(...Object.keys(dependencies), executable)(...Object.values(dependencies));
  assert.equal(typeof handler, "function");
  return handler;
}

test("OPTIONS permitido devuelve 204 sin cuerpo y conserva CORS", async () => {
  const handler = await loadHandler("https://gns.example");
  const result = await handler(new Request("https://edge.example/admin-users", {
    method: "OPTIONS",
    headers: {
      origin: "https://gns.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization, content-type, apikey, x-client-info",
    },
  }));
  assert.equal(result.status, 204);
  assert.equal(result.body, null);
  assert.equal(await result.text(), "");
  assert.equal(result.headers.get("access-control-allow-origin"), "https://gns.example");
  assert.equal(result.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  const allowedHeaders = result.headers.get("access-control-allow-headers").split(/,\s*/);
  for (const header of ["authorization", "content-type", "apikey", "x-client-info"]) {
    assert.ok(allowedHeaders.includes(header));
  }
  assert.equal(result.headers.get("vary"), "Origin");
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("OPTIONS rechaza origen ajeno y configuración ausente", async () => {
  for (const allowedOrigin of ["https://gns.example", ""]) {
    const handler = await loadHandler(allowedOrigin);
    const result = await handler(new Request("https://edge.example/admin-users", {
      method: "OPTIONS", headers: { origin: "https://other.example" },
    }));
    assert.equal(result.status, 403);
    assert.equal(result.headers.get("access-control-allow-origin"), "null");
    assert.deepEqual(await result.json(), { error: "origin_not_allowed" });
  }
});
