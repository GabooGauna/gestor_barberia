import { useId, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { canonicalUsername, isValidUsername } from "../utils/auth";
import ThemeSelector from "../components/ThemeSelector";
import BrandLogo from "../components/BrandLogo";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, profile, loading, sessionIssue, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const errorId = useId();

  if (!loading && session && profile) return <Navigate to="/panel" replace />;

  const visibleError = errorMessage || sessionIssue;

  const handleLogin = async (event) => {
    event.preventDefault();
    const canonical = canonicalUsername(username);
    if (!isValidUsername(canonical) || !password) {
      setErrorMessage("Revisá el usuario y la contraseña.");
      return;
    }
    try {
      setSubmitting(true);
      setErrorMessage("");
      await signIn(canonical, password);
      navigate(location.state?.from || "/panel", { replace: true });
    } catch {
      setErrorMessage("No pudimos iniciar sesión con esas credenciales.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-stage">
      <div className="login-frame">
        <section className="login-intro" aria-labelledby="login-title">
          <BrandLogo className="brand-logo--login" />
          <p className="context-label">Operación diaria</p>
          <h1 id="login-title">La jornada, en orden.</h1>
          <p>Rutinas, responsables y avances en un solo lugar de trabajo.</p>
          <ThemeSelector />
        </section>

        <section className="login-panel" aria-labelledby="access-title">
          <div className="login-heading">
            <h2 id="access-title">Ingresar</h2>
            <p>Usá el usuario asignado por administración.</p>
          </div>

          <form onSubmit={handleLogin} className="auth-form" noValidate>
            <div className="form-field">
              <label htmlFor="login-username">Usuario</label>
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-describedby={visibleError ? errorId : undefined}
                disabled={submitting}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="login-password">Contraseña</label>
              <div className="password-field">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={visibleError ? errorId : undefined}
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            {visibleError && <p id={errorId} role="alert" className="form-message form-message--error">{visibleError}</p>}

            <button type="submit" disabled={submitting || loading} className="button button--primary auth-submit">
              {submitting || loading ? "Verificando…" : "Iniciar sesión"}
            </button>
          </form>
          <p className="login-help">Si olvidaste tu contraseña, pedile a un administrador que la restablezca.</p>
        </section>
      </div>
    </main>
  );
}
