import { createClient } from "@supabase/supabase-js";

// 1. Extraemos las variables de forma segura desde .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 2. Creamos y exportamos el cliente
// Usaremos esta constante "supabase" en el futuro para leer o guardar datos
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
