import { useMemo, useState } from "react";
import { Chip } from "../../../ui/ui";
import { useAppStore } from "../../../state/useAppStore";
import { apiFetch } from "../../../api/client";
import { apiAiChat, apiCreateChatMessage } from "../../../api/chat";
import { refreshEventoDetailIntoStore } from "../../../api/hydrateEventoDetail";
import { useCanEdit } from "../../../auth/perms";
import { useAuthGate } from "../../../auth/useAuthGate";
import { useNoticeStore } from "../../../state/useNoticeStore";

export function ChatTab({ eventoId }: { eventoId: string }) {
  const chat = useAppStore((s) => s.chatByEventoId[eventoId] ?? []);
  const activeUser = useAppStore((s) => s.activeUser);
  const send = useAppStore((s) => s.chatSend);
  const canEdit = useCanEdit();
  const gate = useAuthGate();
  const showNotice = useNoticeStore((s) => s.show);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

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
                        background: "var(--color-primary-subtle)",
                        border: "0.5px solid var(--color-border-primary)",
                      }),
                }}
              >
                <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0, color: "var(--color-text-primary)" }}>
                  {m.m}
                </p>
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
              if (sending) return;
              setSending(true);
              send(eventoId, q);
              try {
                await gate.run(async () => {
                  await apiCreateChatMessage(eventoId, { role: "user", msg: q });
                  const res = await apiAiChat(eventoId, q);
                  if (res?.fallbackFromOpenAi) {
                    showNotice("OpenAI sin cuota; respondimos con Claude.", { variant: "info" });
                  }
                  await apiCreateChatMessage(eventoId, { role: "ai", msg: res?.response ?? "—" });
                  await refreshEventoDetailIntoStore(eventoId);
                });
              } finally {
                setSending(false);
              }
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
            if (e.key !== "Enter") return;
            if (!text.trim() || sending) return;
            const msg = text.trim();
            setText("");
            void (async () => {
              setSending(true);
              send(eventoId, msg);
              try {
                await gate.run(async () => {
                  await apiCreateChatMessage(eventoId, { role: "user", msg });
                  const res = await apiAiChat(eventoId, msg);
                  if (res?.fallbackFromOpenAi) {
                    showNotice("OpenAI sin cuota; respondimos con Claude.", { variant: "info" });
                  }
                  await apiCreateChatMessage(eventoId, { role: "ai", msg: res?.response ?? "—" });
                  await refreshEventoDetailIntoStore(eventoId);
                });
              } finally {
                setSending(false);
              }
            })();
          }}
          disabled={!canEdit}
        />
        <button
          type="button"
          onClick={() => {
            if (!text.trim() || sending) return;
            const msg = text.trim();
            setText("");
            void (async () => {
              setSending(true);
              send(eventoId, msg);
              try {
                await gate.run(async () => {
                  await apiCreateChatMessage(eventoId, { role: "user", msg });
                  const res = await apiAiChat(eventoId, msg);
                  if (res?.fallbackFromOpenAi) {
                    showNotice("OpenAI sin cuota; respondimos con Claude.", { variant: "info" });
                  }
                  await apiCreateChatMessage(eventoId, { role: "ai", msg: res?.response ?? "—" });
                  await refreshEventoDetailIntoStore(eventoId);
                });
              } finally {
                setSending(false);
              }
            })();
          }}
          style={{
            padding: "6px 12px",
            borderRadius: 10,
            border: "none",
            background: "var(--color-primary)",
            color: "#fff",
            cursor: canEdit && !sending ? "pointer" : "not-allowed",
            opacity: canEdit && !sending ? 1 : 0.6,
            fontSize: 12,
            fontWeight: 800,
          }}
          disabled={!canEdit || sending}
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

