import { useEffect, useMemo, useState } from "react";
import { apiAdminListUsers, apiAdminPatchUserRole, type AdminUser } from "../api/admin";
import { Button, Pill } from "../ui/ui";
import { useAuthStore } from "../state/useAuthStore";
import { useAuthGate } from "../auth/useAuthGate";
import { useNavigate } from "react-router-dom";

export function AdminUsersPage() {
  const me = useAuthStore((s) => s.user);
  const { run, info } = useAuthGate();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const isAdmin = (me?.role ?? "user") === "admin";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await run(apiAdminListUsers);
      if (!alive) return;
      setUsers(res?.users ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [run]);

  async function refreshUsers() {
    setLoading(true);
    const res = await run(apiAdminListUsers);
    setUsers(res?.users ?? []);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const byRole = new Map<string, number>();
    for (const u of users) byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1);
    return byRole;
  }, [users]);

  if (!isAdmin) {
    return (
      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Acceso denegado</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          Necesitás rol <strong>admin</strong> para ver esta pantalla.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>Usuarios</h1>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
            {loading ? "cargando…" : `${users.length} total`} ·{" "}
            {["admin", "user", "viewer"].map((r) => `${r}:${stats.get(r) ?? 0}`).join(" · ")}
          </div>
        </div>
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              {["Email", "Nombre", "Role", "Acciones"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--color-text-secondary)",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    borderBottom: "0.5px solid var(--color-border-tertiary)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 800 }}>
                  {u.email}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                  {u.name ?? "—"}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                    {u.role}
                  </Pill>
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {(["admin", "user", "viewer"] as const).map((r) => (
                      <Button
                        key={r}
                        type="button"
                        disabled={u.role === r}
                        onClick={() => {
                          void run(async () => {
                            const res = await apiAdminPatchUserRole(u.id, r);
                            const nextRole = res?.user.role ?? r;
                            setUsers((s) => s.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)));
                            info(`Rol actualizado: ${u.email} → ${nextRole}`);
                            await refreshUsers();

                            // If admin demotes themself, exit Admin immediately.
                            if (me?.id && u.id === me.id && nextRole !== "admin") {
                              info("Tu rol cambió. Saliendo de Admin…");
                              navigate("/dashboard", { replace: true });
                            }
                          });
                        }}
                      >
                        {r}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

