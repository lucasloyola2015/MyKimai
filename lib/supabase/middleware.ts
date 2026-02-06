import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getAuthCookieOptions,
  getBaseCookieOptions,
  getRememberFromCookieString,
} from "@/lib/auth/remember-session";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  const cookieHeader = request.headers.get("cookie") || "";
  const remember = getRememberFromCookieString(cookieHeader);
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
          response.cookies.set({ name, value, ...opts });
        },
        remove(name: string, options: CookieOptions) {
          const base = getBaseCookieOptions();
          const opts = { ...base, ...options, maxAge: 0 };
          request.cookies.set({ name, value: "", ...opts });
          response.cookies.set({ name, value: "", ...opts });
        },
      },
    }
  );

  // Refresca la sesión si es necesario; los tokens se persisten con la duración según "recordar sesión".
  await supabase.auth.getUser();

  return response;
}
