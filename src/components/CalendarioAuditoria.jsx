// src/components/CalendarioAuditoria.jsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function CalendarioAuditoria() {
  const [fechaSeleccionada, setFechaSeleccionada] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [datosAuditoriaEmpleados, setDatosAuditoriaEmpleados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [desplegados, setDesplegados] = useState({});

  const cargarDatosAuditoria = useCallback(async () => {
    try {
      setCargando(true);

      // 1. Cargamos empleados
      const { data: empleados, error: errEmp } = await supabase
        .from("empleados")
        .select("id, nombre, rol")
        .order("nombre");

      if (errEmp) throw errEmp;

      // 2. Cargamos asignaciones de rutinas
      const { data: asignaciones, error: errAsig } = await supabase
        .from("empleado_rutinas")
        .select("empleado_id, rutina_id");

      if (errAsig) throw errAsig;

      // 3. Cargamos rutinas y tareas
      const { data: rutinas, error: errRut } = await supabase.from("rutinas")
        .select(`
          id,
          titulo,
          tareas_rutina (
            id,
            seccion,
            descripcion,
            orden
          )
        `);

      if (errRut) throw errRut;

      const mapaRutinas = {};
      rutinas?.forEach((r) => {
        mapaRutinas[r.id] = r;
      });

      // 4. Cargamos auditoría diaria de rutinas
      const { data: auditoriaDia, error: errAud } = await supabase
        .from("auditoria_diaria")
        .select("tarea_id, empleado_id")
        .eq("fecha", fechaSeleccionada);

      if (errAud) throw errAud;

      // 5. Cargamos tareas urgentes de la fecha seleccionada
      const { data: tareasUrgentesDia, error: errUrg } = await supabase
        .from("tareas_urgentes")
        .select("id, empleado_id, descripcion, completada")
        .eq("fecha", fechaSeleccionada);

      if (errUrg) throw errUrg;

      const reporteProcesado = empleados.map((emp) => {
        const rutinasDelEmpIds =
          asignaciones
            ?.filter((a) => a.empleado_id === emp.id)
            .map((a) => a.rutina_id) || [];
        const rutinasAsignadasDetalle = rutinasDelEmpIds
          .map((rutinaId) => mapaRutinas[rutinaId])
          .filter(Boolean);
        const hechasPorEmpIds =
          auditoriaDia
            ?.filter((a) => a.empleado_id === emp.id)
            .map((a) => a.tarea_id) || [];

        let totalAsignadas = 0;
        let cantidadHechas = 0;

        // Rutinas normales y sus tareas
        const rutinasConEstado = rutinasAsignadasDetalle.map((rutina) => {
          const tareasConEstado = (rutina.tareas_rutina || [])
            .sort((a, b) => a.orden - b.orden)
            .map((tarea) => {
              totalAsignadas++;
              const completada = hechasPorEmpIds.includes(tarea.id);
              if (completada) cantidadHechas++;
              return { ...tarea, completada };
            });

          return {
            ...rutina,
            tareas: tareasConEstado,
          };
        });

        // Tareas urgentes de este empleado en esta fecha
        const urgentesDelEmp =
          tareasUrgentesDia?.filter((u) => u.empleado_id === emp.id) || [];
        const urgentesConEstado = urgentesDelEmp.map((urg) => {
          totalAsignadas++;
          if (urg.completada) cantidadHechas++;
          return {
            id: urg.id,
            seccion: "⚠️ URGENTE",
            descripcion: urg.descripcion,
            completada: urg.completada,
            esUrgente: true,
          };
        });

        const porcentaje =
          totalAsignadas > 0
            ? Math.round((cantidadHechas / totalAsignadas) * 100)
            : 0;

        return {
          ...emp,
          totalAsignadas,
          cantidadHechas,
          porcentaje,
          rutinasConEstado,
          urgentesConEstado,
        };
      });

      setDatosAuditoriaEmpleados(reporteProcesado);
    } catch (err) {
      console.error("Error al calcular auditoría detallada:", err);
    } finally {
      setCargando(false);
    }
  }, [fechaSeleccionada]);

  useEffect(() => {
    queueMicrotask(cargarDatosAuditoria);
  }, [cargarDatosAuditoria]);

  const toggleDesplegar = (empleadoId) => {
    setDesplegados((prev) => ({
      ...prev,
      [empleadoId]: !prev[empleadoId],
    }));
  };

  // Función para que el admin elimine una tarea urgente enviada
  const eliminarTareaUrgente = async (urgenteId) => {
    if (!confirm("¿Estás seguro de eliminar esta tarea urgente?")) return;

    try {
      const { error } = await supabase
        .from("tareas_urgentes")
        .delete()
        .eq("id", urgenteId);

      if (error) throw error;
      cargarDatosAuditoria(); // Recargamos los datos para actualizar la vista
    } catch (err) {
      console.error("Error al eliminar tarea urgente:", err);
      alert("No se pudo eliminar la tarea urgente.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera del Módulo y Selector de Fecha */}
      <div className="bg-white p-6 rounded-xl shadow flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">
            Calendario Operativo y Auditoría
          </h2>
          <p className="text-sm text-gray-500">
            Revisa el cumplimiento de tareas y urgencias del equipo por día.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="audit-date" className="text-sm font-medium text-gray-600">
            Seleccionar fecha:
          </label>
          <input
            id="audit-date"
            type="date"
            value={fechaSeleccionada}
            onChange={(e) => setFechaSeleccionada(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 font-medium text-gray-700 bg-gray-50"
          />
        </div>
      </div>

      {/* Reporte por Empleado */}
      {cargando ? (
        <div className="bg-white p-12 rounded-xl shadow text-center text-gray-400">
          Cargando registros...
        </div>
      ) : (
        <div className="space-y-4">
          {datosAuditoriaEmpleados.map((emp) => {
            const estaAbierto = desplegados[emp.id];
            return (
              <div
                key={emp.id}
                className="bg-white p-6 rounded-xl shadow border border-gray-100 space-y-4"
              >
                {/* Tarjeta principal (Resumen) */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 capitalize">
                      {emp.nombre}
                    </h3>
                    <span className="text-xs uppercase bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                      {emp.rol}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right">
                      <span className="text-xs text-gray-400 block">
                        Realizadas
                      </span>
                      <span className="font-bold text-gray-700">
                        {emp.cantidadHechas} de {emp.totalAsignadas}
                      </span>
                    </div>

                    <div
                      className={`px-3 py-1.5 rounded-lg font-bold text-sm ${
                        emp.porcentaje === 100 && emp.totalAsignadas > 0
                          ? "bg-green-100 text-green-700"
                          : emp.porcentaje > 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {emp.porcentaje}% completado
                    </div>
                  </div>
                </div>

                {/* Barra de progreso visual */}
                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      emp.porcentaje === 100 && emp.totalAsignadas > 0
                        ? "bg-green-500"
                        : "bg-blue-600"
                    }`}
                    style={{ width: `${emp.porcentaje}%` }}
                  ></div>
                </div>

                {/* Botón para desplegar / ocultar el detalle */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => toggleDesplegar(emp.id)}
                    aria-expanded={Boolean(estaAbierto)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {estaAbierto
                      ? "Ocultar detalle de tareas ▲"
                      : "Ver detalle de tareas ▼"}
                  </button>
                </div>

                {/* DESGLOSE DESPLEGABLE */}
                {estaAbierto && (
                  <div className="space-y-4 pt-4 border-t border-gray-100 transition-all">
                    {/* 1. SECCIÓN DE TAREAS URGENTES (Si tiene en esta fecha) */}
                    {emp.urgentesConEstado &&
                      emp.urgentesConEstado.length > 0 && (
                        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
                          <h5 className="font-bold text-amber-900 text-sm border-b border-amber-200 pb-2 flex justify-between items-center">
                            <span>🚨 Tareas Urgentes / Extraordinarias</span>
                            <span className="text-xs font-normal text-amber-700">
                              {
                                emp.urgentesConEstado.filter(
                                  (t) => t.completada,
                                ).length
                              }{" "}
                              / {emp.urgentesConEstado.length} completadas
                            </span>
                          </h5>

                          <div className="space-y-2">
                            {emp.urgentesConEstado.map((urg) => (
                              <div
                                key={urg.id}
                                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs sm:text-sm ${
                                  urg.completada
                                    ? "bg-green-50 border-green-200 text-green-900"
                                    : "bg-white border-amber-300 text-amber-950"
                                }`}
                              >
                                <div className="pr-3">
                                  <span
                                    className={
                                      urg.completada
                                        ? "line-through font-medium text-green-800"
                                        : "text-gray-800 font-medium"
                                    }
                                  >
                                    {urg.descripcion}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-semibold ${
                                      urg.completada
                                        ? "bg-green-100 text-green-700"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {urg.completada
                                      ? "Completado ✓"
                                      : "Pendiente ⏳"}
                                  </span>

                                  {/* Botón para que el admin elimine esta urgencia */}
                                  <button
                                    onClick={() => eliminarTareaUrgente(urg.id)}
                                    className="text-red-400 hover:text-red-600 font-bold p-1 transition-colors"
                                    aria-label={`Eliminar tarea urgente: ${urg.descripcion}`}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* 2. RUTINAS ASIGNADAS */}
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Desglose de Rutinas Asignadas:
                    </h4>

                    {emp.rutinasConEstado && emp.rutinasConEstado.length > 0 ? (
                      emp.rutinasConEstado.map((rutina) => (
                        <div
                          key={rutina.id}
                          className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3"
                        >
                          <h5 className="font-bold text-gray-800 text-sm border-b pb-2 flex justify-between items-center">
                            <span>{rutina.titulo}</span>
                            <span className="text-xs font-normal text-gray-500">
                              {rutina.tareas.filter((t) => t.completada).length}{" "}
                              / {rutina.tareas.length} completadas
                            </span>
                          </h5>

                          <div className="space-y-2">
                            {rutina.tareas.map((tarea) => (
                              <div
                                key={tarea.id}
                                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs sm:text-sm ${
                                  tarea.completada
                                    ? "bg-green-50 border-green-200 text-green-900"
                                    : "bg-white border-gray-200 text-gray-500"
                                }`}
                              >
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider block text-gray-400">
                                    {tarea.seccion}
                                  </span>
                                  <span
                                    className={
                                      tarea.completada
                                        ? "line-through font-medium text-green-800"
                                        : "text-gray-700"
                                    }
                                  >
                                    {tarea.descripcion}
                                  </span>
                                </div>

                                <div
                                  className={`px-2 py-1 rounded text-xs font-semibold ${
                                    tarea.completada
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-400"
                                  }`}
                                >
                                  {tarea.completada
                                    ? "Completado ✓"
                                    : "Pendiente ⏳"}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 italic py-2">
                        Este empleado no tiene rutinas asignadas.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
