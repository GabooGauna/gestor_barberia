import { createClient } from "npm:@supabase/supabase-js@2";
import {
  canonicalUsername,
  technicalAuthEmail,
  validateEmployeeName,
  validatePassword,
} from "../_shared/auth-contract.ts";

type AdminAction =
  | {
      action: "create";
      name: string;
      username: string;
      password: string;
      role: "admin" | "empleado";
    }
  | { action: "reset_password"; employeeId: string; password: string }
  | { action: "deactivate"; employeeId: string }
  | { action: "reactivate"; employeeId: string }
  | { action: "change_role"; employeeId: string; role: "admin" | "empleado" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";

function response(origin: string, status: number, body: Record<string, unknown>) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
      "access-control-allow-methods": "POST, OPTIONS",
      vary: "Origin",
    },
  });
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error &&
        typeof error.message === "string"
    ? error.message
    : "";
  if ([
    "invalid_username",
    "invalid_password",
    "weak_password",
    "invalid_employee_name",
    "cannot_deactivate_current_account",
    "cannot_deactivate_last_admin",
    "cannot_demote_last_admin",
    "account_already_active",
    "admin_required",
    "auth_identity_mismatch",
  ].includes(message)) {
    return message;
  }
  return "operation_failed";
}

Deno.serve(async (request) => {
  const requestOrigin = request.headers.get("origin") ?? "";
  const corsOrigin = requestOrigin && requestOrigin === ALLOWED_ORIGIN
    ? requestOrigin
    : ALLOWED_ORIGIN;

  if (!ALLOWED_ORIGIN || (requestOrigin && requestOrigin !== ALLOWED_ORIGIN)) {
    return response("null", 403, { error: "origin_not_allowed" });
  }

  if (request.method === "OPTIONS") return response(corsOrigin, 204, {});
  if (request.method !== "POST") {
    return response(corsOrigin, 405, { error: "method_not_allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("admin-users: missing server configuration");
    return response(corsOrigin, 503, { error: "service_unavailable" });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(corsOrigin, 401, { error: "authentication_required" });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return response(corsOrigin, 401, { error: "authentication_required" });
  }

  const actorAuthUserId = userData.user.id;
  const { data: actor, error: actorError } = await serviceClient
    .from("empleados")
    .select("id, rol, activo")
    .eq("auth_user_id", actorAuthUserId)
    .maybeSingle();

  if (actorError || !actor || !actor.activo || actor.rol !== "admin") {
    return response(corsOrigin, 403, { error: "admin_required" });
  }

  let payload: AdminAction;
  try {
    payload = (await request.json()) as AdminAction;
  } catch {
    return response(corsOrigin, 400, { error: "invalid_request" });
  }

  if (payload?.action !== "create" && !validUuid(payload?.employeeId)) {
    return response(corsOrigin, 400, { error: "invalid_request" });
  }

  const recordOperation = async (employeeId: string, action: string) => {
    const { error } = await serviceClient.rpc("admin_record_auth_operation", {
      p_actor_auth_user_id: actorAuthUserId,
      p_target_empleado_id: employeeId,
      p_action: action,
    });
    if (error) console.error("admin-users audit event failed", action, error.code);
    return !error;
  };

  try {
    if (payload.action === "create") {
      const employeeId = crypto.randomUUID();
      const name = validateEmployeeName(payload.name);
      const username = canonicalUsername(payload.username);
      const password = validatePassword(payload.password);
      if (!["admin", "empleado"].includes(payload.role)) {
        return response(corsOrigin, 400, { error: "invalid_role" });
      }

      if (!await recordOperation(employeeId, "account_create_started")) {
        return response(corsOrigin, 503, { error: "audit_unavailable" });
      }

      const { data: created, error: createError } =
        await serviceClient.auth.admin.createUser({
          email: technicalAuthEmail(username),
          password,
          email_confirm: true,
        });
      if (createError || !created.user) {
        await recordOperation(employeeId, "account_create_auth_failed");
        console.error("admin-users create auth failed", createError?.code);
        return response(corsOrigin, 409, { error: "account_not_available" });
      }

      const { error: profileError } = await serviceClient.rpc(
        "admin_create_employee_account",
        {
          p_actor_auth_user_id: actorAuthUserId,
          p_target_empleado_id: employeeId,
          p_auth_user_id: created.user.id,
          p_nombre: name,
          p_usuario: username,
          p_role: payload.role,
        },
      );

      if (profileError) {
        const { error: compensationError } =
          await serviceClient.auth.admin.deleteUser(created.user.id);
        await recordOperation(
          employeeId,
          compensationError
            ? "account_create_compensation_failed"
            : "account_create_compensated",
        );
        console.error(
          "admin-users profile create failed",
          profileError.code,
          compensationError ? "compensation_failed" : "compensated",
        );
        return response(corsOrigin, 409, { error: "account_not_available" });
      }

      return response(corsOrigin, 201, { ok: true, employeeId });
    }

    const { data: target, error: targetError } = await serviceClient
      .from("empleados")
      .select("id, auth_user_id, activo, rol")
      .eq("id", payload.employeeId)
      .maybeSingle();
    if (targetError || !target?.auth_user_id) {
      return response(corsOrigin, 404, { error: "account_not_found" });
    }

    if (payload.action === "reset_password") {
      const password = validatePassword(payload.password);
      if (!await recordOperation(payload.employeeId, "password_reset_started")) {
        return response(corsOrigin, 503, { error: "audit_unavailable" });
      }
      const { error } = await serviceClient.auth.admin.updateUserById(
        target.auth_user_id,
        { password },
      );
      if (error) {
        await recordOperation(payload.employeeId, "password_reset_failed");
        throw error;
      }

      if (!await recordOperation(payload.employeeId, "password_reset_completed")) {
        return response(corsOrigin, 500, { error: "reconciliation_required" });
      }
      return response(corsOrigin, 200, { ok: true });
    }

    if (payload.action === "deactivate") {
      if (target.auth_user_id === actorAuthUserId) {
        return response(corsOrigin, 409, {
          error: "cannot_deactivate_current_account",
        });
      }
      if (target.rol === "admin" && target.activo) {
        const { count, error: countError } = await serviceClient
          .from("empleados")
          .select("id", { count: "exact", head: true })
          .eq("rol", "admin")
          .eq("activo", true)
          .neq("id", payload.employeeId);
        if (countError || !count) {
          return response(corsOrigin, 409, {
            error: "cannot_deactivate_last_admin",
          });
        }
      }
      const { error: stateError } = await serviceClient.rpc(
        "admin_deactivate_account",
        {
          p_actor_auth_user_id: actorAuthUserId,
          p_target_empleado_id: payload.employeeId,
        },
      );
      if (stateError) throw stateError;

      const { error: banError } = await serviceClient.auth.admin.updateUserById(
        target.auth_user_id,
        { ban_duration: "876000h" },
      );
      if (banError) {
        await recordOperation(
          payload.employeeId,
          "account_deactivation_auth_failed",
        );
        return response(corsOrigin, 502, { error: "reconciliation_required" });
      }
      return response(corsOrigin, 200, { ok: true });
    }

    if (payload.action === "reactivate") {
      if (target.activo) {
        return response(corsOrigin, 409, { error: "account_already_active" });
      }

      const { error: unbanError } = await serviceClient.auth.admin.updateUserById(
        target.auth_user_id,
        { ban_duration: "none" },
      );
      if (unbanError) throw unbanError;

      const { error: stateError } = await serviceClient.rpc(
        "admin_activate_account",
        {
          p_actor_auth_user_id: actorAuthUserId,
          p_target_empleado_id: payload.employeeId,
        },
      );
      if (stateError) {
        await serviceClient.auth.admin.updateUserById(target.auth_user_id, {
          ban_duration: "876000h",
        });
        await recordOperation(payload.employeeId, "account_reactivation_failed");
        return response(corsOrigin, 409, { error: "operation_failed" });
      }
      return response(corsOrigin, 200, { ok: true });
    }

    if (payload.action === "change_role") {
      if (!["admin", "empleado"].includes(payload.role)) {
        return response(corsOrigin, 400, { error: "invalid_role" });
      }
      const { error } = await serviceClient.rpc("admin_set_employee_role", {
        p_actor_auth_user_id: actorAuthUserId,
        p_target_empleado_id: payload.employeeId,
        p_role: payload.role,
      });
      if (error) throw error;
      return response(corsOrigin, 200, { ok: true });
    }

    return response(corsOrigin, 400, { error: "invalid_action" });
  } catch (error) {
    console.error("admin-users operation failed", safeErrorCode(error));
    const code = safeErrorCode(error);
    return response(corsOrigin, code.startsWith("invalid_") ? 400 : 409, {
      error: code,
    });
  }
});
