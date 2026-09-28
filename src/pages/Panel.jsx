// src/pages/Panel.jsx
import { useNavigate } from "react-router-dom";
import PanelAdmin from "../components/PanelAdmin";
import PanelEmpleado from "../components/PanelEmpleado";

export default function Panel() {
  const navigate = useNavigate();
  const usuario = JSON.parse(localStorage.getItem("usuarioBarberia"));

  const cerrarSesion = () => {
    localStorage.removeItem("usuarioBarberia");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Cabecera común para ambos roles */}
        <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800">
              SOP Barbería
            </h1>
            <p className="text-sm text-gray-500 capitalize">
              {usuario?.nombre} ({usuario?.rol})
            </p>
          </div>
          <button
            onClick={cerrarSesion}
            className="bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors font-medium"
          >
            Salir
          </button>
        </header>

        {/* Renderizado condicional: Si el rol es admin, muestra PanelAdmin. Si no, PanelEmpleado */}
        {usuario?.rol === "admin" ? <PanelAdmin /> : <PanelEmpleado />}
      </div>
    </div>
  );
}
