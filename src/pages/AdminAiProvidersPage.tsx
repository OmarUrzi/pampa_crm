import { useEffect, useMemo, useState } from "react";
import { Button, Pill } from "../ui/ui";
import { useAuthStore } from "../state/useAuthStore";
import { useAuthGate } from "../auth/useAuthGate";
import { apiAdminListAiProviders, apiAdminUpsertAiProvider, type AiProvider } from "../api/admin";

type Row = {
  provider: AiProvider;
  hasKey: boolean;
  updatedAt: string | null;
};

export function AdminAiProvidersPage() {
  const me = useAuthStore((s) => s.user);
  const { run, info } = useAuthGate();
  const isAdmin = (me?.role ?? "user") === "admin";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [geminiKey, setGeminiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const byProvider = useMemo(() => {
    const m = new Map<AiProvider, Row>();
    for (const r of rows) m.set(r.provider, r);
    return m;
  }, [rows]);

  async function refresh() {
    setLoading(true);
    const res = await run(apiAdminListAiProviders);
    const list = (res?.providers ?? []).map((p) => ({
      provider: p.provider,
      hasKey: !p.revokedAt,
      updatedAt: p.updatedAt ?? null,
    })) as Row[];
    setRows(list);
    setLoading(false);
  }

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

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

  const gemini = byProvider.get("gemini");
  const anthropic = byProvider.get("anthropic");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>AI · Providers</h1>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
            {loading
              ? "cargando…"
              : "Gemini (Google AI Studio) para el chat del evento; Claude para Slides cuando lo implementemos."}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 900 }}>Google Gemini</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                API key de{" "}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  Google AI Studio
                </a>
                . Usada por defecto para el chat AI del evento (tier gratuito con límites).
              </div>
            </div>
            <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
              {gemini?.hasKey ? "conectado" : "sin key"}
            </Pill>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <input
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              style={{
                width: 360,
                border: "0.5px solid var(--color-border-secondary)",
                borderRadius: 10,
                padding: "7px 11px",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-primary)",
                fontSize: 12,
              }}
            />
            <Button
              variant="primary"
              type="button"
              disabled={!geminiKey.trim() || !!saving.gemini}
              onClick={() => {
                void run(async () => {
                  setSaving((s) => ({ ...s, gemini: true }));
                  try {
                    await apiAdminUpsertAiProvider("gemini", geminiKey.trim());
                    setGeminiKey("");
                    info("Gemini conectado.");
                    await refresh();
                  } finally {
                    setSaving((s) => ({ ...s, gemini: false }));
                  }
                });
              }}
            >
              {saving.gemini ? "Guardando…" : "Guardar key"}
            </Button>
            {gemini?.updatedAt ? (
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                actualizado: {new Date(gemini.updatedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 900 }}>Anthropic (Claude)</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                Opcional: respaldo si Gemini falla por cuota (modo auto), y para Slides cuando estén listos.
              </div>
            </div>
            <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
              {anthropic?.hasKey ? "conectado" : "sin key"}
            </Pill>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <input
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                width: 360,
                border: "0.5px solid var(--color-border-secondary)",
                borderRadius: 10,
                padding: "7px 11px",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-primary)",
                fontSize: 12,
              }}
            />
            <Button
              variant="primary"
              type="button"
              disabled={!anthropicKey.trim() || !!saving.anthropic}
              onClick={() => {
                void run(async () => {
                  setSaving((s) => ({ ...s, anthropic: true }));
                  try {
                    await apiAdminUpsertAiProvider("anthropic", anthropicKey.trim());
                    setAnthropicKey("");
                    info("Claude conectado.");
                    await refresh();
                  } finally {
                    setSaving((s) => ({ ...s, anthropic: false }));
                  }
                });
              }}
            >
              {saving.anthropic ? "Guardando…" : "Guardar key"}
            </Button>
            {anthropic?.updatedAt ? (
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                actualizado: {new Date(anthropic.updatedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

