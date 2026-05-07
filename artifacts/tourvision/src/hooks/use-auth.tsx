import { type ReactNode } from "react";
import { useAuth as useReplitAuth, type AuthUser } from "@workspace/replit-auth-web";

export type { AuthUser };

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return useReplitAuth();
}
