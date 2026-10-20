import { useState } from "react";
import { runAdminUserAction } from "../services/adminUsers";
import { canonicalUsername, isValidUsername, passwordValidationError } from "../utils/auth";

const SAFE_ACCOUNT_ERRORS = {
  account_not_available: "No se pudo crear la cuenta. Revisá que el usuario no esté en uso.",
  invalid_username: "El usuario no tiene un formato válido.",
  invalid_employee_name: "Revisá el nombre del integrante.",
  invalid_password: "La contraseña no cumple los requisitos.",
  weak_password: "La contraseña no cumple los requisitos.",
  admin_required: "Tu cuenta no tiene permiso para crear integrantes.",
};

export default function RegistroEmpleados({ onEmpleadoCreado }) {
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [rol, setRol] = useState("empleado");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMensaje({ texto: "", tipo: "" });
    const canonical = canonicalUsername(username);
    const passwordError = passwordValidationError(password);
    if (!nombre.trim()) return setMensaje({ texto: "Ingresá el nombre del integrante.", tipo: "error" });
    if (!isValidUsername(canonical)) return setMensaje({ texto: "El usuario debe tener de 3 a 32 caracteres: letras minúsculas, números, punto, guion o guion bajo.", tipo: "error" });
    if (passwordError) return setMensaje({ texto: passwordError, tipo: "error" });
    if (password !== passwordConfirmation) return setMensaje({ texto: "Las contraseñas no coinciden.", tipo: "error" });

    try {
      setCargando(true);
      await runAdminUserAction({ action: "create", name: nombre.trim(), username: canonical, password, role: rol });
      setMensaje({ texto: "Cuenta creada. Entregá la contraseña inicial por un canal seguro.", tipo: "exito" });
      setNombre("");
      setUsername("");
      setPassword("");
      setPasswordConfirmation("");
      setRol("empleado");
      await onEmpleadoCreado?.();
    } catch (error) {
      setMensaje({ texto: SAFE_ACCOUNT_ERRORS[error.code] || "No se pudo crear la cuenta.", tipo: "error" });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="surface-panel p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-1">Registrar integrante</h3>
      <p className="text-xs text-gray-500 mb-4">Creá su perfil y definí una contraseña inicial.</p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="form-field compact">
          <label htmlFor="employee-name">Nombre</label>
          <input id="employee-name" type="text" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={cargando} />
        </div>
        <div className="form-field compact">
          <label htmlFor="employee-username">Usuario</label>
          <input id="employee-username" type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" value={username} onChange={(e) => setUsername(e.target.value)} disabled={cargando} />
          <small>3–32 caracteres, sin espacios ni acentos.</small>
        </div>
        <div className="form-field compact">
          <label htmlFor="employee-password">Contraseña inicial</label>
          <input id="employee-password" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={cargando} />
          <small>Recomendamos 12 caracteres o más. Combiná al menos tres de estos tipos: mayúsculas, minúsculas, números o símbolos.</small>
        </div>
        <div className="form-field compact">
          <label htmlFor="employee-password-confirmation">Repetir contraseña</label>
          <input id="employee-password-confirmation" type={showPasswords ? "text" : "password"} autoComplete="new-password" value={passwordConfirmation} onChange={(e) => setPasswordConfirmation(e.target.value)} disabled={cargando} />
        </div>
        <label className="password-visibility">
          <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
          Mostrar contraseñas
        </label>
        <div className="form-field compact">
          <label htmlFor="employee-role">Rol</label>
          <select id="employee-role" value={rol} onChange={(e) => setRol(e.target.value)} disabled={cargando}>
            <option value="empleado">Empleado</option>
            <option value="admin">Administrador</option>
          </select>
        </div>

        {mensaje.texto && <p role={mensaje.tipo === "error" ? "alert" : "status"} className={`form-message form-message--${mensaje.tipo}`}>{mensaje.texto}</p>}

        <button type="submit" disabled={cargando} className="button button--primary w-full">
          {cargando ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}
