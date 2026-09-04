import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const REMEMBER_KEY = "tesla_remember_session";

/**
 * "Mantener sesión iniciada" (por defecto: SÍ).
 * true  -> la sesión se guarda en localStorage: sobrevive a cerrar la
 *          app/PWA por completo y volver a abrirla (lo que se pidió).
 * false -> la sesión se guarda en sessionStorage: se pierde al cerrar
 *          la ventana/app (útil para un equipo compartido del colegio).
 */
export function getRememberSession(): boolean {
  return localStorage.getItem(REMEMBER_KEY) !== "0";
}

export function setRememberSession(remember: boolean): void {
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
}

// Adaptador de storage "dinámico": decide en cada lectura/escritura si usar
// localStorage o sessionStorage según la preferencia guardada. Esto es
// necesario porque el cliente de Supabase se crea una sola vez al cargar
// la app, pero el usuario puede cambiar la preferencia después (o recién
// al iniciar sesión) — así que la decisión se toma en el momento exacto
// en que Supabase intenta guardar la sesión, no al crear el cliente.
const dynamicAuthStorage = {
  getItem: (key: string) => {
    // Si existe en localStorage (sesión "recordada"), esa manda.
    // Si no, se busca en sessionStorage (sesión de esta pestaña/ventana).
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (getRememberSession()) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: dynamicAuthStorage,
  },
});
