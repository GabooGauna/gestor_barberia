import { supabase } from "./supabase";

export class AdminUserError extends Error {
  constructor(code = "operation_failed") {
    super(code);
    this.code = code;
  }
}

export async function runAdminUserAction(payload) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: payload,
  });

  if (error) {
    let code = "operation_failed";
    try {
      const responseBody = await error.context?.json();
      code = responseBody?.error || code;
    } catch {
      // La interfaz mantiene un error seguro aunque la respuesta no sea JSON.
    }
    throw new AdminUserError(code);
  }
  if (!data?.ok) throw new AdminUserError(data?.error);
  return data;
}
