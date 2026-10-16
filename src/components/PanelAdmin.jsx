// src/components/PanelAdmin.jsx
import { useState, useEffect } from "react";
import { supabase } from "../services/supabase";
import CalendarioAuditoria from "./CalendarioAuditoria";
import RegistroEmpleados from "./RegistroEmpleados"; // <-- Importamos nuestro componente modular
import AsignarRutinas from "./AsignarRutinas";
import EnviarTareaUrgente from "./EnviarTareaUrgente";
import {
  DEFAULT_ROUTINE_COLOR,
  ROUTINE_COLORS_ENABLED,
  ROUTINE_COLOR_OPTIONS,
  normalizeRoutineColor,
  routineColorClass,
} from "../utils/coloresRutina";

function RoutineColorPicker({ name, value, onChange, disabled = false }) {
  return (
    <fieldset className="routine-color-picker" disabled={disabled}>
      <legend className="sr-only">Color de identificación</legend>
      <span aria-hidden="true">Color de identificación</span>
      <div className="routine-color-options">
        {ROUTINE_COLOR_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={`routine-color-option routine-accent--${option.id}`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <span className="routine-color-dot" aria-hidden="true" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function PanelAdmin() {
  const [vistaActiva, setVistaActiva] = useState("plantillas"); // 'plantillas', 'empleados', o 'auditoria'

  // Estados del Creador de Plantillas
  const [rutinas, setRutinas] = useState([]);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [nuevoColor, setNuevoColor] = useState(DEFAULT_ROUTINE_COLOR);
  const [rutinaSeleccionada, setRutinaSeleccionada] = useState(null);
  const [nuevaSeccion, setNuevaSeccion] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [cargandoRutinas, setCargandoRutinas] = useState(true);
  const [cargandoEmpleados, setCargandoEmpleados] = useState(true);
  const [accionPendiente, setAccionPendiente] = useState("");
  const [mensajeRutinas, setMensajeRutinas] = useState("");

  // Estados para listar y administrar empleados existentes
  const [empleados, setEmpleados] = useState([]);

  const secciones = [
    ["plantillas", "Plantillas", "Protocolos base"],
    ["empleados", "Equipo", "Perfiles y roles"],
    ["asignar", "Asignaciones", "Rutinas por persona"],
    ["urgentes", "Urgencias", "Trabajo extraordinario"],
    ["auditoria", "Auditoría", "Cumplimiento diario"],
  ];

  const cargarRutinas = async ({ mostrarCarga = true } = {}) => {
    try {
      if (mostrarCarga) setCargandoRutinas(true);
      const selection = ROUTINE_COLORS_ENABLED
        ? `
          id,
          titulo,
          color,
          tareas_rutina (
            id,
            seccion,
            descripcion,
            orden
          )
        `
        : `
          id,
          titulo,
          tareas_rutina (
            id,
            seccion,
            descripcion,
            orden
          )
        `;
      const { data, error } = await supabase
        .from("rutinas")
        .select(selection)
        .order("titulo", { ascending: true });

      if (error) throw error;
      const rutinasNormalizadas = (data || []).map((rutina) => ({
        ...rutina,
        color: ROUTINE_COLORS_ENABLED
          ? normalizeRoutineColor(rutina.color)
          : DEFAULT_ROUTINE_COLOR,
      }));
      setRutinas(rutinasNormalizadas);
      setRutinaSeleccionada((seleccionada) =>
        seleccionada
          ? rutinasNormalizadas.find(({ id }) => id === seleccionada.id) || null
          : null,
      );
      return rutinasNormalizadas;
    } catch (err) {
      console.error("Error al cargar rutinas:", err);
      setMensajeRutinas("No se pudieron cargar las rutinas. Intenta nuevamente.");
      return [];
    } finally {
      if (mostrarCarga) setCargandoRutinas(false);
    }
  };

  const cargarEmpleados = async () => {
    try {
      setCargandoEmpleados(true);
      const { data, error } = await supabase
        .from("empleados")
        .select("id, nombre, rol")
        .order("nombre", { ascending: true });

      if (error) throw error;
      setEmpleados(data || []);
    } catch (err) {
      console.error("Error al cargar empleados:", err);
    } finally {
      setCargandoEmpleados(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      cargarRutinas();
      cargarEmpleados();
    });
  }, []);

  const crearRutina = async (e) => {
    e.preventDefault();
    if (!nuevoTitulo.trim()) return;

    try {
      setAccionPendiente("crear-rutina");
      setMensajeRutinas("");
      const nuevaRutina = { titulo: nuevoTitulo.trim() };
      if (ROUTINE_COLORS_ENABLED) nuevaRutina.color = nuevoColor;
      const { error } = await supabase
        .from("rutinas")
        .insert([nuevaRutina]);

      if (error) throw error;

      setNuevoTitulo("");
      setNuevoColor(DEFAULT_ROUTINE_COLOR);
      setMensajeRutinas("Rutina creada.");
      await cargarRutinas({ mostrarCarga: false });
    } catch (err) {
      console.error("Error al crear rutina:", err);
      alert("No se pudo crear la rutina.");
    } finally {
      setAccionPendiente("");
    }
  };

  const eliminarRutina = async (rutinaId, e) => {
    e.stopPropagation();
    if (
      !confirm(
        "¿Estás seguro de eliminar esta rutina completa y todas sus tareas?",
      )
    )
      return;

    try {
      const { error } = await supabase
        .from("rutinas")
        .delete()
        .eq("id", rutinaId);

      if (error) throw error;

      if (rutinaSeleccionada?.id === rutinaId) {
        setRutinaSeleccionada(null);
      }

      await cargarRutinas({ mostrarCarga: false });
    } catch (err) {
      console.error("Error al eliminar la rutina:", err);
      alert("No se pudo eliminar la rutina.");
    }
  };

  const agregarTarea = async (e) => {
    e.preventDefault();
    if (!nuevaSeccion.trim() || !nuevaDescripcion.trim() || !rutinaSeleccionada)
      return;

    try {
      setAccionPendiente("agregar-tarea");
      const ordenSiguiente = rutinaSeleccionada.tareas_rutina.length + 1;

      const { error } = await supabase.from("tareas_rutina").insert([
        {
          rutina_id: rutinaSeleccionada.id,
          seccion: nuevaSeccion,
          descripcion: nuevaDescripcion,
          orden: ordenSiguiente,
        },
      ]);

      if (error) throw error;

      setNuevaSeccion("");
      setNuevaDescripcion("");

      const rutinasActualizadas = await cargarRutinas({ mostrarCarga: false });
      setRutinaSeleccionada(
        rutinasActualizadas.find(({ id }) => id === rutinaSeleccionada.id) || null,
      );
    } catch (err) {
      console.error("Error al agregar tarea:", err);
      alert("No se pudo agregar la tarea.");
    } finally {
      setAccionPendiente("");
    }
  };

  const eliminarTarea = async (tareaId) => {
    if (!confirm("¿Estás seguro de eliminar esta tarea?")) return;

    try {
      const { error } = await supabase
        .from("tareas_rutina")
        .delete()
        .eq("id", tareaId);

      if (error) throw error;

      const rutinasActualizadas = await cargarRutinas({ mostrarCarga: false });
      setRutinaSeleccionada(
        rutinasActualizadas.find(({ id }) => id === rutinaSeleccionada.id) || null,
      );
    } catch (err) {
      console.error("Error al eliminar la tarea:", err);
      alert("No se pudo eliminar la tarea.");
    }
  };

  const actualizarColorRutina = async (color) => {
    if (!ROUTINE_COLORS_ENABLED || !rutinaSeleccionada) return;

    const colorNormalizado = normalizeRoutineColor(color);
    try {
      setAccionPendiente("actualizar-color");
      setMensajeRutinas("");
      const { error } = await supabase
        .from("rutinas")
        .update({ color: colorNormalizado })
        .eq("id", rutinaSeleccionada.id);

      if (error) throw error;
      const rutinasActualizadas = await cargarRutinas({ mostrarCarga: false });
      setRutinaSeleccionada(
        rutinasActualizadas.find(({ id }) => id === rutinaSeleccionada.id) || null,
      );
      setMensajeRutinas("Color de rutina actualizado.");
    } catch (err) {
      console.error("Error al actualizar el color de la rutina:", err);
      setMensajeRutinas("No se pudo actualizar el color de la rutina.");
    } finally {
      setAccionPendiente("");
    }
  };

  // Función para eliminar un empleado desde la gestión de equipo
  const eliminarEmpleado = async (empleadoId) => {
    if (!confirm("¿Estás seguro de eliminar este empleado?")) return;

    try {
      const { error } = await supabase
        .from("empleados")
        .delete()
        .eq("id", empleadoId);

      if (error) throw error;
      cargarEmpleados();
    } catch (err) {
      console.error("Error al eliminar empleado:", err);
      alert("No se pudo eliminar el empleado.");
    }
  };

  return (
    <div className="admin-layout">
      {/* Barra de Navegación Superior de 5 Solapas */}
      <nav className="section-nav" aria-label="Secciones de administración">
        {secciones.map(([id, title, detail]) => (
          <button
            key={id}
            type="button"
            onClick={() => setVistaActiva(id)}
            aria-current={vistaActiva === id ? "page" : undefined}
            className="section-nav__item"
          >
            <span>{title}</span>
            <small>{detail}</small>
          </button>
        ))}
      </nav>

      <div className="admin-content">

      {/* VISTA 1: Creador de Plantillas */}
      {vistaActiva === "plantillas" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Creador de Plantillas (SOP)
            </h2>
            <form onSubmit={crearRutina} className="grid gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label htmlFor="routine-title" className="text-sm font-medium text-gray-600 block mb-1">
                    Nombre de la rutina
                  </label>
                  <input
                    id="routine-title"
                    type="text"
                    placeholder="Ej. Control sanitario"
                    value={nuevoTitulo}
                    onChange={(e) => setNuevoTitulo(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={accionPendiente === "crear-rutina" || !nuevoTitulo.trim()}
                  className="button button--primary self-end px-6"
                >
                  {accionPendiente === "crear-rutina" ? "Creando rutina…" : "Crear rutina"}
                </button>
              </div>
              {ROUTINE_COLORS_ENABLED && (
                <RoutineColorPicker
                  name="new-routine-color"
                  value={nuevoColor}
                  onChange={setNuevoColor}
                  disabled={accionPendiente === "crear-rutina"}
                />
              )}
            </form>
            {mensajeRutinas && (
              <p className="mt-3 text-sm text-gray-600" role="status">
                {mensajeRutinas}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                Rutinas registradas
              </h3>
              <div className="space-y-2">
                {cargandoRutinas && (
                  <div className="loading-state py-4" role="status" aria-live="polite">
                    <span className="loading-dot" aria-hidden="true" />
                    Cargando rutinas…
                  </div>
                )}
                {!cargandoRutinas && rutinas.length === 0 && (
                  <p className="text-sm text-gray-500 py-4">
                    Todavía no hay rutinas. Crea la primera para comenzar.
                  </p>
                )}
                {!cargandoRutinas && rutinas.map((rutina) => (
                  <div
                    key={rutina.id}
                    className={`${routineColorClass(rutina.color)} rounded-lg border transition-all flex justify-between items-center ${
                      rutinaSeleccionada?.id === rutina.id
                        ? "bg-blue-50 border-blue-500 text-blue-900 font-semibold"
                        : "bg-gray-50 border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setRutinaSeleccionada(rutina)}
                      aria-pressed={rutinaSeleccionada?.id === rutina.id}
                      className="flex-1 p-4 text-left"
                    >
                      <span className={`routine-color-dot routine-accent--${normalizeRoutineColor(rutina.color)}`} aria-hidden="true" />
                      <span className="ml-2">{rutina.titulo}</span>
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                        {rutina.tareas_rutina?.length || 0} tareas
                      </span>
                      <button
                        onClick={(e) => eliminarRutina(rutina.id, e)}
                        className="text-red-400 hover:text-red-600 font-bold p-3 transition-colors"
                        aria-label={`Eliminar rutina ${rutina.titulo}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
              {rutinaSeleccionada ? (
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">
                    Editando: {rutinaSeleccionada.titulo}
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Agrega o elimina pasos de este protocolo.
                  </p>

                  {ROUTINE_COLORS_ENABLED && (
                    <div className="mb-5 p-4 bg-gray-50 rounded-lg border">
                      <RoutineColorPicker
                        name={`routine-color-${rutinaSeleccionada.id}`}
                        value={normalizeRoutineColor(rutinaSeleccionada.color)}
                        onChange={actualizarColorRutina}
                        disabled={accionPendiente === "actualizar-color"}
                      />
                      <p className="mt-2 text-xs text-gray-500" aria-live="polite">
                        {accionPendiente === "actualizar-color"
                          ? "Guardando color…"
                          : "El cobre es el color predeterminado."}
                      </p>
                    </div>
                  )}

                  <form
                    onSubmit={agregarTarea}
                    className="space-y-3 mb-6 bg-gray-50 p-4 rounded-lg border"
                  >
                    <div>
                      <label htmlFor="task-section" className="text-xs font-medium text-gray-600 block mb-1">Sección</label>
                      <input
                        id="task-section"
                        type="text"
                        placeholder="Ej. Limpieza o recepción"
                        value={nuevaSeccion}
                        onChange={(e) => setNuevaSeccion(e.target.value)}
                        className="w-full p-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="task-description" className="text-xs font-medium text-gray-600 block mb-1">Descripción de la tarea</label>
                      <input
                        id="task-description"
                        type="text"
                        placeholder="Describe el paso a realizar"
                        value={nuevaDescripcion}
                        onChange={(e) => setNuevaDescripcion(e.target.value)}
                        className="w-full p-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={accionPendiente === "agregar-tarea" || !nuevaSeccion.trim() || !nuevaDescripcion.trim()}
                      className="w-full bg-gray-800 text-white text-sm font-medium py-2 rounded hover:bg-gray-900 transition-colors"
                    >
                      {accionPendiente === "agregar-tarea" ? "Agregando tarea…" : "+ Agregar tarea"}
                    </button>
                  </form>

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Pasos actuales:
                    </h4>
                    {rutinaSeleccionada.tareas_rutina &&
                    rutinaSeleccionada.tareas_rutina.length > 0 ? (
                      [...rutinaSeleccionada.tareas_rutina]
                        .sort((a, b) => a.orden - b.orden)
                        .map((t) => (
                          <div
                            key={t.id}
                            className="text-sm p-3 bg-white border rounded flex justify-between items-center shadow-sm"
                          >
                            <div>
                              <span className="text-[10px] font-bold text-blue-600 block uppercase">
                                {t.seccion}
                              </span>
                              <span className="text-gray-700">
                                {t.descripcion}
                              </span>
                            </div>
                            <button
                              onClick={() => eliminarTarea(t.id)}
                              className="text-red-400 hover:text-red-600 font-bold p-1 transition-colors"
                              title="Eliminar tarea"
                              aria-label={`Eliminar tarea: ${t.descripcion}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        No hay tareas cargadas en esta rutina aún.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12">
                  <p>
                    Selecciona una rutina de la izquierda para ver y gestionar
                    sus tareas.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VISTA 2: Gestión de Empleados (Modular) */}
      {vistaActiva === "empleados" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Columna Izquierda: Formulario de Registro */}
          <RegistroEmpleados onEmpleadoCreado={cargarEmpleados} />

          {/* Columna Derecha: Lista de Empleados Actuales */}
          <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              Personal registrado
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Listado actual del equipo de trabajo y sus roles.
            </p>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {cargandoEmpleados && (
                <div className="loading-state py-4" role="status" aria-live="polite">
                  <span className="loading-dot" aria-hidden="true" />
                  Cargando equipo…
                </div>
              )}
              {!cargandoEmpleados && empleados.length === 0 && (
                <p className="text-sm text-gray-500 py-4">Todavía no hay integrantes registrados.</p>
              )}
              {!cargandoEmpleados && empleados.map((emp) => (
                <div
                  key={emp.id}
                  className="p-4 bg-gray-50 border rounded-xl flex justify-between items-center"
                >
                  <div>
                    <h4 className="font-bold text-gray-800 capitalize">
                      {emp.nombre}
                    </h4>
                    <span className="text-xs uppercase bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                      {emp.rol}
                    </span>
                  </div>
                  {emp.rol !== "admin" && (
                    <button
                      onClick={() => eliminarEmpleado(emp.id)}
                      className="text-red-400 hover:text-red-600 font-bold text-sm px-2 py-1 transition-colors"
                      title="Eliminar empleado"
                      aria-label={`Eliminar empleado: ${emp.nombre}`}
                    >
                      ✕ Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VISTA 3: Asignar Rutinas */}
      {vistaActiva === "asignar" && <AsignarRutinas />}

      {/* VISTA 4: Calendario y Auditoría */}
      {vistaActiva === "auditoria" && <CalendarioAuditoria />}

      {/* VISTA DE TAREAS URGENTES */}
      {vistaActiva === "urgentes" && (
        <div className="max-w-xl mx-auto">
          <EnviarTareaUrgente />
        </div>
      )}
      </div>
    </div>
  );
}
