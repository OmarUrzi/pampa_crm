import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../api/client";
import { apiListMailboxes, apiMailboxCommsByEmail, apiSyncMailbox, type Mailbox } from "../api/mailboxes";
import { useAuthStore } from "../state/useAuthStore";
import { useAuthGate } from "../auth/useAuthGate";
import { Button, Pill } from "../ui/ui";

export function AdminMailboxesPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = (me?.role ?? "user") === "admin";
  const { run, info } = useAuthGate();

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingById, setSyncingById] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState("");
  const [messages, setMessages] = useState<
    Array<{ id: string; mailbox: string; fromEmail: string | null; toEmails: string[]; subject: string | null; snippet: string | null; at: string }>
  >([]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    setLoading(true);
    void run(async () => {
      const res = await apiListMailboxes();
      if (!alive) return;
      setMailboxes(res?.mailboxes ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [isAdmin, run]);

  const connectUrl = useMemo(() => `${API_BASE}/auth/google-gmail`, []);

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
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>
            Mailboxes (Google)
          </h1>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
            {loading ? "cargando…" : `${mailboxes.length} conectadas`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button
            type="button"
            onClick={() => {
              window.location.href = connectUrl;
            }}
          >
            + Conectar casilla
          </Button>
        </div>
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              {["Email", "Estado", "Acciones"].map((h) => (
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
            {mailboxes.map((m) => (
              <tr key={m.id}>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 800 }}>
                  {m.email}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                    connected
                  </Pill>
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <Button
                    type="button"
                    disabled={!!syncingById[m.id]}
                    onClick={() => {
                      void run(async () => {
                        setSyncingById((s) => ({ ...s, [m.id]: true }));
                        try {
                          const res = await apiSyncMailbox(m.id);
                          info(`Sync OK (${m.email}) · ${res?.upserted ?? 0} msgs`);
                        } finally {
                          setSyncingById((s) => ({ ...s, [m.id]: false }));
                        }
                      });
                    }}
                  >
                    {syncingById[m.id] ? "Syncing…" : "Sync"}
                  </Button>
                </td>
              </tr>
            ))}
            {!mailboxes.length && !loading ? (
              <tr>
                <td colSpan={3} style={{ padding: 12, color: "var(--color-text-secondary)", fontSize: 12 }}>
                  Todavía no hay casillas conectadas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Buscar comunicaciones por email de contacto</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contacto@empresa.com"
            style={{
              width: 260,
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 10,
              padding: "7px 11px",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-primary)",
              fontSize: 12,
            }}
          />
          <Button
            type="button"
            onClick={() => {
              void run(async () => {
                const res = await apiMailboxCommsByEmail(email.trim());
                setMessages(res?.messages ?? []);
                info(`Encontrados: ${res?.messages?.length ?? 0}`);
              });
            }}
          >
            Buscar
          </Button>
        </div>

        {messages.length ? (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ padding: 10, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900, fontSize: 12 }}>{m.subject ?? "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                    {new Date(m.at).toLocaleString()}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 3 }}>
                  <span style={{ fontWeight: 800 }}>{m.mailbox}</span> · de {m.fromEmail ?? "—"}
                </div>
                <div style={{ fontSize: 12, marginTop: 6 }}>{m.snippet ?? "—"}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

