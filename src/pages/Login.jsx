// src/pages/Login.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState([]);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
  const [pin, setPin] = useState("");
  const [errorMensaje, setErrorMensaje] = useState("");
  const [cargando, setCargando] = useState(true);

  // Al cargar la página, traemos la lista de empleados desde Supabase
  useEffect(() => {
    cargarEmpleados();
  }, []);

  const cargarEmpleados = async () => {
    try {
      setCargando(true);
      const { data, error } = await supabase
        .from("empleados")
        .select("id, nombre, rol")
        .order("nombre", { ascending: true });

      if (error) throw error;
      setEmpleados(data || []);
    } catch (err) {
      console.error("Error al cargar empleados:", err);
      setErrorMensaje("No se pudo conectar con la lista de empleados.");
    } finally {
      setCargando(false);
    }
  };

  // Función al enviar el PIN para verificar
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!empleadoSeleccionado) {
      setErrorMensaje("Por favor, selecciona quién eres.");
      return;
    }
    if (pin.length !== 4) {
      setErrorMensaje("El PIN debe tener 4 dígitos.");
      return;
    }

    try {
      setErrorMensaje("");
      // Consultamos si el PIN coincide exactamente con el ID del empleado seleccionado
      const { data, error } = await supabase
        .from("empleados")
        .select("*")
        .eq("id", empleadoSeleccionado.id)
        .eq("pin", pin)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // ¡Credenciales correctas! Guardamos en la memoria y navegamos
        localStorage.setItem("usuarioBarberia", JSON.stringify(data));
        navigate("/panel");
      } else {
        setErrorMensaje("PIN incorrecto para este usuario.");
      }
    } catch (err) {
      console.error("Error en el login:", err);
      setErrorMensaje("Error de autenticación.");
    }
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500 font-medium">Cargando sistema...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Gestor de Barbería
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Selecciona tu perfil para ingresar
          </p>
        </div>

        {/* PASO 1: Selector de Empleados */}
        {!empleadoSeleccionado ? (
          <div className="space-y-3">
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {empleados.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => {
                    setEmpleadoSeleccionado(emp);
                    setErrorMensaje("");
                  }}
                  className="w-full text-left p-4 rounded-xl border-2 border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-all flex justify-between items-center group"
                >
                  <span className="font-semibold text-gray-800 group-hover:text-blue-900 capitalize">
                    {emp.nombre}
                  </span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {emp.rol}
                  </span>
                </button>
              ))}
            </div>
            {empleados.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">
                No hay empleados registrados en la base de datos.
              </p>
            )}
          </div>
        ) : (
          /* PASO 2: Ingreso de PIN personalizado para el empleado seleccionado */
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex justify-between items-center">
              <div>
                <span className="text-xs text-blue-600 font-bold block uppercase">
                  Accediendo como:
                </span>
                <span className="text-lg font-bold text-blue-900 capitalize">
                  {empleadoSeleccionado.nombre}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmpleadoSeleccionado(null);
                  setPin("");
                  setErrorMensaje("");
                }}
                className="text-xs bg-white text-blue-600 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 font-medium transition-colors"
              >
                Cambiar
              </button>
            </div>

            <div className="space-y-2 text-center">
              <label className="text-sm font-medium text-gray-600 block">
                Ingresa tu PIN de 4 dígitos
              </label>
              <input
                type="password"
                maxLength="4"
                placeholder="****"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center text-4xl tracking-[0.75em] pl-[0.75em] p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors caret-transparent"
              />
            </div>

            {errorMensaje && (
              <p className="text-red-500 text-sm font-medium text-center">
                {errorMensaje}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
            >
              Confirmar e Ingresar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
