import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  REMEMBER_COOKIE_NAME,
  getAuthCookieOptions,
} from "@/lib/auth/remember-session";

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

  // Verificamos el usuario para refrescar la sesión si es necesario.
  // No usamos timeout manual aquí para evitar AbortError: signal is aborted
  await supabase.auth.getUser();

  return supabaseResponse;
}
