import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setToken } from "../api/client";
import { useAuthStore } from "../state/useAuthStore";
import { FullPageLoader } from "../components/FullPageLoader/FullPageLoader";

function readTokenFromHash() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  return params.get("token");
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    (async () => {
      const token = readTokenFromHash();
      if (token) setToken(token);
      await bootstrap();
      const from = sessionStorage.getItem("pampa-crm:login_from") || "/dashboard";
      sessionStorage.removeItem("pampa-crm:login_from");
      navigate(from, { replace: true });
    })();
  }, [bootstrap, navigate]);

  return <FullPageLoader label="Completando login…" />;
}

