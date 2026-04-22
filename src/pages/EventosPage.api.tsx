import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchEventos } from "../api/eventos";
import { Pill } from "../ui/ui";

const ST: Record<string, { label: string; bg: string; fg: string }> = {
  consulta: { label: "Consulta", bg: "#EDF5FF", fg: "#185FA5" },
  cotizando: { label: "Cotizando", bg: "#FFF8EC", fg: "#854F0B" },
  enviada: { label: "Cot. Enviada", bg: "#FEF3E2", fg: "#D97706" },
  negociacion: { label: "En Negociación", bg: "#F1EFE8", fg: "#5F5E5A" },
  confirmado: { label: "Confirmado", bg: "#E6F5F0", fg: "#0F6E56" },
  perdido: { label: "Perdido", bg: "#FAECE7", fg: "#993C1D" },
};

function badge(status: string) {
  const x = ST[status] ?? { label: status, bg: "#eee", fg: "#333" };
  return <Pill style={{ background: x.bg, color: x.fg }}>{x.label}</Pill>;
}

export function EventosPageApi() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ id: string; nombre: string; empresa: string; fecha: string; pax: number; status: string }>>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchEventos()
      .then((r) => {
        if (!alive) return;
        setItems(
          r.eventos.map((e) => ({
            id: e.id,
            nombre: e.nombre,
            empresa: e.empresa.nombre,
            fecha: e.fechaLabel,
            pax: e.pax,
            status: e.status,
          })),
        );
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "error");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>
          Eventos (API)
        </h1>
        <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
          {loading ? "cargando…" : `${items.length} total`}
        </span>
      </div>

      {error ? (
        <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 12 }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {items.map((e) => (
          <Link
            key={e.id}
            to={`/eventos/${e.id}`}
            style={{
              border: `0.5px solid var(--color-border-tertiary)`,
              borderRadius: 12,
              padding: "10px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--color-background-primary)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{e.nombre}</div>
              <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
                {e.empresa} · {e.fecha} · {e.pax} pax
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {badge(e.status)}
              <div style={{ color: "var(--color-text-secondary)" }}>›</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

