export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const TECHNICAL_AUTH_DOMAIN = "auth.gestor-barberia.invalid";

export function canonicalUsername(value) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value) {
  return USERNAME_PATTERN.test(canonicalUsername(value));
}

export function technicalAuthEmail(username) {
  const canonical = canonicalUsername(username);
  if (!USERNAME_PATTERN.test(canonical)) throw new Error("invalid_username");
  return `${canonical}@${TECHNICAL_AUTH_DOMAIN}`;
}

export function passwordValidationError(password) {
  const byteLength = new TextEncoder().encode(password).length;
  if (byteLength < 12 || byteLength > 72) {
    return "La contraseña debe tener entre 12 y 72 bytes.";
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]
    .filter((pattern) => pattern.test(password)).length;
  return classes >= 3
    ? ""
    : "Usá al menos tres tipos: minúsculas, mayúsculas, números o símbolos.";
}
