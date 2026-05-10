import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/services/AuthService";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
