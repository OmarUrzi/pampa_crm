import { useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "../state/useAppStore";
import { Chip, Pill, SectionTitle } from "../ui/ui";
import type { Currency, EventoStatus } from "../types";
import { ST_LEGACY as ST } from "../ui/statusColors";

function badge(status: EventoStatus) {
  const x = ST[status];
  return <Pill style={{ background: x.bg, color: x.fg }}>{x.label}</Pill>;
}

function parseDateLabel(label: string): number | null {
  const s = label.trim();
  const m = s.match(/^(\d{1,2})\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]{3})\s+(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mon = m[2].toLowerCase();
  const y = Number(m[3]);
  const mm: Record<string, number> = {
    ene: 0,
    jan: 0,
    feb: 1,
    mar: 2,
    abr: 3,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    ago: 7,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dic: 11,
    dec: 11,
  };
  const month = mm[mon];
  if (month === undefined || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  return new Date(y, month, d).getTime();
}

function money(cur: Currency, amount: number) {
  const prefix = cur === "USD" ? "U$D" : "$";
  return `${prefix} ${Math.round(amount).toLocaleString("en-US")}`;
}

export function DashboardPage() {
  const activeUser = useAppStore((s) => s.activeUser);
  const eventos = useAppStore((s) => s.eventos);
  const pedidosByEventoId = useAppStore((s) => s.proveedoresPedidosByEventoId);
  const pagosByEventoId = useAppStore((s) => s.pagosByEventoId);

  const [scope, setScope] = useState<"mine" | "all">("mine");

  const scopeEventos = scope === "mine" ? eventos.filter((e) => e.resp === activeUser) : eventos;
  const active = scopeEventos.filter((e) => e.status !== "perdido");
  const conf = scopeEventos.filter((e) => e.status === "confirmado");
  const pend = scopeEventos.filter((e) => e.status === "negociacion");
  const ingresos = conf.reduce<Record<Currency, number>>(
    (acc, e) => {
      acc[e.cur] += e.cotizado;
      return acc;
    },
    { USD: 0, ARS: 0 },
  );

  const proxEventos = [...active]
    .sort((a, b) => (parseDateLabel(a.fecha) ?? 0) - (parseDateLabel(b.fecha) ?? 0))
    .slice(0, 6);

  const pendProveedores = active.flatMap((e) =>
    (pedidosByEventoId[e.id] ?? [])
      .filter((p) => !p.respondioLabel)
      .map((p) => ({ eventoId: e.id, evento: e.nombre, proveedor: p.proveedor })),
  );

  const pendCobros = active.flatMap((e) =>
    (pagosByEventoId[e.id] ?? [])
      .filter((p) => p.tipo === "cobro_cliente" && !p.ok)
      .map((p) => ({ eventoId: e.id, evento: e.nombre, concepto: p.concepto, monto: p.monto, moneda: p.moneda, fecha: p.fechaLabel })),
  );

  const mcs = [
    {
      label: "Mis eventos activos",
      value: active.length,
      sub: "en gestión",
      accent: "var(--color-primary)",
    },
    {
      label: "En negociación",
      value: pend.length,
      sub: "requieren atención",
      accent: "var(--color-warning-fg)",
    },
    {
      label: "Confirmados",
      value: conf.length,
      sub: "en mi cartera",
      accent: "var(--color-success-fg)",
    },
    {
      label: "Ingresos confirm.",
      value: `${money("USD", ingresos.USD)}`,
      sub: money("ARS", ingresos.ARS),
      accent: "var(--color-info-fg)",
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 18, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1
            style={{
              fontSize: 20,
              fontFamily: "var(--font-serif)",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Dashboard · {activeUser}
          </h1>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
            Tu cartera de eventos, pendientes y próximos pasos.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Chip type="button" active={scope === "mine"} onClick={() => setScope("mine")}>
              Mis eventos
            </Chip>
            <Chip type="button" active={scope === "all"} onClick={() => setScope("all")}>
              Todos
            </Chip>
          </div>
          <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
            Pend. prov: <strong>{pendProveedores.length}</strong>
          </Pill>
          <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
            Cobros pend: <strong>{pendCobros.length}</strong>
          </Pill>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {mcs.map((m) => (
          <div
            key={m.label}
            style={{
              borderRadius: 10,
              padding: "16px 18px",
              background: "var(--color-background-primary)",
              border: "1px solid var(--color-border-tertiary)",
              borderLeft: `3px solid ${m.accent}`,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--color-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
                fontWeight: 700,
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                lineHeight: 1.2,
              }}
            >
              {m.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
              {m.sub}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.65fr", gap: 14 }}>
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <SectionTitle>Mis próximos eventos</SectionTitle>
            <Link to="/eventos" style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 700 }}>
              Ver todos →
            </Link>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--color-background-secondary)" }}>
                {["Evento", "Empresa", "Fecha", "Estado"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proxEventos.length ? (
                proxEventos.map((e) => (
                  <tr key={e.id}>
                    <td style={tdStyle}>
                      <Link to={`/eventos/${e.id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 800 }}>
                        {e.nombre}
                      </Link>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                        {e.locacion} · {e.pax} pax
                      </div>
                    </td>
                    <td style={tdStyle}>{e.empresa}</td>
                    <td style={tdStyle}>{e.fecha}</td>
                    <td style={tdStyle}>{badge(e.status)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={tdStyle} colSpan={4}>
                    <span style={{ color: "var(--color-text-secondary)" }}>No tenés eventos asignados aún.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={panelStyle}>
          <SectionTitle>Pendientes</SectionTitle>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={miniTitleStyle}>Proveedores sin responder</div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {pendProveedores.length ? (
                  pendProveedores.slice(0, 6).map((x, idx) => (
                    <Link key={`${x.eventoId}-${x.proveedor}-${idx}`} to={`/eventos/${x.eventoId}`} style={miniRowStyle}>
                      <div style={{ fontWeight: 800, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {x.proveedor}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {x.evento}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Todo al día.</div>
                )}
              </div>
            </div>

            <div>
              <div style={miniTitleStyle}>Cobros pendientes</div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {pendCobros.length ? (
                  pendCobros.slice(0, 6).map((x, idx) => (
                    <Link key={`${x.eventoId}-${x.concepto}-${idx}`} to={`/eventos/${x.eventoId}`} style={miniRowStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {x.concepto}
                        </div>
                        <div style={{ fontWeight: 900, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          {money(x.moneda, x.monto)}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {x.fecha} · {x.evento}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>No hay cobros pendientes.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 10,
  padding: 16,
  background: "var(--color-background-primary)",
  boxShadow: "var(--shadow-sm)",
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 10,
  fontWeight: 800,
  color: "var(--color-text-secondary)",
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  borderBottom: "0.5px solid var(--color-border-tertiary)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "0.5px solid var(--color-border-tertiary)",
  fontSize: 12,
  verticalAlign: "top",
};

const miniTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "var(--color-text-secondary)",
};

const miniRowStyle: React.CSSProperties = {
  display: "block",
  padding: "9px 10px",
  borderRadius: 10,
  border: "0.5px solid var(--color-border-tertiary)",
  textDecoration: "none",
  color: "inherit",
};

