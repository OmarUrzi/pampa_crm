import { useMemo, useState } from "react";
import { Chip } from "../../../ui/ui";
import { useAppStore } from "../../../state/useAppStore";
import { apiFetch } from "../../../api/client";
import { apiCreateChatMessage } from "../../../api/chat";
import { refreshEventoDetailIntoStore } from "../../../api/hydrateEventoDetail";
import { useCanEdit } from "../../../auth/perms";
import { useAuthGate } from "../../../auth/useAuthGate";

export function ChatTab({ eventoId }: { eventoId: string }) {
  const chat = useAppStore((s) => s.chatByEventoId[eventoId] ?? []);
  const activeUser = useAppStore((s) => s.activeUser);
  const send = useAppStore((s) => s.chatSend);
  const canEdit = useCanEdit();
  const gate = useAuthGate();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const quick = useMemo(
    () => [
      "¿Cómo viene el margen?",
      "¿Qué proveedores no respondieron?",
      "¿Cuáles son los pagos pendientes?",
      "Resumime el estado general",
    ],
    [],
  );

  function avatarAi() {
    return (
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          background: "#1C2438",
          color: "#F07A52",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        AI
      </div>
    );
  }

  function avatarUser() {
    return (
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          background: activeUser === "Laura" ? "rgba(234,101,54,0.2)" : "rgba(29,158,117,0.2)",
          color: activeUser === "Laura" ? "#F07A52" : "#1D9E75",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {activeUser === "Laura" ? "LV" : "MD"}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14, minHeight: 160 }}>
        {chat.map((m) => {
          const isAi = m.r === "ai";
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                gap: 9,
                alignItems: "flex-start",
                flexDirection: isAi ? "row" : "row-reverse",
              }}
            >
              {isAi ? avatarAi() : avatarUser()}
              <div
                style={{
                  maxWidth: "85%",
                  padding: "9px 13px",
                  borderRadius: 12,
                  ...(isAi
                    ? {
                        background: "var(--color-background-secondary)",
                        border: "0.5px solid var(--color-border-tertiary)",
                      }
                    : {
                        background: "#FEF0EA",
                        border: "0.5px solid rgba(234,101,54,0.2)",
                      }),
                }}
              >
                <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>{m.m}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {quick.map((q) => (
          <Chip
            key={q}
            type="button"
            onClick={async () => {
              send(eventoId, q);
              await gate.run(async () => {
                // Persistimos user+ai como 2 msgs, y refrescamos para quedar con ids reales.
                await apiCreateChatMessage(eventoId, { role: "user", msg: q });
                await apiCreateChatMessage(eventoId, {
                  role: "ai",
                  msg: "OK — lo reviso y te respondo con un resumen.",
                });
                await refreshEventoDetailIntoStore(eventoId);
              });
            }}
            disabled={!canEdit}
          >
            {q}
          </Chip>
        ))}
        <Chip
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await gate.run(async () => {
                await apiFetch("/ai/ask", {
                  method: "POST",
                  body: JSON.stringify({ eventoId, prompt: "Resumime el estado general" }),
                });
              });
            } finally {
              setSaving(false);
            }
          }}
          disabled={!canEdit}
        >
          {saving ? "Guardando…" : "Guardar prompt (API)"}
        </Chip>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Preguntá sobre este evento..."
          style={{
            flex: 1,
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: 10,
            padding: "7px 11px",
            background: "var(--color-background-primary)",
            color: "var(--color-text-primary)",
            fontSize: 12,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (!text.trim()) return;
              (async () => {
                send(eventoId, text);
                await gate.run(async () => {
                  await apiCreateChatMessage(eventoId, { role: "user", msg: text });
                  await apiCreateChatMessage(eventoId, {
                    role: "ai",
                    msg: "OK — lo reviso y te respondo con un resumen.",
                  });
                  await refreshEventoDetailIntoStore(eventoId);
                });
              })();
              setText("");
            }
          }}
          disabled={!canEdit}
        />
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) return;
            (async () => {
              send(eventoId, text);
              await gate.run(async () => {
                await apiCreateChatMessage(eventoId, { role: "user", msg: text });
                await apiCreateChatMessage(eventoId, {
                  role: "ai",
                  msg: "OK — lo reviso y te respondo con un resumen.",
                });
                await refreshEventoDetailIntoStore(eventoId);
              });
            })();
            setText("");
          }}
          style={{
            padding: "6px 12px",
            borderRadius: 10,
            border: "none",
            background: "var(--color-primary)",
            color: "#fff",
            cursor: canEdit ? "pointer" : "not-allowed",
            opacity: canEdit ? 1 : 0.6,
            fontSize: 12,
            fontWeight: 800,
          }}
          disabled={!canEdit}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

