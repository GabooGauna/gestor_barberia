import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { useBusinessDate } from "../hooks/useBusinessDate";

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

function groupRecords(audits, urgentTasks) {
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
  audits.forEach((record) => add(record, {
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
    description: record.descripcion,
    routine: "Tareas Urgentes / Extraordinarias",
    status: record.cancelada_en ? "Cancelada" : record.completada ? "Completado ✓" : "Pendiente ⏳",
    completed: !record.cancelada_en && record.completada,
    inactive: Boolean(record.cancelada_en),
  }));
  return [...employees.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export default function CalendarioAuditoria() {
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

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const first = `${month}-01`;
        const next = `${shiftMonth(month, 1)}-01`;
        const [audits, urgentTasks] = await Promise.all([
          readPages(() => supabase.from("auditoria_diaria").select("id,fecha").gte("fecha", first).lt("fecha", next), controller.signal),
          readPages(() => supabase.from("tareas_urgentes").select("id,fecha").gte("fecha", first).lt("fecha", next), controller.signal),
        ]);
        if (!controller.signal.aborted) setMonthResult({ month, dates: [...new Set([...audits, ...urgentTasks].map((r) => r.fecha))], loading: false, error: false });
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
        const [audits, urgentTasks] = await Promise.all([
          readPages(() => supabase.from("auditoria_diaria")
            .select("id,tarea_id,empleado_id,anulada_en,empleados(id,nombre,rol),tareas_rutina(id,seccion,descripcion,rutinas(id,titulo))")
            .eq("fecha", date), controller.signal),
          readPages(() => supabase.from("tareas_urgentes")
            .select("id,empleado_id,descripcion,completada,cancelada_en,empleados(id,nombre,rol)")
            .eq("fecha", date), controller.signal),
        ]);
        if (!controller.signal.aborted) setDayResult({ date, employees: groupRecords(audits, urgentTasks), loading: false, error: false });
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
    setActionError("");
  };
  const cancelUrgentTask = async (id) => {
    if (!confirm("¿Cancelar esta tarea urgente? El registro se conservará en la auditoría.")) return;
    setCancelling(id);
    setActionError("");
    try {
      const { error } = await supabase.rpc("cancel_urgent_task", { p_urgent_id: id });
      if (error) throw error;
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
        <div className="audit-date-control">
          <label htmlFor="audit-date">Seleccionar fecha:</label>
          <input id="audit-date" type="date" value={date} onChange={(event) => selectDate(event.target.value)} />
          <button className="button button--secondary" onClick={() => selectDate(today)}>Hoy</button>
        </div>
      </div>

      <section className="audit-calendar" aria-label="Calendario de asignaciones">
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
            const label = !monthReady || monthResult.error ? "asignaciones sin verificar" : hasAssignments ? "con asignaciones" : "sin asignaciones";
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
        {monthReady && monthResult.error && <p role="alert">No se pudieron cargar los indicadores. <button className="button button--secondary" onClick={() => setReload((value) => value + 1)}>Reintentar</button></p>}
      </section>

      <section className="audit-results" aria-label={`Auditoría del ${displayDate(date)}`} aria-busy={!dayReady}>
        <h3 className="text-lg font-bold">Registros del {displayDate(date)}</h3>
        <p className="audit-explanation">Las rutinas permanentes aparecen cuando tienen cumplimiento registrado ese día.</p>
        {actionError && <p role="alert">{actionError}</p>}
        {!dayReady ? <p role="status">Cargando registros...</p> : dayResult.error ? (
          <p role="alert">No se pudieron cargar los registros. Revisá tu conexión y los permisos de acceso. <button className="button button--secondary" onClick={() => setReload((value) => value + 1)}>Reintentar</button></p>
        ) : dayResult.employees.length === 0 ? <p className="audit-empty">No hay tareas asignadas ni cumplimiento registrado para esta fecha.</p> : dayResult.employees.map((employee) => {
          const completed = employee.tasks.filter((task) => task.completed).length;
          const active = employee.tasks.filter((task) => !task.inactive).length;
          return (
            <article key={employee.id} className="audit-employee">
              <div className="audit-employee-summary">
                <h3 className="text-lg font-bold">{employee.nombre}</h3>
                <span>Realizadas: {completed} de {active}</span>
                <button className="button button--secondary" aria-expanded={Boolean(expanded[employee.id])} onClick={() => setExpanded((previous) => ({ ...previous, [employee.id]: !previous[employee.id] }))}>
                  {expanded[employee.id] ? "Ocultar detalle de tareas ▲" : "Ver detalle de tareas ▼"}
                </button>
              </div>
              {expanded[employee.id] && <ul className="audit-task-list">{employee.tasks.map((task) => (
                <li key={task.id} className="audit-task">
                  <div><p className="audit-task-context">{task.routine}{task.section ? ` · ${task.section}` : ""}</p><p>{task.description}</p></div>
                  <span className={`audit-task-status ${task.inactive ? "audit-task-status--inactive" : task.completed ? "audit-task-status--complete" : "audit-task-status--pending"}`}>{task.status}</span>
                  {task.urgentId && !task.inactive && <button className="button button--danger" disabled={Boolean(cancelling)} aria-label={`Cancelar tarea urgente: ${task.description}`} onClick={() => cancelUrgentTask(task.urgentId)}>{cancelling === task.urgentId ? "Cancelando..." : "Cancelar"}</button>}
                </li>
              ))}</ul>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
