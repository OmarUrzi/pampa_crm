import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./LoginPage.module.css";
import { Button } from "../ui/ui";
import { useAuthStore } from "../state/useAuthStore";
import { API_BASE } from "../api/client";
import { NoticeBanner } from "../components/NoticeBanner/NoticeBanner";
import { useNoticeStore } from "../state/useNoticeStore";

type LocationState = { from?: string } | null;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginDev = useAuthStore((s) => s.loginDev);
  const showNotice = useNoticeStore((s) => s.show);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = useMemo(() => {
    const st = (location.state as LocationState) ?? null;
    return st?.from ?? "/dashboard";
  }, [location.state]);

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem("pampa-crm:auth_notice");
      if (!msg) return;
      sessionStorage.removeItem("pampa-crm:auth_notice");
      showNotice(msg, { variant: "warning", ttlMs: 6000 });
    } catch {
      // ignore
    }
  }, [showNotice]);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <NoticeBanner />
        <div className={styles.brand}>
          <div className={styles.logo}>Pampa</div>
          <div className={styles.subtitle}>CRM · Events</div>
        </div>

        <div className={styles.title}>Ingresar</div>
        <p className={styles.hint}>
          En dev, el backend expone <code>/auth/dev-login</code> para iniciar sesión por email (si está permitido).
        </p>

        <div className={styles.grid}>
          <div>
            <div className={styles.fieldLabel}>Email</div>
            <input
              className={styles.input}
              value={email}
              placeholder="tu@pampa.com"
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div>
            <div className={styles.fieldLabel}>Nombre (opcional)</div>
            <input
              className={styles.input}
              value={name}
              placeholder="Laura V."
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.error}>{err}</div>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setErr(null);
                setBusy(true);
                try {
                  await loginDev({ email, name });
                  navigate(from, { replace: true });
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "login_failed";
                  setErr(msg === "API 403: email_not_allowed" || msg === "email_not_allowed" ? "Email no autorizado." : msg);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Ingresando..." : "Ingresar"}
            </Button>
          </div>

          <div className={styles.row} style={{ marginTop: 2 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
              ¿Tenés Google OAuth configurado?
            </div>
            <Button
              type="button"
              onClick={async () => {
                setErr(null);
                // Preflight: si el server no tiene OAuth configurado, devolvemos un error claro.
                // Si está ok, navegamos (no usar fetch para OAuth flow).
                try {
                  const res = await fetch(`${API_BASE}/auth/google`, { method: "GET" });
                  if (res.status === 501) {
                    setErr("Google OAuth no está configurado en el backend.");
                    return;
                  }
                } catch {
                  // si no podemos preflight (CORS/red), igual intentamos navegar
                }
                sessionStorage.setItem("pampa-crm:login_from", from);
                window.location.href = `${API_BASE}/auth/google`;
              }}
            >
              Ingresar con Google
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

