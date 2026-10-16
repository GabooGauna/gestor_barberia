// src/pages/Login.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import ThemeSelector from "../components/ThemeSelector";
import BrandLogo from "../components/BrandLogo";

export default function Login() {
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState([]);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
  const [pin, setPin] = useState("");
  const [errorMensaje, setErrorMensaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const pinInputRef = useRef(null);
  const profileButtonRefs = useRef(new Map());
  const lastProfileIdRef = useRef(null);
  const restoreProfileFocusRef = useRef(false);

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

  // Al cargar la página, traemos la lista de empleados desde Supabase
  useEffect(() => {
    queueMicrotask(cargarEmpleados);
  }, []);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      if (empleadoSeleccionado) {
        pinInputRef.current?.focus({ preventScroll: true });
        return;
      }

      if (restoreProfileFocusRef.current && lastProfileIdRef.current) {
        profileButtonRefs.current
          .get(lastProfileIdRef.current)
          ?.focus({ preventScroll: true });
        restoreProfileFocusRef.current = false;
      }
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [empleadoSeleccionado]);

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
      <div className="login-stage" aria-live="polite" aria-busy="true">
        <div className="loading-state"><span className="loading-dot" />Preparando la mesa de trabajo…</div>
      </div>
    );
  }

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
        <div className="mb-6">
          <h2 id="access-title" className="text-2xl font-bold text-gray-800">Ingresar</h2>
          <p className="text-sm text-gray-500 mt-1">Selecciona tu perfil para continuar.</p>
        </div>

        {/* PASO 1: Selector de Empleados */}
        {!empleadoSeleccionado ? (
          <div className="space-y-3">
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {empleados.map((emp) => (
                <button
                  key={emp.id}
                  ref={(node) => {
                    if (node) profileButtonRefs.current.set(emp.id, node);
                    else profileButtonRefs.current.delete(emp.id);
                  }}
                  onClick={() => {
                    lastProfileIdRef.current = emp.id;
                    setEmpleadoSeleccionado(emp);
                    setErrorMensaje("");
                  }}
                  className="person-row group"
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
            {empleados.length === 0 && !errorMensaje && (
              <p className="text-center text-sm text-gray-600 py-4">
                No hay empleados registrados en la base de datos.
              </p>
            )}
            {errorMensaje && (
              <p
                role="alert"
                className="text-red-600 text-sm font-medium text-center"
              >
                {errorMensaje}
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
                  restoreProfileFocusRef.current = true;
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
              <label
                htmlFor="pin-acceso"
                className="text-sm font-medium text-gray-600 block"
              >
                Ingresa tu PIN de 4 dígitos
              </label>
              <input
                id="pin-acceso"
                ref={pinInputRef}
                type="password"
                maxLength="4"
                placeholder="****"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center text-4xl tracking-[0.75em] pl-[0.75em] p-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors caret-transparent"
              />
            </div>

            {errorMensaje && (
              <p
                role="alert"
                className="text-red-600 text-sm font-medium text-center"
              >
                {errorMensaje}
              </p>
            )}

            <button
              type="submit"
              disabled={pin.length !== 4}
              className="button button--primary w-full"
            >
              Confirmar e Ingresar
            </button>
          </form>
        )}
        </section>
      </div>
    </main>
  );
}
