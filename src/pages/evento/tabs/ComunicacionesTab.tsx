import { useEffect, useMemo, useState } from "react";
import { Button, Chip } from "../../../ui/ui";
import { useAppStore } from "../../../state/useAppStore";
import type { EventoComm, EventoCommsTipo } from "../../../types";
import { apiCreateComm } from "../../../api/comms";
import { refreshEventoDetailIntoStore } from "../../../api/hydrateEventoDetail";
import { useCanEdit } from "../../../auth/perms";
import { useAuthGate } from "../../../auth/useAuthGate";
import { apiEventoGmailComms, type GmailComm } from "../../../api/gmailComms";

function avatar(name: string, bg: string, fg: string) {
  const init = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {init}
    </div>
  );
}

export function ComunicacionesTab({ eventoId }: { eventoId: string }) {
  const activeUser = useAppStore((s) => s.activeUser);
  const comms = useAppStore((s) => s.commsByEventoId[eventoId] ?? []);
  const canEdit = useCanEdit();
  const gate = useAuthGate();

  const [filter, setFilter] = useState<"Todos" | EventoCommsTipo | "Gmail">("Todos");
  const [gmail, setGmail] = useState<GmailComm[]>([]);

  useEffect(() => {
    void gate.run(async () => {
      const res = await apiEventoGmailComms(eventoId);
      setGmail(res?.messages ?? []);
    });
  }, [eventoId, gate]);

  const filtered = useMemo(() => {
    if (filter === "Todos") return comms;
    if (filter === "Gmail") return comms;
    return comms.filter((c) => c.tipo === filter);
  }, [comms, filter]);

  async function registerFake() {
    await gate.run(async () => {
      await apiCreateComm(eventoId, {
        de: `${activeUser} V.`,
        msg: "Seguimiento: ¿pudieron revisar la cotización? Quedo atenta a comentarios.",
        horaLabel: "Recién",
        dir: "out",
        tipo: "WhatsApp",
      });
      await refreshEventoDetailIntoStore(eventoId);
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 7 }}>
          <Chip type="button" active={filter === "Todos"} onClick={() => setFilter("Todos")}>
            Todos
          </Chip>
          <Chip type="button" active={filter === "Mail"} onClick={() => setFilter("Mail")}>
            Mail
          </Chip>
          <Chip type="button" active={filter === "WhatsApp"} onClick={() => setFilter("WhatsApp")}>
            WhatsApp
          </Chip>
          <Chip type="button" active={filter === "Gmail"} onClick={() => setFilter("Gmail")}>
            Gmail
          </Chip>
        </div>
        <Button variant="primary" type="button" onClick={registerFake} disabled={!canEdit}>
          + Registrar
        </Button>
      </div>

      {filter === "Gmail" || filter === "Todos" ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Gmail (auto)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gmail.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: "10px 13px",
                  borderRadius: 12,
                  border: "0.5px solid var(--color-border-tertiary)",
                  background: "var(--color-background-secondary)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 900 }}>{m.subject ?? "—"}</div>
                  <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
                    {new Date(m.at).toLocaleString()}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                  <strong>{m.mailbox}</strong> · de {m.fromEmail ?? "—"}
                </div>
                <div style={{ fontSize: 12 }}>{m.snippet ?? "—"}</div>
              </div>
            ))}
            {!gmail.length ? (
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                No hay mensajes Gmail asociados (o falta sync/mailboxes/contactos con email).
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((m) => {
          const isOut = m.dir === "out";
          const bg = isOut ? "rgba(234,101,54,0.15)" : "rgba(59,130,246,0.15)";
          const fg = isOut ? "#EA6536" : "#3B82F6";
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                flexDirection: isOut ? "row-reverse" : "row",
              }}
            >
              {avatar(m.de, bg, fg)}
              <div
                style={{
                  maxWidth: "80%",
                  padding: "10px 13px",
                  borderRadius: 12,
                  border: "0.5px solid var(--color-border-tertiary)",
                  background: "var(--color-background-secondary)",
                }}
              >
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>{m.de}</span>
                  <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
                    {m.tipo} · {m.horaLabel}
                  </span>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>{m.msg}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

