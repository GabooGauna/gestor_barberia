// src/components/AsignarRutinas.jsx
import { useState, useEffect } from "react";
import { supabase } from "../services/supabase";

export default function AsignarRutinas() {
  const [empleados, setEmpleados] = useState([]);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
  const [rutinasTotales, setRutinasTotales] = useState([]);
  const [rutinasAsignadasIds, setRutinasAsignadasIds] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const cargarDatosIniciales = async () => {
    try {
      setCargando(true);
      // Obtenemos solo los empleados (puedes filtrar por rol 'empleado')
      const { data: empData, error: empErr } = await supabase
        .from("empleados")
        .select("id, nombre, rol")
        .order("nombre");

      if (empErr) throw empErr;
      setEmpleados(empData || []);

      // Obtenemos todas las rutinas disponibles en el sistema
      const { data: rutData, error: rutErr } = await supabase
        .from("rutinas")
        .select("id, titulo")
        .order("titulo");

      if (rutErr) throw rutErr;
      setRutinasTotales(rutData || []);
    } catch (err) {
      console.error("Error al cargar datos iniciales:", err);
    } finally {
      setCargando(false);
    }
  };

  const cargarRutinasDelEmpleado = async (empleadoId) => {
    try {
      const { data, error } = await supabase
        .from("empleado_rutinas")
        .select("rutina_id")
        .eq("empleado_id", empleadoId);

      if (error) throw error;

      // Convertimos el resultado en un array plano de IDs (ej: ['uuid-1', 'uuid-2'])
      const ids = data.map((item) => item.rutina_id);
      setRutinasAsignadasIds(ids);
    } catch (err) {
      console.error("Error al cargar rutinas del empleado:", err);
    }
  };

  // 1. Cargamos la lista de empleados y las rutinas generales al montar el componente
  useEffect(() => {
    queueMicrotask(cargarDatosIniciales);
  }, []);

  // 2. Cada vez que el administrador cambia de empleado, buscamos qué rutinas tiene asignadas
  useEffect(() => {
    if (empleadoSeleccionado) {
      queueMicrotask(() =>
        cargarRutinasDelEmpleado(empleadoSeleccionado.id),
      );
    }
  }, [empleadoSeleccionado]);

  // Función al marcar o desmarcar una casilla (Checkbox)
  const toggleAsignacionRutina = async (rutinaId) => {
    if (!empleadoSeleccionado) return;

    const yaAsignada = rutinasAsignadasIds.includes(rutinaId);

    try {
      setMensaje("");
      if (yaAsignada) {
        // Si ya la tenía, la borramos de la tabla puente
        const { error } = await supabase
          .from("empleado_rutinas")
          .delete()
          .eq("empleado_id", empleadoSeleccionado.id)
          .eq("rutina_id", rutinaId);

        if (error) throw error;

        setRutinasAsignadasIds((prev) => prev.filter((id) => id !== rutinaId));
      } else {
        // Si no la tenía, la insertamos en la tabla puente
        const { error } = await supabase.from("empleado_rutinas").insert([
          {
            empleado_id: empleadoSeleccionado.id,
            rutina_id: rutinaId,
          },
        ]);

        if (error) throw error;

        setRutinasAsignadasIds((prev) => [...prev, rutinaId]);
      }
      setMensaje("Cambios guardados correctamente.");
      setTimeout(() => setMensaje(""), 2500);
    } catch (err) {
      console.error("Error al modificar asignación:", err);
      setMensaje("Error al actualizar la asignación.");
    }
  };

  if (cargando) {
    return (
      <div className="text-center py-8 text-gray-400">
        Cargando panel de asignaciones...
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow border border-gray-100 space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-800">
          Asignación de Rutinas al Personal
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Selecciona un empleado para configurar qué protocolos debe cumplir en
          su panel.
        </p>
      </div>

      {/* Selectores de Empleados en forma de botones o select */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600 uppercase">
          1. Selecciona un Empleado:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {empleados.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setEmpleadoSeleccionado(emp)}
              className={`p-3 text-left rounded-xl border-2 transition-all ${
                empleadoSeleccionado?.id === emp.id
                  ? "bg-blue-50 border-blue-500 text-blue-900 font-bold shadow-sm"
                  : "bg-gray-50 border-gray-200 hover:border-gray-300 text-gray-700"
              }`}
            >
              <div className="capitalize truncate">{emp.nombre}</div>
              <span className="text-[10px] uppercase text-gray-400 font-medium">
                {emp.rol}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Listado de Rutinas con Checkboxes si hay un empleado seleccionado */}
      {empleadoSeleccionado ? (
        <div className="space-y-3 pt-4 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-semibold text-gray-600 uppercase">
              2. Rutinas asignadas a{" "}
              <span className="text-blue-600 capitalize font-bold">
                {empleadoSeleccionado.nombre}
              </span>
              :
            </label>
            {mensaje && (
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                {mensaje}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rutinasTotales.map((rutina) => {
              const asignada = rutinasAsignadasIds.includes(rutina.id);
              return (
                <button
                  type="button"
                  key={rutina.id}
                  onClick={() => toggleAsignacionRutina(rutina.id)}
                  aria-pressed={asignada}
                  className={`w-full text-left flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    asignada
                      ? "bg-blue-50 border-blue-400 text-blue-900 font-medium"
                      : "bg-white border-gray-200 hover:border-gray-300 text-gray-600"
                  }`}
                >
                  <span className="text-sm">{rutina.titulo}</span>
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center border-2 transition-colors ${
                      asignada
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {asignada && <span className="text-xs font-bold">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400 text-sm">
          Haz clic en uno de arriba para comenzar a configurar sus tareas.
        </div>
      )}
    </div>
  );
}
