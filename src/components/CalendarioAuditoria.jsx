import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { useBusinessDate } from "../hooks/useBusinessDate";
import { currentBusinessDate } from "../utils/businessDate";
import ConfirmationDialog from "./ConfirmationDialog";

const PAGE_SIZE = 500;

// Date-bounded queries still paginate: Supabase may cap each response.
async function readPages(createQuery, signal) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await createQuery()
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1)
      .abortSignal(signal);
    if (error) throw error;
    if (signal.aborted) return [];
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function shiftMonth(month, amount) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function displayDate(date) {
  return date.split("-").reverse().join("/");
}

function groupRecords(audits, urgentTasks, assignments, auditsAvailable = true) {
  const employees = new Map();
  const add = (record, task) => {
    if (!employees.has(record.empleado_id)) {
      employees.set(record.empleado_id, {
        id: record.empleado_id,
        nombre: record.empleados?.nombre || "Integrante sin nombre disponible",
        tasks: [],
      });
    }
    employees.get(record.empleado_id).tasks.push(task);
  };
  const auditMap = new Map(audits.map((record) => [`${record.empleado_id}:${record.tarea_id}`, record]));
  const includedAudits = new Set();
  assignments.forEach((assignment) => {
    const routine = assignment.rutinas;
    const ids = assignment.tarea_ids || [];
    ids.forEach((id) => {
      const key = `${assignment.empleado_id}:${id}`;
      const audit = auditMap.get(key);
      if (audit) includedAudits.add(audit.id);
      const task = routine?.tareas_rutina?.find((item) => item.id === id) || audit?.tareas_rutina;
      const completed = Boolean(audit && !audit.anulada_en);
      const cancelled = Boolean(assignment.cancelada_en);
      add(assignment, {
        id: `assignment-${assignment.id}-${id}`,
        description: task?.descripcion || "Tarea sin descripción disponible",
        routine: routine?.titulo || "Rutina asignada",
        section: task?.seccion,
        status: cancelled ? (completed ? "Asignación cancelada · Completado" : "Asignación cancelada") : !auditsAvailable ? "Estado sin verificar" : completed ? "Completado ✓" : "Pendiente ⏳",
        completed: completed && !cancelled,
        inactive: cancelled, counted: auditsAvailable,
      });
    });
    if (ids.length === 0) add(assignment, {
      id: `assignment-${assignment.id}`,
      description: "Esta rutina no tenía tareas al asignarse.",
      routine: routine?.titulo || "Rutina asignada",
      status: assignment.cancelada_en ? "Asignación cancelada" : "Sin tareas",
      completed: false, inactive: Boolean(assignment.cancelada_en), counted: false,
    });
  });
  // Older completions remain visible even without a dated assignment record.
  audits.filter((record) => !includedAudits.has(record.id)).forEach((record) => add(record, {
    id: `audit-${record.id}`,
    description: record.tareas_rutina?.descripcion || "Tarea sin descripción disponible",
    routine: record.tareas_rutina?.rutinas?.titulo || "Rutina",
    section: record.tareas_rutina?.seccion,
    status: record.anulada_en ? "Anulado" : "Completado ✓",
    completed: !record.anulada_en,
    inactive: Boolean(record.anulada_en),
  }));
  urgentTasks.forEach((record) => add(record, {
    id: `urgent-${record.id}`,
    urgentId: record.id,
    date: record.fecha,
    description: record.descripcion,
    routine: "Tareas Urgentes / Extraordinarias",
    status: record.cancelada_en ? "Cancelada" : record.completada ? "Completado ✓" : "Pendiente ⏳",
    completed: !record.cancelada_en && record.completada,
    inactive: Boolean(record.cancelada_en),
  }));
  return [...employees.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export default function CalendarioAuditoria({ onAssign }) {
  const today = useBusinessDate();
  // null follows Argentina's current day; an explicit selection stays historical.
  const [selectedDate, setSelectedDate] = useState(null);
  const date = selectedDate || today;
  const month = date.slice(0, 7);
  const [monthResult, setMonthResult] = useState({ month: "", dates: [], loading: true, error: false });
  const [dayResult, setDayResult] = useState({ date: "", employees: [], loading: true, error: false });
  const [expanded, setExpanded] = useState({});
  const [reload, setReload] = useState(0);
  const [cancelling, setCancelling] = useState("");
  const [actionError, setActionError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const first = `${month}-01`;
        const next = `${shiftMonth(month, 1)}-01`;
        const results = await Promise.allSettled([
          readPages(() => supabase.from("auditoria_diaria").select("id,fecha").gte("fecha", first).lt("fecha", next), controller.signal),
          readPages(() => supabase.from("tareas_urgentes").select("id,fecha").gte("fecha", first).lt("fecha", next), controller.signal),
          readPages(() => supabase.from("asignaciones_diarias").select("id,fecha").gte("fecha", first).lt("fecha", next), controller.signal),
        ]);
        const failed = results.filter((result) => result.status === "rejected").length;
        const rows = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
        if (!controller.signal.aborted) setMonthResult({ month, dates: [...new Set(rows.map((r) => r.fecha))], loading: false, error: failed === results.length, partial: failed > 0 && failed < results.length });
      } catch {
        if (!controller.signal.aborted) setMonthResult({ month, dates: [], loading: false, error: true });
      }
    }
    queueMicrotask(load);
    return () => controller.abort();
  }, [month, today, reload]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const results = await Promise.allSettled([
          readPages(() => supabase.from("auditoria_diaria")
            .select("id,tarea_id,empleado_id,anulada_en,empleados(id,nombre,rol),tareas_rutina(id,seccion,descripcion,rutinas(id,titulo))")
            .eq("fecha", date), controller.signal),
          readPages(() => supabase.from("tareas_urgentes")
            .select("id,fecha,empleado_id,descripcion,completada,cancelada_en,empleados(id,nombre,rol)")
            .eq("fecha", date), controller.signal),
          readPages(() => supabase.from("asignaciones_diarias")
            .select("id,empleado_id,rutina_id,fecha,cancelada_en,tarea_ids,empleados(id,nombre),rutinas(id,titulo,tareas_rutina(id,seccion,descripcion,orden))")
            .eq("fecha", date), controller.signal),
        ]);
        const failed = results.filter((result) => result.status === "rejected").length;
        const [audits, urgentTasks, assignments] = results.map((result) => result.status === "fulfilled" ? result.value : []);
        if (!controller.signal.aborted) setDayResult({ date, employees: groupRecords(audits, urgentTasks, assignments, results[0].status === "fulfilled"), loading: false, error: failed === results.length, partial: failed > 0 && failed < results.length });
      } catch {
        if (!controller.signal.aborted) setDayResult({ date, employees: [], loading: false, error: true });
      }
    }
    queueMicrotask(load);
    return () => controller.abort();
  }, [date, reload]);

  const selectDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setSelectedDate(value === today ? null : value);
    setConfirmation(null);
    setActionError("");
    setActionSuccess(null);
  };
  const canCancel = (task) => date === today && date === currentBusinessDate() && task.date === date && task.urgentId && !task.inactive && !task.completed;
  const requestCancellation = (task) => {
    if (!canCancel(task)) return;
    setActionError("");
    setActionSuccess(null);
    setConfirmation({ task, date, today });
  };
  const cancelUrgentTask = async () => {
    if (!confirmation || confirmation.date !== date || confirmation.today !== today || !canCancel(confirmation.task) || cancelling) {
      setConfirmation(null);
      return;
    }
    const id = confirmation.task.urgentId;
    setCancelling(id);
    setActionError("");
    try {
      const { error } = await supabase.rpc("cancel_urgent_task", { p_urgent_id: id });
      if (error) throw error;
      setConfirmation(null);
      setActionSuccess({ date, message: "Tarea cancelada. El registro se conserva en la auditoría." });
      setDayResult((previous) => ({ ...previous, loading: true }));
      setReload((value) => value + 1);
    } catch {
      setActionError("No se pudo cancelar la tarea urgente. Volvé a intentarlo.");
    } finally {
      setCancelling("");
    }
  };

  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthTitle = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const monthReady = monthResult.month === month && !monthResult.loading;
  const dayReady = dayResult.date === date && !dayResult.loading;

  return (
    <div className="audit-view">
      <div className="audit-header">
        <div>
          <h2 className="text-xl font-bold">Calendario Operativo y Auditoría</h2>
          <p>Revisá las tareas y el cumplimiento registrados para cada día.</p>
        </div>
        {date === today && onAssign && <button className="button button--primary" onClick={onAssign}>Asignar tareas de hoy</button>}
      </div>

      <div className="audit-workspace">
      <section className="audit-calendar" aria-label="Calendario de asignaciones">
        <div className="audit-calendar-heading">
          <h3>Elegí un día</h3>
          <button className="button button--secondary" onClick={() => selectDate(today)}>Hoy</button>
        </div>
        <div className="audit-calendar-nav">
          <button className="button button--secondary" aria-label="Mes anterior" onClick={() => selectDate(`${shiftMonth(month, -1)}-01`)}>‹</button>
          <h3>{monthTitle}</h3>
          <button className="button button--secondary" aria-label="Mes siguiente" onClick={() => selectDate(`${shiftMonth(month, 1)}-01`)}>›</button>
        </div>
        <div className="audit-calendar-grid">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <span className="audit-weekday" key={day} aria-hidden="true">{day}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
          {Array.from({ length: days }, (_, index) => {
            const day = `${month}-${String(index + 1).padStart(2, "0")}`;
            const hasAssignments = monthReady && !monthResult.error && monthResult.dates.includes(day);
            const label = !monthReady || monthResult.error ? "asignaciones sin verificar" : hasAssignments ? "con asignaciones" : monthResult.partial ? "asignaciones sin verificar" : "sin asignaciones";
            return (
              <button key={day} className="audit-calendar-day" data-date={day} aria-label={`${displayDate(day)}, ${label}`} aria-pressed={date === day} aria-current={day === today ? "date" : undefined} onClick={() => selectDate(day)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {hasAssignments && <span className="audit-assignment-dot" data-testid="audit-assignment-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <p className="audit-calendar-legend"><span className="audit-assignment-dot" aria-hidden="true" /> Tareas asignadas o cumplimiento registrado</p>
        {!monthReady && <p role="status">Cargando indicadores...</p>}
        {monthReady && monthResult.partial && <p role="alert">Algunos indicadores no se pudieron cargar. Se muestran las fechas verificadas. <button className="button button--secondary" onClick={() => setReload((value) => value + 1)}>Reintentar</button></p>}
        {monthReady && monthResult.error && <p role="alert">No se pudieron cargar los indicadores. <button className="button button--secondary" onClick={() => setReload((value) => value + 1)}>Reintentar</button></p>}
      </section>

      <section className="audit-results" aria-label={`Auditoría del ${displayDate(date)}`} aria-busy={!dayReady}>
        <h3 className="text-lg font-bold">Registros del {displayDate(date)}</h3>
        <p className="audit-explanation">Las asignaciones y los estados corresponden únicamente a la fecha elegida.</p>
        {date !== today && <p className="audit-history-note">Consulta histórica · Los registros se conservan sin cambios.</p>}
        {actionSuccess?.date === date && <p className="audit-action-success" role="status">{actionSuccess.message}</p>}
        {dayReady && dayResult.partial && <p role="alert">No se pudieron cargar todos los registros. Se muestran los disponibles. <button className="button button--secondary" onClick={() => setReload((value) => value + 1)}>Reintentar</button></p>}
        {!dayReady ? <p role="status">Cargando registros...</p> : dayResult.error ? (
          <p role="alert">No se pudieron cargar los registros. Revisá tu conexión y los permisos de acceso. <button className="button button--secondary" onClick={() => setReload((value) => value + 1)}>Reintentar</button></p>
        ) : dayResult.employees.length === 0 ? <p className="audit-empty">{dayResult.partial ? "No hay registros disponibles en las fuentes que se pudieron consultar." : "No hay tareas asignadas ni cumplimiento registrado para esta fecha."}</p> : dayResult.employees.map((employee) => {
          const completed = employee.tasks.filter((task) => task.completed).length;
          const active = employee.tasks.filter((task) => !task.inactive && task.counted !== false).length;
          return (
            <article key={employee.id} className="audit-employee">
              <div className="audit-employee-summary">
                <h3 className="text-lg font-bold">{employee.nombre}</h3>
                <span>{dayResult.partial ? "Resumen parcial · Revisá los estados disponibles" : `Realizadas: ${completed} de ${active}`}</span>
                <button className="button button--secondary" aria-expanded={Boolean(expanded[employee.id])} onClick={() => setExpanded((previous) => ({ ...previous, [employee.id]: !previous[employee.id] }))}>
                  {expanded[employee.id] ? "Ocultar detalle de tareas ▲" : "Ver detalle de tareas ▼"}
                </button>
              </div>
              {expanded[employee.id] && <ul className="audit-task-list">{employee.tasks.map((task) => (
                <li key={task.id} className="audit-task">
                  <div><p className="audit-task-context">{task.routine}{task.section ? ` · ${task.section}` : ""}</p><p>{task.description}</p></div>
                  <span className={`audit-task-status ${task.inactive ? "audit-task-status--inactive" : task.completed ? "audit-task-status--complete" : "audit-task-status--pending"}`}>{task.status}</span>
                  {canCancel(task) && <button className="button button--danger" disabled={Boolean(cancelling)} aria-label={`Cancelar tarea urgente: ${task.description}`} onClick={() => requestCancellation(task)}>{cancelling === task.urgentId ? "Cancelando..." : "Cancelar"}</button>}
                </li>
              ))}</ul>}
            </article>
          );
        })}
      </section>
      </div>
      {confirmation && confirmation.date === date && confirmation.today === today && date === today && (
        <ConfirmationDialog title="¿Cancelar esta tarea urgente?" confirmLabel="Cancelar tarea" busy={Boolean(cancelling)} error={actionError} onConfirm={cancelUrgentTask} onDismiss={() => setConfirmation(null)}>
          <p className="audit-confirmation-task">{confirmation.task.description}</p>
          <p>Dejará de estar pendiente. El registro se conservará en la auditoría de hoy.</p>
        </ConfirmationDialog>
      )}
    </div>
  );
}
