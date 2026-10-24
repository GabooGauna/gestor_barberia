import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { useBusinessDate } from "../hooks/useBusinessDate";
import { currentBusinessDate } from "../utils/businessDate";
import { useAuth } from "../hooks/useAuth";

export default function AsignarRutinas() {
  const { profile } = useAuth();
  const today = useBusinessDate();
  const [catalog, setCatalog] = useState({ employees: [], routines: [], loading: true, error: false });
  const [employeeId, setEmployeeId] = useState("");
  const [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState({ key: "", ids: [], error: false, message: "" });
  const [saving, setSaving] = useState(false);
  const key = `${employeeId}:${today}:${retry}`;
  const ready = selection.key === key;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [employees, routines] = await Promise.all([
          supabase.from("empleados").select("id,nombre,rol").eq("activo", true).order("nombre").abortSignal(controller.signal),
          supabase.from("rutinas").select("id,titulo,orden").is("archivada_en", null).order("orden", { nullsFirst: false }).order("titulo").order("id").abortSignal(controller.signal),
        ]);
        if (employees.error || routines.error) throw new Error("catalog_unavailable");
        if (!controller.signal.aborted) setCatalog({ employees: employees.data || [], routines: routines.data || [], loading: false, error: false });
      } catch {
        if (!controller.signal.aborted) setCatalog({ employees: [], routines: [], loading: false, error: true });
      }
    }
    load();
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!employeeId) return;
    const controller = new AbortController();
    async function load() {
      const { data, error } = await supabase.from("asignaciones_diarias")
        .select("rutina_id").eq("empleado_id", employeeId).eq("fecha", today)
        .is("cancelada_en", null).abortSignal(controller.signal);
      if (!controller.signal.aborted) setSelection({ key, ids: error ? [] : (data || []).map((row) => row.rutina_id), error: Boolean(error), message: "" });
    }
    load();
    return () => controller.abort();
  }, [employeeId, today, key]);

  async function toggleRoutine(routineId) {
    if (!ready || selection.error || saving || today !== currentBusinessDate()) return;
    const assigned = selection.ids.includes(routineId);
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_daily_routine_assignment", {
        p_empleado_id: employeeId, p_rutina_id: routineId, p_assigned: !assigned, p_fecha: today,
      });
      if (error) throw error;
      if (today !== currentBusinessDate()) return;
      setSelection((previous) => previous.key !== key ? previous : {
        ...previous,
        ids: assigned ? previous.ids.filter((id) => id !== routineId) : [...previous.ids, routineId],
        message: "Asignaciones de hoy guardadas.",
      });
    } catch {
      setSelection((previous) => previous.key !== key ? previous : { ...previous, message: "No se pudo guardar. Volvé a intentarlo." });
    } finally {
      setSaving(false);
    }
  }

  const employee = catalog.employees.find((person) => person.id === employeeId);
  return (
    <section className="daily-assignments surface-panel p-6 space-y-6" aria-label="Asignaciones diarias">
      <div>
        <h3 className="text-xl font-bold">Asignaciones del día</h3>
        <p className="text-sm text-gray-500 mt-1">{today.split("-").reverse().join("/")} · Elegí las rutinas que debe realizar cada integrante hoy.</p>
        <p className="text-sm text-gray-500 mt-1">Cada día empieza sin asignaciones. Las plantillas y el historial se conservan.</p>
      </div>
      {catalog.loading ? <p role="status">Cargando equipo y rutinas…</p> : catalog.error ? (
        <div role="alert">No se pudieron cargar el equipo y las rutinas. <button className="button button--secondary" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></div>
      ) : <>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Elegí un integrante</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {catalog.employees.map((person) => (
              <button type="button" key={person.id} aria-pressed={person.id === employeeId} disabled={saving}
                onClick={() => setEmployeeId(person.id)}
                className={`choice-card p-3 text-left rounded-xl border-2 ${person.id === employeeId ? "bg-blue-50 border-blue-500 text-blue-900" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
                <span className="block font-semibold">{person.nombre}{person.id === profile?.id ? " (vos)" : ""}</span>
                <span className="text-xs">{person.rol === "admin" ? "Administración" : "Empleado"}</span>
              </button>
            ))}
          </div>
          {catalog.employees.length === 0 && <p>No hay integrantes activos.</p>}
        </div>
        {!employeeId ? <p className="text-sm text-gray-500">Seleccioná un integrante para asignar sus rutinas de hoy.</p> : !ready ? <p role="status">Cargando asignaciones de hoy…</p> : selection.error ? (
          <div role="alert">No se pudieron consultar las asignaciones. <button className="button button--secondary" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></div>
        ) : <div className="space-y-3">
          <h4 className="font-semibold">Rutinas de hoy para {employee?.nombre}</h4>
          {selection.ids.length === 0 && <p className="text-sm text-gray-500">Sin rutinas asignadas para hoy.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {catalog.routines.map((routine) => {
              const assigned = selection.ids.includes(routine.id);
              return <button type="button" key={routine.id} aria-pressed={assigned} disabled={saving}
                onClick={() => toggleRoutine(routine.id)}
                className={`choice-card w-full text-left flex items-center justify-between p-4 rounded-xl border-2 ${assigned ? "bg-blue-50 border-blue-400 text-blue-900" : "bg-white border-gray-200 text-gray-600"}`}>
                <span>{routine.titulo}</span><span aria-hidden="true">{assigned ? "✓" : "+"}</span>
              </button>;
            })}
          </div>
          {catalog.routines.length === 0 && <p>No hay rutinas disponibles. Creá una plantilla para comenzar.</p>}
          {saving && <p role="status">Guardando asignación…</p>}
          {selection.message && <p role={selection.message.startsWith("No se") ? "alert" : "status"}>{selection.message}</p>}
        </div>}
      </>}
    </section>
  );
}
