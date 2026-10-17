// src/components/PanelEmpleado.jsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { obtenerColorSeccion } from "../utils/coloresSeccion";
import {
  DEFAULT_ROUTINE_COLOR,
  ROUTINE_COLORS_ENABLED,
  normalizeRoutineColor,
  routineColorClass,
} from "../utils/coloresRutina";
import { currentBusinessDate } from "../utils/businessDate";

export default function PanelEmpleado({ usuario }) {
  const [rutinasAsignadas, setRutinasAsignadas] = useState([]);
  const [tareasUrgentes, setTareasUrgentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [completadasHoy, setCompletadasHoy] = useState({});
  const [errorMensaje, setErrorMensaje] = useState("");

  const usuarioId = usuario?.id;

  const cargarDatosAsignados = useCallback(async () => {
    try {
      setCargando(true);
      setErrorMensaje("");
      const hoy = currentBusinessDate();

      // 1. Buscamos rutinas asignadas
      const { data: asignaciones, error: errAsig } = await supabase
        .from("empleado_rutinas")
        .select("rutina_id")
        .eq("empleado_id", usuarioId);

      if (errAsig) throw errAsig;
      const idsRutinas = asignaciones?.map((a) => a.rutina_id) || [];

      if (idsRutinas.length > 0) {
        const selection = ROUTINE_COLORS_ENABLED
          ? "id, titulo, color, tareas_rutina (id, seccion, descripcion, orden)"
          : "id, titulo, tareas_rutina (id, seccion, descripcion, orden)";
        const { data: datosRutinas, error: errRutinas } = await supabase
          .from("rutinas")
          .select(selection)
          .in("id", idsRutinas);

        if (errRutinas) throw errRutinas;
        setRutinasAsignadas((datosRutinas || []).map((rutina) => ({
          ...rutina,
          color: ROUTINE_COLORS_ENABLED
            ? normalizeRoutineColor(rutina.color)
            : DEFAULT_ROUTINE_COLOR,
        })));
      } else {
        setRutinasAsignadas([]);
      }

      // 2. Buscamos tareas urgentes enviadas para hoy
      const { data: datosUrgentes, error: errUrg } = await supabase
        .from("tareas_urgentes")
        .select("id, descripcion, completada")
        .eq("empleado_id", usuarioId)
        .eq("fecha", hoy)
        .is("cancelada_en", null);

      if (errUrg) throw errUrg;
      setTareasUrgentes(datosUrgentes || []);

      // 3. Auditoría general del día
      const { data: datosAuditoria, error: errAuditoria } = await supabase
        .from("auditoria_diaria")
        .select("tarea_id")
        .eq("empleado_id", usuarioId)
        .eq("fecha", hoy)
        .is("anulada_en", null);

      if (errAuditoria) throw errAuditoria;

      const mapaCompletadas = {};
      datosAuditoria?.forEach((item) => {
        mapaCompletadas[item.tarea_id] = true;
      });

      // Añadimos también el estado de las urgentes
      datosUrgentes?.forEach((urg) => {
        if (urg.completada) mapaCompletadas[urg.id] = true;
      });

      setCompletadasHoy(mapaCompletadas);
    } catch (err) {
      console.error("Error cargando protocolos:", err);
      setErrorMensaje("No se pudieron cargar tus tareas. Intenta nuevamente.");
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    if (usuarioId) {
      queueMicrotask(cargarDatosAsignados);
    }
  }, [cargarDatosAsignados, usuarioId]);

  const toggleTarea = async (tareaId, esUrgente = false) => {
    const yaCompletada = completadasHoy[tareaId];

    try {
      if (esUrgente) {
        const nuevoEstado = !yaCompletada;
        const { error } = await supabase.rpc("set_urgent_completion", {
          p_urgent_id: tareaId,
          p_completed: nuevoEstado,
        });

        if (error) throw error;
        setCompletadasHoy((prev) => ({ ...prev, [tareaId]: nuevoEstado }));
      } else {
        const { error } = await supabase.rpc("set_task_completion", {
          p_tarea_id: tareaId,
          p_completed: !yaCompletada,
        });
        if (error) throw error;
        setCompletadasHoy((prev) => ({ ...prev, [tareaId]: !yaCompletada }));
      }
    } catch (err) {
      console.error("Error al actualizar tarea:", err);
      setErrorMensaje("No se pudo actualizar la tarea. Volvé a intentar.");
    }
  };

  if (cargando) {
    return (
      <div className="loading-state justify-center py-10" role="status" aria-live="polite">
        <span className="loading-dot" aria-hidden="true" />
        Cargando tus tareas…
      </div>
    );
  }

  if (errorMensaje) {
    return (
      <div className="bg-red-50 border p-6 rounded-xl text-red-600" role="alert">
        <p className="font-semibold">{errorMensaje}</p>
        <button type="button" className="button mt-4 border" onClick={cargarDatosAsignados}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-xl font-bold text-gray-800 mb-1">
          Mis Protocolos Asignados
        </h2>
        <p className="text-sm text-gray-500">
          Hola {usuario?.nombre}, revisa tus tareas y avisos urgentes del día.
        </p>
      </div>

      {/* SECCIÓN DE TAREAS URGENTES (Destacadas en color ámbar/naranja) */}
      {tareasUrgentes.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-md overflow-hidden p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-amber-200 pb-3">
            <span className="text-xl">🚨</span>
            <h3 className="font-bold text-amber-900 text-lg">
              Avisos y Tareas Urgentes del Administrador
            </h3>
          </div>

          <div className="space-y-3">
            {tareasUrgentes.map((urg) => {
              const estaLista = completadasHoy[urg.id];
              return (
                <button
                  type="button"
                  key={urg.id}
                  onClick={() => toggleTarea(urg.id, true)}
                  aria-pressed={Boolean(estaLista)}
                  className={`w-full text-left flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    estaLista
                      ? "bg-green-50 border-green-300 text-green-900"
                      : "bg-white border-amber-300 hover:border-amber-400 text-amber-950 shadow-sm"
                  }`}
                >
                  <div className="pr-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider block text-amber-600 mb-1">
                      ⚠️ Indicación Extraordinaria
                    </span>
                    <p
                      className={`font-semibold ${estaLista ? "line-through text-green-700" : ""}`}
                    >
                      {urg.descripcion}
                    </p>
                  </div>

                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0 ${
                      estaLista
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-amber-400 bg-white"
                    }`}
                  >
                    {estaLista && <span className="font-bold text-sm">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rutinas Asignadas Normales */}
      {rutinasAsignadas.length === 0 && tareasUrgentes.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow text-center text-gray-400">
          <p>No tienes tareas ni rutinas asignadas en este momento.</p>
        </div>
      ) : (
        rutinasAsignadas.map((rutina) => (
          <div
            key={rutina.id}
            className={`${routineColorClass(rutina.color)} bg-white rounded-xl shadow overflow-hidden`}
          >
            <div className="bg-gray-800 text-white px-6 py-3 font-semibold text-lg flex items-center gap-3">
              <span
                className={`routine-color-dot routine-accent--${normalizeRoutineColor(rutina.color)}`}
                aria-hidden="true"
              />
              <span>{rutina.titulo}</span>
            </div>

            <div className="p-6 space-y-4">
              {rutina.tareas_rutina && rutina.tareas_rutina.length > 0 ? (
                rutina.tareas_rutina
                  .sort((a, b) => a.orden - b.orden)
                  .map((tarea) => {
                    const estaLista = completadasHoy[tarea.id];
                    // Obtenemos el color pastel asignado a esta sección
                    const estiloSeccion = obtenerColorSeccion(tarea.seccion);

                    return (
                      <button
                        type="button"
                        key={tarea.id}
                        onClick={() => toggleTarea(tarea.id, false)}
                        aria-pressed={Boolean(estaLista)}
                        className={`w-full text-left flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          estaLista
                            ? "bg-green-50 border-green-300 text-green-900"
                            : `${estiloSeccion.bg} hover:shadow-sm`
                        }`}
                      >
                        <div>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md inline-block mb-1 ${
                              estaLista
                                ? "bg-green-100 text-green-800"
                                : estiloSeccion.badge
                            }`}
                          >
                            {tarea.seccion}
                          </span>
                          <p
                            className={`font-medium ${estaLista ? "line-through text-green-700" : ""}`}
                          >
                            {tarea.descripcion}
                          </p>
                        </div>

                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0 ${
                            estaLista
                              ? "bg-green-500 border-green-500 text-white"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {estaLista && (
                            <span className="font-bold text-sm">✓</span>
                          )}
                        </div>
                      </button>
                    );
                  })
              ) : (
                <p className="text-sm text-gray-400 italic">
                  Esta rutina no tiene tareas cargadas.
                </p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
