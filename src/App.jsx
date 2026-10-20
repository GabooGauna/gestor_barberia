// src/App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext.jsx";

const Panel = lazy(() => import("./pages/Panel"));

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={
          <div className="login-stage">
            <div className="loading-state" role="status">
              <span className="loading-dot" aria-hidden="true" />Cargando mesa de trabajo…
            </div>
          </div>
        }>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/panel" element={<ProtectedRoute><Panel /></ProtectedRoute>} />
            <Route path="*" element={<ProtectedRoute><Panel /></ProtectedRoute>} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
