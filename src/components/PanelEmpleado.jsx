// src/components/PanelEmpleado.jsx
import { useState, useEffect } from "react";
import { supabase } from "../services/supabase";
import { obtenerColorSeccion } from "../utils/coloresSeccion";

export default function PanelEmpleado() {
  const [rutinasAsignadas, setRutinasAsignadas] = useState([]);
  const [tareasUrgentes, setTareasUrgentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [completadasHoy, setCompletadasHoy] = useState({});

  const usuario = JSON.parse(localStorage.getItem("usuarioBarberia"));

  useEffect(() => {
    if (usuario?.id) {
      cargarDatosAsignados();
    }
  }, []);

  const cargarDatosAsignados = async () => {
    try {
      setCargando(true);
      const hoy = new Date().toISOString().split("T")[0];

      // 1. Buscamos rutinas asignadas
      const { data: asignaciones, error: errAsig } = await supabase
        .from("empleado_rutinas")
        .select("rutina_id")
        .eq("empleado_id", usuario.id);

      if (errAsig) throw errAsig;
      const idsRutinas = asignaciones?.map((a) => a.rutina_id) || [];

      if (idsRutinas.length > 0) {
        const { data: datosRutinas, error: errRutinas } = await supabase
          .from("rutinas")
          .select(`id, titulo, tareas_rutina (id, seccion, descripcion, orden)`)
          .in("id", idsRutinas);

        if (errRutinas) throw errRutinas;
        setRutinasAsignadas(datosRutinas || []);
      }

      // 2. Buscamos tareas urgentes enviadas para hoy
      const { data: datosUrgentes, error: errUrg } = await supabase
        .from("tareas_urgentes")
        .select("*")
        .eq("empleado_id", usuario.id)
        .eq("fecha", hoy);

      if (errUrg) throw errUrg;
      setTareasUrgentes(datosUrgentes || []);

      // 3. Auditoría general del día
      const { data: datosAuditoria, error: errAuditoria } = await supabase
        .from("auditoria_diaria")
        .select("tarea_id")
        .eq("empleado_id", usuario?.id)
        .eq("fecha", hoy);

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
    } finally {
      setCargando(false);
    }
  };

  const toggleTarea = async (tareaId, esUrgente = false) => {
    const hoy = new Date().toISOString().split("T")[0];
    const yaCompletada = completadasHoy[tareaId];

    try {
      if (esUrgente) {
        // Actualizamos estado en la tabla de tareas urgentes
        const nuevoEstado = !yaCompletada;
        const { error } = await supabase
          .from("tareas_urgentes")
          .update({ completada: nuevoEstado })
          .eq("id", tareaId);

        if (error) throw error;
        setCompletadasHoy((prev) => ({ ...prev, [tareaId]: nuevoEstado }));
      } else {
        // Lógica habitual para tareas de rutina
        if (yaCompletada) {
          await supabase
            .from("auditoria_diaria")
            .delete()
            .eq("tarea_id", tareaId)
            .eq("empleado_id", usuario?.id)
            .eq("fecha", hoy);

          setCompletadasHoy((prev) => {
            const newState = { ...prev };
            delete newState[tareaId];
            return newState;
          });
        } else {
          const { error } = await supabase
            .from("auditoria_diaria")
            .insert([
              { tarea_id: tareaId, empleado_id: usuario?.id, fecha: hoy },
            ]);

          if (error) throw error;
          setCompletadasHoy((prev) => ({ ...prev, [tareaId]: true }));
        }
      }
    } catch (err) {
      console.error("Error al actualizar tarea:", err);
    }
  };

  if (cargando) {
    return (
      <div className="text-center py-10 text-gray-500">
        Cargando tus tareas...
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
                <div
                  key={urg.id}
                  onClick={() => toggleTarea(urg.id, true)}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
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
                </div>
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
            className="bg-white rounded-xl shadow overflow-hidden"
          >
            <div className="bg-gray-800 text-white px-6 py-3 font-semibold text-lg">
              {rutina.titulo}
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
                      <div
                        key={tarea.id}
                        onClick={() => toggleTarea(tarea.id, false)}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
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
                      </div>
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
