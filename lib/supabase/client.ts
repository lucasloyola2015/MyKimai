import { createBrowserClient } from "@supabase/ssr";

export function createClientComponentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.error("Missing Supabase environment variables");
    // Return a mock client that will fail gracefully instead of throwing
    // This prevents errors during render
    return createBrowserClient("", "");
  }
  
  return createBrowserClient(url, key);
}
