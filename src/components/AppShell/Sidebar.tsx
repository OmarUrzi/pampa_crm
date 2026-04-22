import styles from "./Sidebar.module.css";
import { NavLink, useNavigate } from "react-router-dom";
import { useAppStore } from "../../state/useAppStore";
import { useAuthStore } from "../../state/useAuthStore";
import { Button } from "../../ui/ui";

export function Sidebar() {
  const activeUser = useAppStore((s) => s.activeUser);
  const setActiveUser = useAppStore((s) => s.setActiveUser);
  const authStatus = useAuthStore((s) => s.status);
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const nav = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/eventos", label: "Eventos" },
    { to: "/clientes", label: "Clientes" },
    { to: "/proveedores", label: "Proveedores" },
    { to: "/catalogo", label: "Catálogo" },
    { to: "/estadisticas", label: "Estadísticas" },
    ...((authUser?.role ?? "user") === "admin"
      ? [
          { to: "/admin/users", label: "Admin · Usuarios" },
          { to: "/admin/mailboxes", label: "Admin · Mailboxes" },
        ]
      : []),
  ] as const;

  return (
    <div className={styles.root}>
      <div className={styles.brand}>
        <div className={styles.logo}>Pampa</div>
        <div className={styles.subtitle}>Events · Bariloche</div>
      </div>

      <nav className={styles.nav}>
        {nav.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            className={({ isActive }) =>
              `${styles.nb} ${isActive ? styles.on : ""}`
            }
          >
            {i.label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.account}>
        <div className={styles.accountLabel}>Cuenta</div>

        <div style={{ padding: "10px 10px 6px", color: "rgba(255,255,255,0.78)", fontSize: 12 }}>
          {authStatus === "authed" ? (
            <div>
              <div style={{ fontWeight: 700, color: "#fff" }}>{authUser?.name ?? "Sesión activa"}</div>
              <div style={{ opacity: 0.9 }}>{authUser?.email}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <Button
                  type="button"
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                >
                  Salir
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ opacity: 0.9 }}>Sin sesión</span>
              <Button type="button" onClick={() => navigate("/login")}>
                Ingresar
              </Button>
            </div>
          )}
        </div>

        <button
          className={`${styles.nb} ${activeUser === "Laura" ? styles.on : ""}`}
          type="button"
          onClick={() => setActiveUser("Laura")}
        >
          <span className={`${styles.avatar} ${styles.avatarLaura}`}>LV</span>
          Laura V.
        </button>

        <button
          className={`${styles.nb} ${
            activeUser === "Melanie" ? styles.on : ""
          }`}
          type="button"
          onClick={() => setActiveUser("Melanie")}
        >
          <span className={`${styles.avatar} ${styles.avatarMel}`}>MD</span>
          Melanie D.
        </button>
      </div>
    </div>
  );
}

