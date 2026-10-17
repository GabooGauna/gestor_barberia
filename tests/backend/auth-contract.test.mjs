import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalUsername,
  technicalAuthEmail,
  validateEmployeeName,
  validatePassword,
} from "../../supabase/functions/_shared/auth-contract.ts";

test("normaliza el username con el mismo contrato de SQL", () => {
  assert.equal(canonicalUsername("  Admin.Operaciones  "), "admin.operaciones");
  assert.equal(
    technicalAuthEmail("Admin.Operaciones"),
    "admin.operaciones@auth.gestor-barberia.invalid",
  );
});

test("rechaza usernames ambiguos o fuera del alfabeto acordado", () => {
  for (const value of ["ab", "José", "con espacio", "_inicial", "a".repeat(33)]) {
    assert.throws(() => canonicalUsername(value), /invalid_username/);
  }
});

test("limita passwords por bytes y exige diversidad minima", () => {
  assert.equal(validatePassword("Correct-horse-1"), "Correct-horse-1");
  assert.throws(() => validatePassword("short"), /invalid_password/);
  assert.throws(() => validatePassword("x".repeat(73)), /invalid_password/);
  assert.throws(() => validatePassword("aaaaaaaaaaaa"), /weak_password/);
  assert.throws(() => validatePassword("onlylowercase"), /weak_password/);
});

test("normaliza el nombre visible sin aceptar valores vacios", () => {
  assert.equal(validateEmployeeName("  Ana   Perez  "), "Ana Perez");
  assert.throws(() => validateEmployeeName(" "), /invalid_employee_name/);
});
