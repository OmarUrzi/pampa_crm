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

  const [filter, setFilter] = useState<"Todos" | Exclude<EventoCommsTipo, "Mail"> | "Gmail">("Todos");
  const [gmail, setGmail] = useState<GmailComm[]>([]);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [gmailOpen, setGmailOpen] = useState<GmailComm | null>(null);
  const [gmailTick, setGmailTick] = useState(0);

  useEffect(() => {
    let alive = true;
    async function refresh(): Promise<GmailComm[]> {
      setLoadingGmail(true);
      try {
        const res = await gate.run(async () => await apiEventoGmailComms(eventoId));
        if (!alive) return;
        const next = (res?.messages ?? []) as GmailComm[];
        setGmail(next);
        return next;
      } finally {
        if (alive) setLoadingGmail(false);
      }
    }

    // Initial fetch on tab open.
    void refresh();

    // Low-request strategy: backoff polling only while user is looking at Gmail/Todos,
    // and pause when tab is not visible.
    const shouldPoll = filter === "Gmail" || filter === "Todos";
    if (!shouldPoll) return () => {
      alive = false;
    };

    let delayMs = 12_000;
    let lastTopKey = "";
    let t: any = null;
    function schedule() {
      if (!alive) return;
      if (document.visibilityState !== "visible") {
        // Check later; don't spam while hidden.
        t = setTimeout(schedule, 60_000);
        return;
      }
      t = setTimeout(async () => {
        const next = await refresh();
        const top = next?.[0];
        const topKey = top ? `${top.id}:${top.at}:${top.subject ?? ""}:${top.snippet ?? ""}` : "";
        const changed = topKey && topKey !== lastTopKey;
        if (changed) {
          lastTopKey = topKey;
          delayMs = 12_000; // stay responsive while messages are flowing
        } else {
          // backoff up to 2 minutes
          delayMs = Math.min(120_000, delayMs === 12_000 ? 30_000 : delayMs === 30_000 ? 60_000 : 120_000);
        }
        schedule();
      }, delayMs);
    }
    schedule();

    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [eventoId, filter, gate, gmailTick]);

  const filtered = useMemo(() => {
    if (filter === "Todos") return comms;
    if (filter === "Gmail") return [];
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Gmail (auto)</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{loadingGmail ? "actualizando…" : ""}</div>
              <button
                type="button"
                onClick={() => setGmailTick((x) => x + 1)}
                style={{
                  border: "0.5px solid var(--color-border-tertiary)",
                  background: "transparent",
                  color: "var(--color-text-secondary)",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                }}
                title="Forzar refresh"
              >
                Actualizar
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {gmail.map((m) => {
              const mailbox = (m.mailbox ?? "").trim().toLowerCase();
              const from = (m.fromEmail ?? "").trim().toLowerCase();
              const isOut = !!mailbox && !!from && mailbox === from;
              const bg = isOut ? "var(--color-primary-subtle)" : "var(--color-background-secondary)";
              const head = isOut ? `vos` : (m.fromEmail ?? "—");
              const to = Array.isArray(m.toEmails) ? m.toEmails.filter(Boolean) : [];
              const subject = (m.subject ?? "").trim() || "(sin asunto)";
              const snippet = (m.snippet ?? "").trim() || "(sin contenido)";
              return (
                <div
                  key={m.id}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: isOut ? "flex-end" : "flex-start",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isOut ? "row-reverse" : "row", maxWidth: "92%" }}>
                    {avatar(head, isOut ? "rgba(234,101,54,0.18)" : "rgba(59,130,246,0.18)", isOut ? "#EA6536" : "#3B82F6")}
                    <button
                      type="button"
                      onClick={() => setGmailOpen(m)}
                      style={{
                        maxWidth: 720,
                        width: "min(720px, 100%)",
                        textAlign: "left",
                        padding: "10px 13px",
                        borderRadius: 12,
                        border: "0.5px solid var(--color-border-tertiary)",
                        background: bg,
                        cursor: "pointer",
                      }}
                      title="Ver detalles"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 900 }}>
                          {head}
                          <span style={{ fontWeight: 700, color: "var(--color-text-secondary)" }}>
                            {" "}
                            {isOut ? "→" : "·"} {isOut ? (to.join(", ") || "—") : (m.mailbox ?? "—")}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--color-text-secondary)", flexShrink: 0 }}>
                          {new Date(m.at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {subject}
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2 as any, WebkitBoxOrient: "vertical" as any }}>
                        {snippet}
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
            {!gmail.length ? (
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                No hay mensajes Gmail asociados (o falta sync/mailboxes/contactos con email).
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {gmailOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setGmailOpen(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(760px, 96vw)",
              borderRadius: 14,
              border: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-background-primary)",
              boxShadow: "var(--shadow-lg)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>
                {(gmailOpen.subject ?? "").trim() || "(sin asunto)"}
              </div>
              <button
                type="button"
                onClick={() => setGmailOpen(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 14,
                }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 6, display: "grid", gap: 4 }}>
              <div><strong>Mailbox:</strong> {gmailOpen.mailbox}</div>
              <div><strong>De:</strong> {gmailOpen.fromEmail ?? "—"}</div>
              <div><strong>Para:</strong> {(gmailOpen.toEmails ?? []).join(", ") || "—"}</div>
              <div><strong>Fecha:</strong> {new Date(gmailOpen.at).toLocaleString()}</div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55 }}>
              {(gmailOpen.bodyText ?? gmailOpen.snippet ?? "").trim() || "(sin contenido)"}
            </div>
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

