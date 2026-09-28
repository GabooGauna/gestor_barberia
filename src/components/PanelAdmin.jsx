// src/components/PanelAdmin.jsx
import { useState, useEffect } from "react";
import { supabase } from "../services/supabase";
import CalendarioAuditoria from "./CalendarioAuditoria";
import RegistroEmpleados from "./RegistroEmpleados"; // <-- Importamos nuestro componente modular
import AsignarRutinas from "./AsignarRutinas";
import EnviarTareaUrgente from "./EnviarTareaUrgente";

export default function PanelAdmin() {
  const [vistaActiva, setVistaActiva] = useState("plantillas"); // 'plantillas', 'empleados', o 'auditoria'

  // Estados del Creador de Plantillas
  const [rutinas, setRutinas] = useState([]);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [rutinaSeleccionada, setRutinaSeleccionada] = useState(null);
  const [nuevaSeccion, setNuevaSeccion] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [cargando, setCargando] = useState(false);

  // Estados para listar y administrar empleados existentes
  const [empleados, setEmpleados] = useState([]);

  useEffect(() => {
    cargarRutinas();
    cargarEmpleados();
  }, []);

  const cargarRutinas = async () => {
    try {
      const { data, error } = await supabase
        .from("rutinas")
        .select(
          `
          id,
          titulo,
          tareas_rutina (
            id,
            seccion,
            descripcion,
            orden
          )
        `,
        )
        .order("titulo", { ascending: true });

      if (error) throw error;
      setRutinas(data || []);
    } catch (err) {
      console.error("Error al cargar rutinas:", err);
    }
  };

  const cargarEmpleados = async () => {
    try {
      const { data, error } = await supabase
        .from("empleados")
        .select("*")
        .order("nombre", { ascending: true });

      if (error) throw error;
      setEmpleados(data || []);
    } catch (err) {
      console.error("Error al cargar empleados:", err);
    }
  };

  const crearRutina = async (e) => {
    e.preventDefault();
    if (!nuevoTitulo.trim()) return;

    try {
      setCargando(true);
      const { error } = await supabase
        .from("rutinas")
        .insert([{ titulo: nuevoTitulo }]);

      if (error) throw error;

      setNuevoTitulo("");
      cargarRutinas();
    } catch (err) {
      console.error("Error al crear rutina:", err);
      alert("No se pudo crear la rutina.");
    } finally {
      setCargando(false);
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

      cargarRutinas();
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
      setCargando(true);
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

      await cargarRutinas();

      const { data: rutinaActualizada } = await supabase
        .from("rutinas")
        .select(`id, titulo, tareas_rutina (id, seccion, descripcion, orden)`)
        .eq("id", rutinaSeleccionada.id)
        .single();

      setRutinaSeleccionada(rutinaActualizada);
    } catch (err) {
      console.error("Error al agregar tarea:", err);
      alert("No se pudo agregar la tarea.");
    } finally {
      setCargando(false);
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

      await cargarRutinas();

      const { data: rutinaActualizada } = await supabase
        .from("rutinas")
        .select(`id, titulo, tareas_rutina (id, seccion, descripcion, orden)`)
        .eq("id", rutinaSeleccionada.id)
        .single();

      setRutinaSeleccionada(rutinaActualizada);
    } catch (err) {
      console.error("Error al eliminar la tarea:", err);
      alert("No se pudo eliminar la tarea.");
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
    <div className="space-y-6">
      {/* Barra de Navegación Superior de 5 Solapas */}
      <div className="flex flex-wrap bg-white p-1.5 rounded-xl shadow max-w-4xl mx-auto gap-1">
        <button
          onClick={() => setVistaActiva("plantillas")}
          className={`flex-1 min-w-[110px] py-2.5 px-3 text-sm font-semibold rounded-lg transition-all ${
            vistaActiva === "plantillas"
              ? "bg-blue-600 text-white shadow"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Plantillas
        </button>
        <button
          onClick={() => setVistaActiva("empleados")}
          className={`flex-1 min-w-[110px] py-2.5 px-3 text-sm font-semibold rounded-lg transition-all ${
            vistaActiva === "empleados"
              ? "bg-blue-600 text-white shadow"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Empleados
        </button>
        <button
          onClick={() => setVistaActiva("asignar")}
          className={`flex-1 min-w-[110px] py-2.5 px-3 text-sm font-semibold rounded-lg transition-all ${
            vistaActiva === "asignar"
              ? "bg-blue-600 text-white shadow"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Asignar Tareas
        </button>
        <button
          onClick={() => setVistaActiva("urgentes")}
          className={`flex-1 min-w-[110px] py-2.5 px-3 text-sm font-semibold rounded-lg transition-all ${
            vistaActiva === "urgentes"
              ? "bg-amber-600 text-white shadow"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          🚨 Urgencias
        </button>
        <button
          onClick={() => setVistaActiva("auditoria")}
          className={`flex-1 min-w-[110px] py-2.5 px-3 text-sm font-semibold rounded-lg transition-all ${
            vistaActiva === "auditoria"
              ? "bg-blue-600 text-white shadow"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Auditoría
        </button>
      </div>

      {/* VISTA 1: Creador de Plantillas */}
      {vistaActiva === "plantillas" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Creador de Plantillas (SOP)
            </h2>
            <form onSubmit={crearRutina} className="flex gap-4">
              <input
                type="text"
                placeholder="Nombre de la nueva rutina (Ej. Control Sanitario)"
                value={nuevoTitulo}
                onChange={(e) => setNuevoTitulo(e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={cargando}
                className="bg-blue-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Crear Rutina
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                Rutinas Registradas
              </h3>
              <div className="space-y-2">
                {rutinas.map((rutina) => (
                  <div
                    key={rutina.id}
                    onClick={() => setRutinaSeleccionada(rutina)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${
                      rutinaSeleccionada?.id === rutina.id
                        ? "bg-blue-50 border-blue-500 text-blue-900 font-semibold"
                        : "bg-gray-50 border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    <span>{rutina.titulo}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                        {rutina.tareas_rutina?.length || 0} tareas
                      </span>
                      <button
                        onClick={(e) => eliminarRutina(rutina.id, e)}
                        className="text-red-400 hover:text-red-600 font-bold p-1 transition-colors"
                        title="Eliminar rutina"
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

                  <form
                    onSubmit={agregarTarea}
                    className="space-y-3 mb-6 bg-gray-50 p-4 rounded-lg border"
                  >
                    <input
                      type="text"
                      placeholder="Sección (Ej. Limpieza, Recepción)"
                      value={nuevaSeccion}
                      onChange={(e) => setNuevaSeccion(e.target.value)}
                      className="w-full p-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Descripción de la tarea"
                      value={nuevaDescripcion}
                      onChange={(e) => setNuevaDescripcion(e.target.value)}
                      className="w-full p-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 bg-white"
                    />
                    <button
                      type="submit"
                      disabled={cargando}
                      className="w-full bg-gray-800 text-white text-sm font-medium py-2 rounded hover:bg-gray-900 transition-colors"
                    >
                      + Agregar Tarea
                    </button>
                  </form>

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                      Pasos actuales:
                    </h4>
                    {rutinaSeleccionada.tareas_rutina &&
                    rutinaSeleccionada.tareas_rutina.length > 0 ? (
                      rutinaSeleccionada.tareas_rutina
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
              Personal Registrado
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Listado actual del equipo de trabajo y sus roles.
            </p>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {empleados.map((emp) => (
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
  );
}
