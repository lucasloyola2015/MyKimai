import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase/server";

export default async function Home() {
  try {
    const supabase = await createServerComponentClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
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
