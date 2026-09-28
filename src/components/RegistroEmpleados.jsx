// src/components/RegistroEmpleados.jsx
import { useState } from "react";
import { supabase } from "../services/supabase";

export default function RegistroEmpleados({ onEmpleadoCreado }) {
  const [nombre, setNombre] = useState("");
  const [pin, setPin] = useState("");
  const [rol, setRol] = useState("empleado");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje({ texto: "", tipo: "" });

    // Validaciones básicas
    if (!nombre.trim()) {
      setMensaje({ texto: "El nombre es obligatorio.", tipo: "error" });
      return;
    }
    if (pin.length !== 4) {
      setMensaje({
        texto: "El PIN debe tener exactamente 4 dígitos.",
        tipo: "error",
      });
      return;
    }

    try {
      setCargando(true);

      const { error } = await supabase
        .from("empleados")
        .insert([{ nombre: nombre.trim(), pin, rol }]);

      if (error) throw error;

      setMensaje({ texto: "¡Empleado registrado con éxito!", tipo: "exito" });
      setNombre("");
      setPin("");
      setRol("empleado");

      // Si el componente padre nos pasó una función para actualizar listas, la ejecutamos
      if (onEmpleadoCreado) {
        onEmpleadoCreado();
      }
    } catch (err) {
      console.error("Error al registrar empleado:", err);
      if (err.code === "23505") {
        setMensaje({
          texto: "Ese PIN ya está en uso por otro usuario. Elige otro.",
          tipo: "error",
        });
      } else {
        setMensaje({
          texto: "No se pudo registrar el empleado.",
          tipo: "error",
        });
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow border border-gray-100">
      <h3 className="text-lg font-bold text-gray-800 mb-1">
        Registrar Nuevo Empleado
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Crea un perfil y su PIN de acceso rápido de 4 dígitos.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
            Nombre del Barbero
          </label>
          <input
            type="text"
            placeholder="Ej. Carlos Gómez"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
            PIN de Acceso (4 dígitos)
          </label>
          <input
            type="password"
            maxLength="4"
            placeholder="****"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm tracking-widest"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
            Rol en el Sistema
          </label>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm bg-white"
          >
            <option value="empleado">Empleado (Barbero)</option>
            <option value="admin">Administrador (Jefe)</option>
          </select>
        </div>

        {mensaje.texto && (
          <p
            className={`text-xs font-medium p-3 rounded-lg ${
              mensaje.tipo === "error"
                ? "bg-red-50 text-red-600"
                : "bg-green-50 text-green-700"
            }`}
          >
            {mensaje.texto}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="w-full bg-blue-600 text-white font-medium py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm shadow-md"
        >
          {cargando ? "Registrando..." : "Guardar Empleado"}
        </button>
      </form>
    </div>
  );
}
