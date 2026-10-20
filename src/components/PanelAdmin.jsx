// src/components/PanelAdmin.jsx
import { lazy, Suspense, useCallback, useState, useEffect, useRef } from "react";
import { supabase } from "../services/supabase";
import RegistroEmpleados from "./RegistroEmpleados"; // <-- Importamos nuestro componente modular
import AsignarRutinas from "./AsignarRutinas";
import EnviarTareaUrgente from "./EnviarTareaUrgente";
import { runAdminUserAction } from "../services/adminUsers";
import { passwordValidationError } from "../utils/auth";
import { useAuth } from "../hooks/useAuth";
import {
  DEFAULT_ROUTINE_COLOR,
  ROUTINE_COLORS_ENABLED,
  ROUTINE_COLOR_OPTIONS,
  normalizeRoutineColor,
  routineColorClass,
} from "../utils/coloresRutina";

const CalendarioAuditoria = lazy(() => import("./CalendarioAuditoria"));

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
  const { profile, refreshProfile } = useAuth();
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
  const [mensajeEquipo, setMensajeEquipo] = useState("");
  const [errorEquipo, setErrorEquipo] = useState("");
  const [accionEmpleado, setAccionEmpleado] = useState("");
  const [empleadoReset, setEmpleadoReset] = useState(null);
  const [passwordReset, setPasswordReset] = useState("");
  const [passwordResetConfirmation, setPasswordResetConfirmation] = useState("");
  const [mostrarPasswordReset, setMostrarPasswordReset] = useState(false);
  const resetDialogRef = useRef(null);
  const resetTriggerRef = useRef(null);

  useEffect(() => {
    if (!empleadoReset) return;
    const dialog = resetDialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      queueMicrotask(() => resetTriggerRef.current?.focus());
    };
  }, [empleadoReset]);

  const secciones = [
    ["plantillas", "Plantillas", "Protocolos base"],
    ["empleados", "Equipo", "Perfiles y roles"],
    ["asignar", "Asignaciones", "Rutinas de hoy"],
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
        .is("archivada_en", null)
        .is("tareas_rutina.archivada_en", null)
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

  const cargarEmpleados = useCallback(async () => {
    try {
      setCargandoEmpleados(true);
      const { data, error } = await supabase
        .from("empleados")
        .select("id, nombre, usuario, rol, activo")
        .order("nombre", { ascending: true });

      if (error) throw error;
      setEmpleados(data || []);
    } catch (err) {
      console.error("Error al cargar empleados:", err);
      setErrorEquipo("No se pudo cargar el equipo.");
    } finally {
      setCargandoEmpleados(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      cargarRutinas();
    });
  }, []);

  useEffect(() => {
    if (vistaActiva === "empleados") queueMicrotask(cargarEmpleados);
  }, [vistaActiva, cargarEmpleados]);

  useEffect(() => {
    if (!empleadoReset) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !accionEmpleado) {
        setEmpleadoReset(null);
        setPasswordReset("");
        setPasswordResetConfirmation("");
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [empleadoReset, accionEmpleado]);

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

  const archivarRutina = async (rutinaId, e) => {
    e.stopPropagation();
    if (
      !confirm(
        "¿Archivar esta rutina? Dejará de estar disponible, pero su historial se conservará.",
      )
    )
      return;

    try {
      const { error } = await supabase
        .from("rutinas")
        .update({ archivada_en: new Date().toISOString() })
        .eq("id", rutinaId);

      if (error) throw error;

      if (rutinaSeleccionada?.id === rutinaId) {
        setRutinaSeleccionada(null);
      }

      await cargarRutinas({ mostrarCarga: false });
    } catch (err) {
      console.error("Error al archivar la rutina:", err);
      alert("No se pudo archivar la rutina.");
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

  const archivarTarea = async (tareaId) => {
    if (!confirm("¿Archivar esta tarea? Su historial se conservará.")) return;

    try {
      const { error } = await supabase
        .from("tareas_rutina")
        .update({ archivada_en: new Date().toISOString() })
        .eq("id", tareaId);

      if (error) throw error;

      const rutinasActualizadas = await cargarRutinas({ mostrarCarga: false });
      setRutinaSeleccionada(
        rutinasActualizadas.find(({ id }) => id === rutinaSeleccionada.id) || null,
      );
    } catch (err) {
      console.error("Error al archivar la tarea:", err);
      alert("No se pudo archivar la tarea.");
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

  const administrarEmpleado = async (empleado, action, extra = {}) => {
    const actionKey = `${action}:${empleado.id}`;
    try {
      setAccionEmpleado(actionKey);
      setMensajeEquipo("");
      setErrorEquipo("");
      await runAdminUserAction({ action, employeeId: empleado.id, ...extra });
      const labels = {
        deactivate: "Cuenta desactivada. El historial se conserva.",
        reactivate: "Cuenta reactivada.",
        change_role: "Rol actualizado.",
        reset_password: "Contraseña actualizada. Comunicala por un canal seguro.",
      };
      setMensajeEquipo(labels[action]);
      await cargarEmpleados();
      if (empleado.id === profile.id) await refreshProfile();
      return true;
    } catch (error) {
      const messages = {
        cannot_deactivate_current_account: "No podés desactivar tu propia cuenta.",
        cannot_deactivate_last_admin: "Debe quedar al menos un administrador activo.",
        cannot_demote_last_admin: "Debe quedar al menos un administrador activo.",
        reconciliation_required: "La operación requiere revisión administrativa antes de reintentar.",
        admin_required: "Tu cuenta ya no tiene permisos administrativos.",
        account_not_found: "La cuenta ya no está disponible.",
      };
      setErrorEquipo(messages[error.code] || "No se pudo completar la operación.");
      return false;
    } finally {
      setAccionEmpleado("");
    }
  };

  const confirmarEstado = (empleado) => {
    const action = empleado.activo ? "deactivate" : "reactivate";
    if (empleado.activo && !confirm(`¿Desactivar la cuenta de ${empleado.nombre}? No se borrará su historial.`)) return;
    administrarEmpleado(empleado, action);
  };

  const cambiarRol = (empleado, role) => {
    if (role === empleado.rol) return;
    if (!confirm(`¿Cambiar el rol de ${empleado.nombre} a ${role}?`)) return;
    administrarEmpleado(empleado, "change_role", { role });
  };

  const restablecerPassword = async (event) => {
    event.preventDefault();
    const validationError = passwordValidationError(passwordReset);
    if (validationError) return setErrorEquipo(validationError);
    if (passwordReset !== passwordResetConfirmation) return setErrorEquipo("Las contraseñas no coinciden.");
    const completed = await administrarEmpleado(empleadoReset, "reset_password", { password: passwordReset });
    if (completed) {
      setEmpleadoReset(null);
      setPasswordReset("");
      setPasswordResetConfirmation("");
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
          <div className="surface-panel p-6">
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
            <div className="surface-panel p-6">
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
                    className={`routine-choice ${routineColorClass(rutina.color)} rounded-lg border flex justify-between items-center ${
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
                        onClick={(e) => archivarRutina(rutina.id, e)}
                        className="text-red-400 hover:text-red-600 font-bold p-3 transition-colors"
                        aria-label={`Archivar rutina ${rutina.titulo}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-panel p-6">
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
                      className="button button--neutral w-full text-sm"
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
                              onClick={() => archivarTarea(t.id)}
                              className="text-red-400 hover:text-red-600 font-bold p-1 transition-colors"
                              title="Archivar tarea"
                              aria-label={`Archivar tarea: ${t.descripcion}`}
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

      {/* VISTA 2: Gestión segura de cuentas */}
      {vistaActiva === "empleados" && (
        <div className="team-management">
          <RegistroEmpleados onEmpleadoCreado={cargarEmpleados} />

          <div className="surface-panel p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Personal registrado</h3>
            <p className="text-xs text-gray-500 mb-4">El estado y los permisos se validan en la base de datos.</p>

            {mensajeEquipo && <p role="status" className="form-message form-message--exito mb-4">{mensajeEquipo}</p>}
            {errorEquipo && <p role="alert" className="form-message form-message--error mb-4">{errorEquipo}</p>}

            <div className="team-list">
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
                <article key={emp.id} className="team-row">
                  <div className="team-row__identity">
                    <h4>{emp.nombre}</h4>
                    <span>@{emp.usuario}</span>
                    <span className={`account-state ${emp.activo ? "is-active" : "is-inactive"}`}>
                      {emp.activo ? "Cuenta activa" : "Cuenta desactivada"}
                    </span>
                  </div>
                  <div className="team-row__controls">
                    <label>
                      <span>Rol</span>
                      <select
                        value={emp.rol}
                        onChange={(event) => cambiarRol(emp, event.target.value)}
                        disabled={Boolean(accionEmpleado) || !emp.activo}
                        aria-label={`Rol de ${emp.nombre}`}
                      >
                        <option value="empleado">Empleado</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="button button--secondary"
                      disabled={Boolean(accionEmpleado)}
                      onClick={(event) => {
                        resetTriggerRef.current = event.currentTarget;
                        setErrorEquipo("");
                        setMensajeEquipo("");
                        setEmpleadoReset(emp);
                      }}
                    >
                      Cambiar contraseña
                    </button>
                    <button
                      type="button"
                      className={emp.activo ? "button button--danger" : "button button--secondary"}
                      disabled={Boolean(accionEmpleado) || emp.id === profile.id}
                      onClick={() => confirmarEstado(emp)}
                    >
                      {accionEmpleado.endsWith(`:${emp.id}`)
                        ? "Procesando…"
                        : emp.activo ? "Desactivar" : "Reactivar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {empleadoReset && (
              <dialog ref={resetDialogRef} className="security-dialog" aria-labelledby="reset-password-title" onCancel={(event) => {
                event.preventDefault();
                if (accionEmpleado) return;
                setEmpleadoReset(null);
                setPasswordReset("");
                setPasswordResetConfirmation("");
                setMostrarPasswordReset(false);
                setErrorEquipo("");
              }}>
                <h3 id="reset-password-title">Cambiar contraseña</h3>
                <p>Definí una nueva contraseña para {empleadoReset.nombre}. No se mostrará nuevamente.</p>
                <form onSubmit={restablecerPassword} className="space-y-4" noValidate>
                  <div className="form-field compact">
                    <label htmlFor="reset-password">Nueva contraseña</label>
                    <input id="reset-password" type={mostrarPasswordReset ? "text" : "password"} autoComplete="new-password" value={passwordReset} onChange={(event) => setPasswordReset(event.target.value)} autoFocus />
                  </div>
                  <div className="form-field compact">
                    <label htmlFor="reset-password-confirmation">Repetir contraseña</label>
                    <input id="reset-password-confirmation" type={mostrarPasswordReset ? "text" : "password"} autoComplete="new-password" value={passwordResetConfirmation} onChange={(event) => setPasswordResetConfirmation(event.target.value)} />
                  </div>
                  <label className="password-visibility">
                    <input type="checkbox" checked={mostrarPasswordReset} onChange={(event) => setMostrarPasswordReset(event.target.checked)} />
                    Mostrar contraseñas
                  </label>
                  {errorEquipo && <p role="alert" className="form-message form-message--error">{errorEquipo}</p>}
                  <div className="dialog-actions">
                    <button type="button" className="button button--secondary" disabled={Boolean(accionEmpleado)} onClick={() => {
                      setEmpleadoReset(null);
                      setPasswordReset("");
                      setPasswordResetConfirmation("");
                      setMostrarPasswordReset(false);
                      setErrorEquipo("");
                    }}>Cancelar</button>
                    <button type="submit" className="button button--primary" disabled={Boolean(accionEmpleado)}>Guardar contraseña</button>
                  </div>
                </form>
              </dialog>
          )}
        </div>
      )}

      {/* VISTA 3: Asignar Rutinas */}
      {vistaActiva === "asignar" && <AsignarRutinas />}

      {/* VISTA 4: Calendario y Auditoría */}
      {vistaActiva === "auditoria" && (
        <Suspense fallback={
          <div className="loading-state" role="status">
            <span className="loading-dot" aria-hidden="true" />Cargando auditoría…
          </div>
        }>
          <CalendarioAuditoria onAssign={() => setVistaActiva("asignar")} />
        </Suspense>
      )}

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
