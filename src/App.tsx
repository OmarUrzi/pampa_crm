import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "./components/AppShell/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { EventosPage } from "./pages/EventosPage";
import { EventosPageApi } from "./pages/EventosPage.api";
import { EventoDetailPage } from "./pages/EventoDetailPage";
import { ClientesPage } from "./pages/ClientesPage";
import { ProveedoresPage } from "./pages/ProveedoresPage";
import { CatalogoPage } from "./pages/CatalogoPage";
import { EstadisticasPage } from "./pages/EstadisticasPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AdminMailboxesPage } from "./pages/AdminMailboxesPage";
import { AdminAiProvidersPage } from "./pages/AdminAiProvidersPage";
import { AdminAgenciaPage } from "./pages/AdminAgenciaPage";
import { useEffect } from "react";
import { apiListProveedores } from "./api/proveedores";
import { useAppStore } from "./state/useAppStore";
import { LoginPage } from "./pages/LoginPage";
import { useAuthStore } from "./state/useAuthStore";
// FullPageLoader is used by ProtectedRoute
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { bootstrapData } from "./state/bootstrapData";

export function App() {
  const setProveedores = useAppStore((s) => s.setProveedores);
  const bootstrapAuth = useAuthStore((s) => s.bootstrap);
  const authStatus = useAuthStore((s) => s.status);
  const authUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    const onToken = () => void bootstrapAuth();
    window.addEventListener("pampa-crm:token", onToken);
    return () => window.removeEventListener("pampa-crm:token", onToken);
  }, [bootstrapAuth]);

  useEffect(() => {
    // Al cambiar sesión, intentamos refrescar datos server-backed.
    if (authStatus !== "authed") return;
    void bootstrapData(authUser?.id ?? authUser?.email ?? "authed");
  }, [authStatus, authUser?.email, authUser?.id]);

  useEffect(() => {
    (async () => {
      try {
        const items = await apiListProveedores();
        setProveedores(items);
      } catch {
        // ignore (fallback seed/local)
      }
    })();
  }, [setProveedores]);

  useEffect(() => {
    if (authStatus === "authed" && location.pathname === "/login") {
      navigate("/dashboard", { replace: true });
    }
  }, [authStatus, location.pathname, navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/eventos" element={<EventosPage />} />
        <Route path="/eventos-api" element={<EventosPageApi />} />
        <Route path="/eventos/:eventoId" element={<EventoDetailPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/proveedores" element={<ProveedoresPage />} />
        <Route path="/catalogo" element={<CatalogoPage />} />
        <Route path="/estadisticas" element={<EstadisticasPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/mailboxes" element={<AdminMailboxesPage />} />
        <Route path="/admin/ai" element={<AdminAiProvidersPage />} />
        <Route path="/admin/agencia" element={<AdminAgenciaPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

