import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  REMEMBER_COOKIE_NAME,
  getAuthCookieOptions,
} from "@/lib/auth/remember-session";

/**
 * Helper para agregar timeout a una promesa
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Middleware timeout")), timeoutMs)
    ),
  ]);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const remember =
    request.cookies.get(REMEMBER_COOKIE_NAME)?.value === "1";
  const authOpts = getAuthCookieOptions(remember);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          const opts = { ...options, ...authOpts };
          request.cookies.set({ name, value, ...opts });
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          });
          supabaseResponse.cookies.set({ name, value, ...opts });
        },
        remove(name: string, options: CookieOptions) {
          const opts = { ...options, maxAge: 0 };
          request.cookies.set({ name, value: "", ...opts });
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          });
          supabaseResponse.cookies.set({ name, value: "", ...opts });
        },
      },
    }
  );

  try {
    // Timeout de 2 segundos para evitar bloqueos en el middleware
    await withTimeout(supabase.auth.getUser(), 2000);
  } catch (error) {
    // Si hay timeout o error, continuar con la respuesta sin bloquear
    console.error("Middleware auth check timeout or error:", error);
    // Continuar con la respuesta para que la página se pueda renderizar
  }

  return supabaseResponse;
}
