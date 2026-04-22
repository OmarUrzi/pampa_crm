import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAppStore } from "../state/useAppStore";
import { Button, Chip, Pill } from "../ui/ui";
import type { EventoStatus } from "../types";
import { StatusDropdown } from "../ui/StatusDropdown";
import { EventoFormModal } from "../ui/EventoFormModal";

const ST: Record<EventoStatus, { label: string; bg: string; fg: string }> = {
  consulta: { label: "Consulta", bg: "#EDF5FF", fg: "#185FA5" },
  cotizando: { label: "Cotizando", bg: "#FFF8EC", fg: "#854F0B" },
  enviada: { label: "Cot. Enviada", bg: "#FEF3E2", fg: "#D97706" },
  negociacion: { label: "En Negociación", bg: "#F1EFE8", fg: "#5F5E5A" },
  confirmado: { label: "Confirmado", bg: "#E6F5F0", fg: "#0F6E56" },
  perdido: { label: "Perdido", bg: "#FAECE7", fg: "#993C1D" },
};

function badge(status: EventoStatus) {
  const x = ST[status];
  return <Pill style={{ background: x.bg, color: x.fg }}>{x.label}</Pill>;
}

export function EventosPage() {
  const eventos = useAppStore((s) => s.eventos);
  const setEventoStatus = useAppStore((s) => s.setEventoStatus);

  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<
    "Todos" | "Activos" | "Confirmados" | "En negociación" | "Perdidos"
  >("Todos");

  useEffect(() => {
    const next = q.trim();
    const cur = searchParams.get("q") ?? "";
    if (next === cur) return;
    if (!next) {
      // limpiar q sin tocar otros params
      const sp = new URLSearchParams(searchParams);
      sp.delete("q");
      setSearchParams(sp, { replace: true });
      return;
    }
    const sp = new URLSearchParams(searchParams);
    sp.set("q", next);
    setSearchParams(sp, { replace: true });
  }, [q, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = eventos;
    if (filter === "Activos") list = list.filter((e) => e.status !== "perdido");
    if (filter === "Confirmados") list = list.filter((e) => e.status === "confirmado");
    if (filter === "En negociación") list = list.filter((e) => e.status === "negociacion");
    if (filter === "Perdidos") list = list.filter((e) => e.status === "perdido");

    if (!qq) return list;
    return list.filter((e) => {
      const hay = `${e.nombre} ${e.empresa} ${e.contacto} ${e.locacion}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [eventos, filter, q]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 700 }}>
            Eventos
          </h1>
          <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {filtered.length} / {eventos.length}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar evento o empresa..."
            style={{
              width: 220,
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 10,
              padding: "7px 11px",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-primary)",
              fontSize: 12,
            }}
          />
          <Button variant="primary" type="button" onClick={() => setShowNew(true)}>
            + Nuevo evento
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
        {(["Todos", "Activos", "Confirmados", "En negociación", "Perdidos"] as const).map((f) => (
          <Chip key={f} type="button" active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Chip>
        ))}
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              {["Evento", "Empresa", "Locación", "Fecha", "Pax", "Estado", "Resp.", ""].map((h) => (
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
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <Link to={`/eventos/${e.id}`} style={{ fontWeight: 800, fontSize: 12 }}>
                    {e.nombre}
                  </Link>
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                  {e.empresa}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                  {e.locacion}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                  {e.fecha}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                  {e.pax}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <StatusDropdown
                    value={e.status}
                    options={ST}
                    onChange={(v) => setEventoStatus(e.id, v)}
                  />
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                  {e.resp}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", textAlign: "right", color: "var(--color-text-secondary)", fontSize: 16 }}>
                  ›
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew ? (
        <EventoFormModal
          mode="create"
          onClose={() => setShowNew(false)}
          onSaved={() => {
            // por ahora no navegamos automático; queda creado y visible en la tabla
          }}
        />
      ) : null}
    </div>
  );
}

