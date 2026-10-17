export const TECHNICAL_AUTH_EMAIL_DOMAIN = "auth.gestor-barberia.invalid";
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function canonicalUsername(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_username");
  const normalized = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) throw new Error("invalid_username");
  return normalized;
}

export function technicalAuthEmail(username: unknown): string {
  return `${canonicalUsername(username)}@${TECHNICAL_AUTH_EMAIL_DOMAIN}`;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_password");
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes < 12 || bytes > 72) throw new Error("invalid_password");
  const characterClasses = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length;
  if (characterClasses < 3 || /^(.)\1+$/u.test(value)) {
    throw new Error("weak_password");
  }
  return value;
}

export function validateEmployeeName(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_employee_name");
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 100) {
    throw new Error("invalid_employee_name");
  }
  return normalized;
}
