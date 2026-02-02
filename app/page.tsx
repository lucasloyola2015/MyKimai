import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase/server";
import { getClientContext } from "@/lib/auth/server";

export default async function Home() {
  try {
    const supabase = await createServerComponentClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const clientContext = await getClientContext();
      if (clientContext) {
        redirect("/client-portal");
      }
      redirect("/dashboard");
    } else {
      redirect("/login");
    }
  } catch (error) {
    // If there's an error (e.g., missing env vars), redirect to login
    console.error("Error in Home page:", error);
    redirect("/login");
  }
}
