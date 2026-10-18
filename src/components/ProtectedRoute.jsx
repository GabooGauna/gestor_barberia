import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AdminMfa from "./AdminMfa";

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { session, profile, loading, mfaRequired } = useAuth();

  if (loading) {
    return (
      <div className="login-stage" aria-live="polite" aria-busy="true">
        <div className="loading-state"><span className="loading-dot" />Verificando sesión…</div>
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (profile.rol === "admin" && mfaRequired) return <AdminMfa />;

  return children;
}
