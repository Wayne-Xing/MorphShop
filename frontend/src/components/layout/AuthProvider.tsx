"use client";

import { ReactNode } from "react";
import { AuthContext } from "@/lib/auth";
import { useAuthState } from "@/hooks/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthState();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
