import styles from "./Sidebar.module.css";
import { NavLink, useNavigate } from "react-router-dom";
import { useAppStore } from "../../state/useAppStore";
import { useAuthStore } from "../../state/useAuthStore";
import { useEffect, useState } from "react";

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("theme") === "dark";
  });

  useEffect(() => {
    const html = document.documentElement;
    if (dark) {
      html.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      html.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  return [dark, setDark] as const;
}

export function Sidebar() {
  const activeUser = useAppStore((s) => s.activeUser);
  const setActiveUser = useAppStore((s) => s.setActiveUser);
  const authStatus = useAuthStore((s) => s.status);
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [dark, setDark] = useDarkMode();

  const isAdmin = (authUser?.role ?? "user") === "admin";

  const mainNav = [
    { to: "/dashboard", label: "Dashboard", icon: "▦" },
    { to: "/eventos", label: "Eventos", icon: "◈" },
    { to: "/clientes", label: "Clientes", icon: "◉" },
    { to: "/proveedores", label: "Proveedores", icon: "◎" },
    { to: "/catalogo", label: "Catálogo", icon: "◫" },
    { to: "/estadisticas", label: "Estadísticas", icon: "◷" },
  ] as const;

  const adminNav = [
    { to: "/admin/users", label: "Usuarios", icon: "◈" },
    { to: "/admin/mailboxes", label: "Mailboxes", icon: "◉" },
    { to: "/admin/ai", label: "AI", icon: "◎" },
    { to: "/admin/agencia", label: "Agencia", icon: "◫" },
  ] as const;

  return (
    <div className={styles.root}>
      {/* Logo */}
      <div className={styles.brand}>
        <img
          src="/pampa-logo.png"
          alt="Pampa CRM"
          className={styles.logoImg}
        />
        <div className={styles.brandText}>
          <div className={styles.logo}>Pampa CRM</div>
          <div className={styles.subtitle}>Events · Bariloche</div>
        </div>
      </div>

      {/* Main nav */}
      <nav className={styles.nav}>
        {mainNav.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            className={({ isActive }) =>
              `${styles.nb} ${isActive ? styles.on : ""}`
            }
          >
            <span className={styles.navIcon}>{i.icon}</span>
            {i.label}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div style={{ margin: "10px 0 2px", padding: "0 8px" }}>
              <div className={styles.navLabel}>Admin</div>
            </div>
            {adminNav.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  `${styles.nb} ${isActive ? styles.on : ""}`
                }
              >
                <span className={styles.navIcon}>{i.icon}</span>
                {i.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Account footer */}
      <div className={styles.account}>
        {/* User switcher */}
        <button
          className={`${styles.nb} ${activeUser === "Laura" ? styles.on : ""}`}
          type="button"
          onClick={() => setActiveUser("Laura")}
        >
          <span className={`${styles.avatar} ${styles.avatarLaura}`}>LV</span>
          Laura V.
        </button>
        <button
          className={`${styles.nb} ${activeUser === "Melanie" ? styles.on : ""}`}
          type="button"
          onClick={() => setActiveUser("Melanie")}
        >
          <span className={`${styles.avatar} ${styles.avatarMel}`}>MD</span>
          Melanie D.
        </button>

        {/* Auth info */}
        {authStatus === "authed" && (
          <div className={styles.accountUser}>
            <div className={styles.accountName}>{authUser?.name ?? "Sesión activa"}</div>
            <div className={styles.accountEmail}>{authUser?.email}</div>
            <div className={styles.accountActions}>
              <button
                type="button"
                className={styles.accountBtn}
                onClick={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
              >
                Salir
              </button>
              <button
                type="button"
                className={styles.themeBtn}
                onClick={() => setDark((d) => !d)}
                title={dark ? "Modo claro" : "Modo oscuro"}
              >
                {dark ? "☀" : "◑"}
              </button>
            </div>
          </div>
        )}

        {authStatus !== "authed" && (
          <div style={{ padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--color-sidebar-fg)" }}>Sin sesión</span>
            <button
              type="button"
              className={styles.accountBtn}
              onClick={() => navigate("/login")}
            >
              Ingresar
            </button>
            <button
              type="button"
              className={styles.themeBtn}
              onClick={() => setDark((d) => !d)}
              title={dark ? "Modo claro" : "Modo oscuro"}
            >
              {dark ? "☀" : "◑"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
