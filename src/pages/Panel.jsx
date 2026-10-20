// src/pages/Panel.jsx
import { lazy, Suspense } from "react";
import BrandLogo from "../components/BrandLogo";
import UserActionsMenu from "../components/UserActionsMenu";
import { useAuth } from "../hooks/useAuth";

const PanelAdmin = lazy(() => import("../components/PanelAdmin"));
const PanelEmpleado = lazy(() => import("../components/PanelEmpleado"));

export default function Panel() {
  const { profile: usuario, signOut } = useAuth();

  return (
    <div className="app-shell">
      <div className="mobile-topbar" aria-label="Cabecera móvil">
        <BrandLogo className="brand-logo--mobile" />
        <UserActionsMenu usuario={usuario} onLogout={signOut} mobile />
      </div>
      <aside className="app-rail" aria-label="Contexto de la aplicación">
        <BrandLogo className="brand-logo--rail" />
        <div className="rail-guide" aria-hidden="true" />
      </aside>
      <div className="app-workspace">
        {/* Cabecera común para ambos roles */}
        <header className="workspace-header">
          <div>
            <p className="context-label">Jornada en curso</p>
            <h1>
              Mesa de trabajo
            </h1>
          </div>
          <UserActionsMenu usuario={usuario} onLogout={signOut} />
        </header>

        {/* Renderizado condicional: Si el rol es admin, muestra PanelAdmin. Si no, PanelEmpleado */}
        <main className="workspace-main">
          <Suspense fallback={
            <div className="loading-state" role="status">
              <span className="loading-dot" aria-hidden="true" />Cargando panel…
            </div>
          }>
            {usuario?.rol === "admin" ? <PanelAdmin /> : <PanelEmpleado usuario={usuario} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
