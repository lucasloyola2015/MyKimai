import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  REMEMBER_COOKIE_NAME,
  getAuthCookieOptions,
} from "@/lib/auth/remember-session";

export async function createServerComponentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  const cookieStore = await cookies();
  const remember = cookieStore.get(REMEMBER_COOKIE_NAME)?.value === "1";
  const authOpts = getAuthCookieOptions(remember);

  return createServerClient(
    url,
    key,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options, ...authOpts });
          } catch {
            // Llamado desde Server Component; el middleware refresca sesiones.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options, maxAge: 0 });
          } catch {
            // Llamado desde Server Component; el middleware refresca sesiones.
          }
        },
      },
    }
  );
}
