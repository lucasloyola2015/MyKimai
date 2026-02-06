import { createBrowserClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import {
  getRememberFromCookieString,
  getAuthCookieOptions,
  getBaseCookieOptions,
} from "@/lib/auth/remember-session";

function createRememberAwareCookies() {
  return {
    get(key: string): string | null | undefined {
      if (typeof document === "undefined") return undefined;
      const all = parse(document.cookie || "");
      return all[key] ?? null;
    },
    set(
      key: string,
      value: string,
      _opts?: { path?: string; sameSite?: "lax"; maxAge?: number; secure?: boolean }
    ) {
      if (typeof document === "undefined") return;
      const remember = getRememberFromCookieString(document.cookie || "");
      const opts = getAuthCookieOptions(remember);
      document.cookie = serialize(key, value, opts);
    },
    remove(key: string) {
      if (typeof document === "undefined") return;
      const base = getBaseCookieOptions();
      document.cookie = serialize(key, "", { ...base, maxAge: 0 });
    },
  };
}

export function createClientComponentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing Supabase environment variables");
    return createBrowserClient("", "");
  }

  const cookies = createRememberAwareCookies();

  return createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    cookies: {
      get: (name: string) => cookies.get(name),
      set: (name: string, value: string, options?: object) => cookies.set(name, value, options as any),
      remove: (name: string, options?: object) => cookies.remove(name),
    },
  });
}
