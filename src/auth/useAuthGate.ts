import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";
import { useNoticeStore } from "../state/useNoticeStore";
import { ApiError, AuthRequiredError } from "../api/client";

function friendlyApiMessage(e: ApiError) {
  if (e.bodyText === "timeout") return "La API tardó demasiado (timeout).";
  if (e.bodyText === "network_error") return "No se pudo conectar con la API.";
  if (e.bodyText === "last_admin") return "No podés quitar el rol admin al último admin.";
  if (e.bodyText === "forbidden" || e.status === 403) return "No tenés permisos para esa acción.";
  if (e.bodyText === "not_found" || e.status === 404) return "No se encontró el recurso.";
  return e.bodyText || "Error de API.";
}

export function useAuthGate() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();
  const show = useNoticeStore((s) => s.show);

  const goLogin = useCallback(
    (message?: string) => {
    show(message ?? "Iniciá sesión para continuar.", { variant: "warning" });
    navigate("/login", { replace: true, state: { from: location.pathname } });
    },
    [location.pathname, navigate, show],
  );

  const ensureAuthed = useCallback(() => {
    if (status === "authed") return true;
    goLogin("Iniciá sesión para editar o guardar cambios.");
    return false;
  }, [goLogin, status]);

  const info = useCallback(
    (message: string) => {
    show(message, { variant: "info" });
    },
    [show],
  );

  const handleAuthError = useCallback(
    (e: unknown) => {
    if (e instanceof AuthRequiredError) {
      goLogin(e.message === "session_expired" ? "Tu sesión expiró. Volvé a ingresar." : undefined);
      return true;
    }
    return false;
    },
    [goLogin],
  );

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    if (!ensureAuthed()) return null;
    try {
      return await fn();
    } catch (e) {
      if (handleAuthError(e)) return null;
      if (e instanceof ApiError) {
        // eslint-disable-next-line no-console
        console.error("[useAuthGate]", { status: e.status, bodyText: e.bodyText, requestId: e.requestId, url: e.url });
        show(friendlyApiMessage(e), { variant: "error" });
        return null;
      }
      if (e instanceof Error) show(e.message || "Error", { variant: "error" });
      return null;
    }
  }, [ensureAuthed, handleAuthError, show]);

  return useMemo(() => ({ ensureAuthed, handleAuthError, run, info }), [ensureAuthed, handleAuthError, run, info]);
}

