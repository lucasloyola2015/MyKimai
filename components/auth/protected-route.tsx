"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:14',message:'ProtectedRoute useEffect triggered',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
    // #endregion
    const checkUser = async () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:16',message:'checkUser called',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
      // #endregion
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:20',message:'User check result',data:{hasUser:!!user,willRedirect:!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
      // #endregion

      if (!user) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:21',message:'Redirecting to login - no user',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'L'})}).catch(()=>{});
        // #endregion
        router.push("/login");
        return;
      }

      setUser(user);
      setLoading(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:26',message:'User set, loading false',data:{userId:user.id,loading:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'M'})}).catch(()=>{});
      // #endregion
    };

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login");
      } else {
        setUser(session.user);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:47',message:'ProtectedRoute render state',data:{loading,hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'N'})}).catch(()=>{});
  }, [loading, user]);
  // #endregion

  if (loading) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:50',message:'Returning loading state',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'O'})}).catch(()=>{});
    // #endregion
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:59',message:'Returning null - no user',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'P'})}).catch(()=>{});
    // #endregion
    return null;
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0fda1414-4390-4855-9462-9c9a0cf71bf7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/auth/protected-route.tsx:62',message:'Returning children - user authenticated',data:{userId:user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'Q'})}).catch(()=>{});
  // #endregion
  return <>{children}</>;
}
