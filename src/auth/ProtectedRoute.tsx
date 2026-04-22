import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";
import { FullPageLoader } from "../components/FullPageLoader/FullPageLoader";

export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === "unknown") return <FullPageLoader label="Validando sesión…" />;
  if (status === "anon") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

