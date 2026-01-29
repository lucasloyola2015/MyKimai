"use client";

import { ReactNode, useEffect, useState } from "react";

export function ChildrenWrapper({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);


  useEffect(() => {
    setMounted(true);
  }, []);


  try {
    return <>{children}</>;
  } catch (error) {
    throw error;
  }
}
