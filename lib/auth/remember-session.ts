import { parse, serialize } from "cookie";

export const REMEMBER_COOKIE_NAME = "remember_session";
/** 30 días en segundos */
export const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60;

const BASE_OPTIONS = { path: "/", sameSite: "lax" as const };

/**
 * Opciones para cookies de auth.
 * - Con "recordar": maxAge 30 días (persiste al cerrar navegador).
 * - Sin "recordar": sesión (expira al cerrar navegador).
 */
export function getAuthCookieOptions(remember: boolean): {
  path: string;
  sameSite: "lax";
  maxAge?: number;
} {
  return remember
    ? { ...BASE_OPTIONS, maxAge: REMEMBER_MAX_AGE }
    : { ...BASE_OPTIONS };
}

/**
 * Lee si "recordar sesión" está activo desde un string de cookies (ej. document.cookie o header).
 */
export function getRememberFromCookieString(cookieString: string): boolean {
  const parsed = parse(cookieString || "");
  return parsed[REMEMBER_COOKIE_NAME] === "1";
}

/**
 * Cliente: establece la cookie "recordar sesión" antes del login.
 * Llamar justo antes de signInWithPassword.
 */
export function setRememberSessionCookie(remember: boolean): void {
  if (typeof document === "undefined") return;
  const value = remember ? "1" : "0";
  const opts = remember
    ? { ...BASE_OPTIONS, maxAge: REMEMBER_MAX_AGE }
    : BASE_OPTIONS;
  document.cookie = serialize(REMEMBER_COOKIE_NAME, value, opts);
}

/**
 * Cliente: elimina la cookie "recordar sesión" (p. ej. al cerrar sesión).
 */
export function clearRememberSessionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = serialize(REMEMBER_COOKIE_NAME, "", {
    ...BASE_OPTIONS,
    maxAge: 0,
  });
}
