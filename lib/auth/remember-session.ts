import { parse, serialize } from "cookie";

export const REMEMBER_COOKIE_NAME = "remember_session";

/** 60 días en segundos - cookies de auth cuando "recordar" está activo */
export const REMEMBER_MAX_AGE = 60 * 24 * 60 * 60;

/** 7 días en segundos - cuando "recordar" está desactivado (evita cookies de sesión que los navegadores limpian agresivamente) */
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export function getBaseCookieOptions() {
  const isProd = typeof process !== "undefined" && process.env.NODE_ENV === "production";
  const isLocalhost =
    typeof window !== "undefined" &&
    /localhost|127\.0\.0\.1|\[::1\]/.test(window.location?.hostname || "");

  return {
    path: "/" as const,
    sameSite: "lax" as const,
    /** Secure solo en producción con HTTPS; nunca en localhost */
    secure: isProd && !isLocalhost,
  };
}

/**
 * Opciones para cookies de auth de Supabase.
 * - Con "recordar": maxAge 60 días (persiste al cerrar navegador).
 * - Sin "recordar": maxAge 7 días (evita cookies de sesión que se pierden con frecuencia).
 */
export function getAuthCookieOptions(remember: boolean): {
  path: string;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
} {
  const base = getBaseCookieOptions();
  return {
    ...base,
    maxAge: remember ? REMEMBER_MAX_AGE : SESSION_MAX_AGE,
  };
}

/**
 * Lee si "recordar sesión" está activo.
 * Por defecto TRUE cuando la cookie no existe (mejor UX: sesión persiste).
 */
export function getRememberFromCookieString(cookieString: string): boolean {
  const parsed = parse(cookieString || "");
  const value = parsed[REMEMBER_COOKIE_NAME];
  if (value === undefined || value === "") return true;
  return value === "1";
}

/**
 * Cliente: establece la cookie "recordar sesión" antes del login.
 * Llamar justo antes de signInWithPassword.
 */
export function setRememberSessionCookie(remember: boolean): void {
  if (typeof document === "undefined") return;
  const value = remember ? "1" : "0";
  const opts = {
    ...getBaseCookieOptions(),
    maxAge: REMEMBER_MAX_AGE, // La preferencia persiste 60 días
  };
  document.cookie = serialize(REMEMBER_COOKIE_NAME, value, opts);
}

/**
 * Opcional: eliminar la cookie al cerrar sesión.
 * Por defecto NO la eliminamos para conservar la preferencia del usuario.
 */
export function clearRememberSessionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = serialize(REMEMBER_COOKIE_NAME, "", {
    ...getBaseCookieOptions(),
    maxAge: 0,
  });
}
