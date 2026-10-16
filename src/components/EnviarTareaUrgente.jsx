// src/components/EnviarTareaUrgente.jsx
import { useState, useEffect } from "react";
import { supabase } from "../services/supabase";

export default function EnviarTareaUrgente() {
  const [empleados, setEmpleados] = useState([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const cargarEmpleados = async () => {
    try {
      const { data, error } = await supabase
        .from("empleados")
        .select("id, nombre, rol")
        .order("nombre");

      if (error) throw error;
      setEmpleados(data || []);
    } catch (err) {
      console.error("Error al cargar empleados:", err);
    }
  };

  useEffect(() => {
    queueMicrotask(cargarEmpleados);
  }, []);

  const enviarUrgencia = async (e) => {
    e.preventDefault();
    if (!empleadoId || !descripcion.trim()) {
      setMensaje("Selecciona un empleado y escribe la tarea.");
      return;
    }

    try {
      setCargando(true);
      setMensaje("");

      const { error } = await supabase.from("tareas_urgentes").insert([
        {
          empleado_id: empleadoId,
          descripcion: descripcion.trim(),
          fecha: new Date().toISOString().split("T")[0],
          completada: false,
        },
      ]);

      if (error) throw error;

      setMensaje("¡Tarea urgente enviada con éxito!");
      setDescripcion("");
      setTimeout(() => setMensaje(""), 3000);
    } catch (err) {
      console.error("Error al enviar tarea urgente:", err);
      setMensaje("No se pudo enviar la tarea.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow border border-amber-100 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span>🚨</span> Enviar Tarea Urgente / Ad-Hoc
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Asigna una indicación extraordinaria fuera de la rutina para un
          empleado.
        </p>
      </div>

      <form onSubmit={enviarUrgencia} className="space-y-4">
        <div>
          <label htmlFor="urgent-employee" className="block text-xs font-semibold text-gray-600 uppercase mb-1">
            Seleccionar Empleado
          </label>
          <select
            id="urgent-employee"
            value={empleadoId}
            onChange={(e) => setEmpleadoId(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-amber-500 text-sm bg-white"
          >
            <option value="">-- Elige un barbero --</option>
            {empleados.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nombre} ({emp.rol})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="urgent-description" className="block text-xs font-semibold text-gray-600 uppercase mb-1">
            Descripción de la Urgencia
          </label>
          <textarea
            id="urgent-description"
            rows="3"
            placeholder="Ej. Limpiar a fondo el espejo de la estación 3 antes de las 15:00 hs."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-amber-500 text-sm bg-white"
          />
        </div>

        {mensaje && (
          <p
            role={mensaje.includes("éxito") ? "status" : "alert"}
            className={`text-xs font-medium p-3 rounded-lg ${
              mensaje.includes("éxito")
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {mensaje}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="w-full bg-amber-600 text-white font-medium py-3 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 text-sm shadow-md"
        >
          {cargando ? "Enviando..." : "Enviar Alerta Urgente"}
        </button>
      </form>
    </div>
  );
}
