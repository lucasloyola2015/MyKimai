"use client";

import { ReactNode, useEffect } from "react";

export function ChildrenDebugWrapper({ children }: { children: ReactNode }) {
  useEffect(() => {
  }, [children]);


  return <>{children}</>;
}
