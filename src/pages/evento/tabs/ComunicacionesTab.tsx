import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip } from "../../../ui/ui";
import { useAppStore } from "../../../state/useAppStore";
import type { EventoComm, EventoCommsTipo } from "../../../types";
import { apiCreateComm } from "../../../api/comms";
import { refreshEventoDetailIntoStore } from "../../../api/hydrateEventoDetail";
import { useCanEdit } from "../../../auth/perms";
import { useAuthGate } from "../../../auth/useAuthGate";
import { apiEventoGmailComms, apiEventoGmailThread, type GmailComm } from "../../../api/gmailComms";
import { apiEventoWhatsAppComms, type WhatsAppComm } from "../../../api/whatsappComms";
import { API_BASE, getToken } from "../../../api/client";

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
  const [whats, setWhats] = useState<WhatsAppComm[]>([]);
  const [loadingWhats, setLoadingWhats] = useState(false);
  const [whatsTick, setWhatsTick] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [threadAll, setThreadAll] = useState<GmailComm[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  function cleanEmailText(x: string) {
    const raw = String(x ?? "").replace(/\r\n/g, "\n");
    const lines = raw.split("\n");
    const out: string[] = [];
    const meaningfulCount = () => out.filter((l) => l.trim().length > 0).length;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i] ?? "";
      const s = ln.trimEnd();
      const t = s.trim();
      if (!t) {
        // keep a single blank line max
        if (out.length && out[out.length - 1] !== "") out.push("");
        continue;
      }
      if (t.startsWith(">")) continue; // quoted line
      // Stop when we hit the quoted/reply “mamushka”.
      if (/^-----\s*(original message|mensaje original|forwarded message|mensaje reenviado)\s*-----$/i.test(t)) break;
      // Outlook/Hotmail often injects a header block (De/Enviado/Para/Asunto) before the quoted message.
      // If we see that and we haven't captured any meaningful content yet, stop to avoid the “mamushka”.
      if (/^(from|de):\s/i.test(t) && meaningfulCount() === 0) break;
      if (/^(sent|enviado):\s/i.test(t) && meaningfulCount() === 0) break;
      if (/^(to|para):\s/i.test(t) && meaningfulCount() === 0) break;
      if (/^(subject|asunto):\s/i.test(t) && meaningfulCount() === 0) break;
      // If we've already captured some content, a header block indicates the start of the quoted email.
      if (/^(from|de):\s/i.test(t) && meaningfulCount() > 0) break;
      if (/^(sent|enviado):\s/i.test(t) && meaningfulCount() > 0) break;
      if (/^on\s.+$/i.test(t) && /wrote:$/i.test((lines[i + 1] ?? "").trim())) break; // split “On …” + “wrote:”
      if (/wrote:\s*$/i.test(t)) break;
      if (/^on .+wrote:\s*$/i.test(t)) break;
      if (/^el .+escribi[oó]:\s*$/i.test(t)) break;
      if (/escribi[oó]:\s*$/i.test(t)) break;
      out.push(s);
    }
    return out.join("\n").trim();
  }

  useEffect(() => {
    let alive = true;
    async function refresh(): Promise<GmailComm[]> {
      setLoadingGmail(true);
      try {
        const res = await gate.run(async () => await apiEventoGmailComms(eventoId));
        if (!alive) return [];
        const next = (res?.messages ?? []) as GmailComm[];
        setGmail(next);
        return next;
      } finally {
        if (alive) setLoadingGmail(false);
      }
    }

    // Initial fetch on tab open.
    void refresh();

    // Prefer SSE (no polling). Fallback to backoff polling if SSE can't connect.
    const shouldPoll = filter === "Gmail" || filter === "Todos";
    if (!shouldPoll) return () => {
      alive = false;
    };

    let usedFallbackPolling = false;
    let delayMs = 30_000;
    let t: any = null;
    async function pollLoop() {
      if (!alive) return;
      if (document.visibilityState !== "visible") {
        t = setTimeout(pollLoop, 60_000);
        return;
      }
      await refresh();
      t = setTimeout(pollLoop, delayMs);
    }

    // SSE: reconnects automatically. When an event arrives, do a single refresh.
    const token = getToken() ?? "";
    const url = `${API_BASE}/eventos/${eventoId}/gmail-stream?token=${encodeURIComponent(token)}`;
    try {
      const es = new EventSource(url);
      esRef.current = es;
      es.addEventListener("gmail", () => {
        void refresh();
      });
      es.addEventListener("ready", () => {
        // connected
      });
      es.onerror = () => {
        // If SSE is blocked by proxy/CORS, fall back to low-rate polling.
        if (usedFallbackPolling) return;
        usedFallbackPolling = true;
        try {
          es.close();
        } catch {
          // ignore
        }
        void pollLoop();
      };
    } catch {
      usedFallbackPolling = true;
      void pollLoop();
    }

    return () => {
      alive = false;
      if (t) clearTimeout(t);
      if (esRef.current) {
        try {
          esRef.current.close();
        } catch {
          // ignore
        }
        esRef.current = null;
      }
    };
  }, [eventoId, filter, gate, gmailTick]);

  useEffect(() => {
    let alive = true;
    async function refresh(): Promise<WhatsAppComm[]> {
      setLoadingWhats(true);
      try {
        const res = await gate.run(async () => await apiEventoWhatsAppComms(eventoId));
        if (!alive) return [];
        const next = (res?.messages ?? []) as WhatsAppComm[];
        setWhats(next);
        return next;
      } finally {
        if (alive) setLoadingWhats(false);
      }
    }

    const shouldFetch = filter === "Todos" || filter === "WhatsApp";
    if (!shouldFetch) return () => {
      alive = false;
    };

    void refresh();

    return () => {
      alive = false;
    };
  }, [eventoId, filter, gate, whatsTick]);

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
          {(() => {
            const sorted = [...gmail].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
            const threads = new Map<string, GmailComm[]>();
            for (const m of sorted) {
              const key = (m.threadId ?? "").trim() || m.id;
              const list = threads.get(key) ?? [];
              list.push(m);
              threads.set(key, list);
            }
            const threadRows = Array.from(threads.entries()).map(([k, list]) => {
              const byTimeAsc = [...list].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
              const last = byTimeAsc[byTimeAsc.length - 1]!;
              return { threadKey: k, list: byTimeAsc, last };
            });
            threadRows.sort((a, b) => new Date(b.last.at).getTime() - new Date(a.last.at).getTime());

            if (!threadRows.length) {
              return (
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                  No hay mensajes Gmail asociados (o falta sync/mailboxes/contactos con email).
                </div>
              );
            }

            return (
              <div style={{ display: "grid", gap: 10 }}>
                {threadRows.map((t) => {
                  const last = t.last;
                  const subject = (last.subject ?? "").trim() || "(sin asunto)";
                  const preview = cleanEmailText(last.bodyText ?? last.snippet ?? "") || "(sin contenido)";
                  const isOpen = openThread === t.threadKey;
                  return (
                    <div
                      key={t.threadKey}
                      style={{
                        border: "0.5px solid var(--color-border-tertiary)",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "var(--color-background-primary)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenThread((cur) => (cur === t.threadKey ? null : t.threadKey))}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: "var(--color-background-secondary)",
                          padding: "10px 12px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "baseline",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {subject}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                            {preview}
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--color-text-secondary)", flexShrink: 0 }}>
                          {new Date(last.at).toLocaleString()} {isOpen ? "▴" : "▾"}
                        </div>
                      </button>

                      {isOpen ? (
                        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                          {t.list.slice(-6).map((m) => {
                            const mailbox = (m.mailbox ?? "").trim().toLowerCase();
                            const from = (m.fromEmail ?? "").trim().toLowerCase();
                            const isOut = !!mailbox && !!from && mailbox === from;
                            const bg = isOut ? "var(--color-primary-subtle)" : "var(--color-background-secondary)";
                            const head = isOut ? "vos" : (m.fromEmail ?? "—");
                            const to = Array.isArray(m.toEmails) ? m.toEmails.filter(Boolean) : [];
                            const body = cleanEmailText(m.bodyText ?? m.snippet ?? "") || "(sin contenido)";
                            return (
                              <div key={m.id} style={{ width: "100%", display: "flex", justifyContent: isOut ? "flex-end" : "flex-start" }}>
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
                                    <div style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{body}</div>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {t.list.length > 6 ? (
                            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                              Mostrando últimos 6 de {t.list.length}. (El resto se oculta para evitar “mamushka”.)
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : null}

      {filter === "WhatsApp" || filter === "Todos" ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>WhatsApp (auto)</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{loadingWhats ? "actualizando…" : ""}</div>
              <button
                type="button"
                onClick={() => setWhatsTick((x) => x + 1)}
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

          {(() => {
            const sorted = [...whats].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
            if (!sorted.length) {
              return (
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                  No hay mensajes WhatsApp asociados (o faltan teléfonos en contactos/proveedores).
                </div>
              );
            }
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sorted.map((m) => {
                  const who = (m.fromPhone ?? "").trim() || (m.toPhone ?? "").trim() || "—";
                  const body = (m.bodyText ?? "").trim() || "(sin contenido)";
                  return (
                    <div
                      key={m.id}
                      style={{
                        border: "0.5px solid var(--color-border-tertiary)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "var(--color-background-primary)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                        <div style={{ fontSize: 11, fontWeight: 900 }}>
                          {who}{" "}
                          <span style={{ fontWeight: 700, color: "var(--color-text-secondary)" }}>
                            · {m.provider}
                            {m.waChatId ? ` · ${m.waChatId}` : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--color-text-secondary)", flexShrink: 0 }}>
                          {new Date(m.at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{body}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
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

            {gmailOpen.threadId ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      if (!gmailOpen.threadId) return;
                      setThreadLoading(true);
                      try {
                        const res = await gate.run(async () => await apiEventoGmailThread(eventoId, gmailOpen.threadId!));
                        const list = (res?.messages ?? []) as GmailComm[];
                        setThreadAll(list);
                      } finally {
                        setThreadLoading(false);
                      }
                    })();
                  }}
                  disabled={threadLoading}
                  style={{
                    border: "0.5px solid var(--color-border-tertiary)",
                    background: "transparent",
                    color: "var(--color-text-secondary)",
                    borderRadius: 10,
                    padding: "6px 10px",
                    cursor: threadLoading ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 800,
                    opacity: threadLoading ? 0.6 : 1,
                  }}
                >
                  {threadLoading ? "Cargando hilo…" : "Ver hilo completo"}
                </button>
                {threadAll ? (
                  <button
                    type="button"
                    onClick={() => setThreadAll(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                      textDecoration: "underline",
                    }}
                  >
                    Ocultar
                  </button>
                ) : null}
              </div>
            ) : null}

            <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55 }}>
              {cleanEmailText(gmailOpen.bodyText ?? gmailOpen.snippet ?? "") || "(sin contenido)"}
            </div>

            {threadAll ? (
              <div
                style={{
                  marginTop: 12,
                  borderTop: "0.5px solid var(--color-border-tertiary)",
                  paddingTop: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Hilo completo</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "50vh", overflow: "auto" }}>
                  {threadAll.map((m) => {
                    const mailbox = (m.mailbox ?? "").trim().toLowerCase();
                    const from = (m.fromEmail ?? "").trim().toLowerCase();
                    const isOut = !!mailbox && !!from && mailbox === from;
                    const bg = isOut ? "var(--color-primary-subtle)" : "var(--color-background-secondary)";
                    const head = isOut ? "vos" : (m.fromEmail ?? "—");
                    const to = Array.isArray(m.toEmails) ? m.toEmails.filter(Boolean) : [];
                    const body = cleanEmailText(m.bodyText ?? m.snippet ?? "") || "(sin contenido)";
                    const subj = (m.subject ?? "").trim();
                    return (
                      <div key={m.id} style={{ width: "100%", display: "flex", justifyContent: isOut ? "flex-end" : "flex-start" }}>
                        <div style={{ maxWidth: "92%", border: "0.5px solid var(--color-border-tertiary)", background: bg, borderRadius: 12, padding: "10px 12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 900 }}>
                              {head}{" "}
                              <span style={{ fontWeight: 700, color: "var(--color-text-secondary)" }}>
                                {isOut ? "→" : "·"} {isOut ? (to.join(", ") || "—") : (m.mailbox ?? "—")}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: "var(--color-text-secondary)", flexShrink: 0 }}>
                              {new Date(m.at).toLocaleString()}
                            </div>
                          </div>
                          {subj ? (
                            <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>{subj}</div>
                          ) : null}
                          <div style={{ fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{body}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

