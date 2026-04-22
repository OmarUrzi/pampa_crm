import { useMemo, useState } from "react";
import { Chip, Pill } from "../ui/ui";
import { useAppStore } from "../state/useAppStore";
import type { Currency } from "../types";

const periodos = [
  { k: "3m", l: "3 meses" },
  { k: "6m", l: "6 meses" },
  { k: "anio", l: "Este año" },
  { k: "hist", l: "Histórico" },
] as const;

function parseDateLabel(label: string): number | null {
  const s = label.trim();
  // formats we have: "15 Feb 2025", "10 Ene 2025", "08 May 2025", "10 Abr 2025"
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

export function EstadisticasPage() {
  const [periodo, setPeriodo] = useState<(typeof periodos)[number]["k"]>("anio");
  const [tab, setTab] = useState<"resumen" | "proveedores" | "clientes" | "eventos" | "servicios">(
    "resumen",
  );

  const eventos = useAppStore((s) => s.eventos);
  const pagosByEventoId = useAppStore((s) => s.pagosByEventoId);
  const pedidosByEventoId = useAppStore((s) => s.proveedoresPedidosByEventoId);
  const proveedores = useAppStore((s) => s.proveedores);
  const cotizacionesByEventoId = useAppStore((s) => s.cotizacionesByEventoId);

  const range = useMemo(() => {
    const now = Date.now();
    if (periodo === "hist") return { from: 0, to: now };
    if (periodo === "anio") {
      const y = new Date().getFullYear();
      return { from: new Date(y, 0, 1).getTime(), to: now };
    }
    const months = periodo === "3m" ? 3 : 6;
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return { from: d.getTime(), to: now };
  }, [periodo]);

  const pagosAll = useMemo(() => {
    const out: Array<
      { eventoId: string; empresa: string; eventoFechaMs: number | null } & (typeof pagosByEventoId)[string][number]
    > = [];
    for (const ev of eventos) {
      const eventoFechaMs = parseDateLabel(ev.fecha);
      for (const p of pagosByEventoId[ev.id] ?? []) out.push({ ...p, eventoId: ev.id, empresa: ev.empresa, eventoFechaMs });
    }
    return out;
  }, [eventos, pagosByEventoId]);

  const ingresos = useMemo(() => {
    const out: Record<Currency, { ok: number; pending: number }> = {
      USD: { ok: 0, pending: 0 },
      ARS: { ok: 0, pending: 0 },
    };
    for (const p of pagosAll) {
      if (p.tipo !== "cobro_cliente") continue;
      const ms = parseDateLabel(p.fechaLabel);
      if (ms !== null && (ms < range.from || ms > range.to)) continue;
      out[p.moneda][p.ok ? "ok" : "pending"] += p.monto;
    }
    return out;
  }, [pagosAll, range.from, range.to]);

  const proveedoresStats = useMemo(() => {
    const rows: Array<{
      proveedor: string;
      categoria: string;
      pedidos: number;
      respondidos: number;
      respAvgDays: number | null;
      ratingAvg: number | null;
    }> = [];

    const pedidosAll = Object.values(pedidosByEventoId).flat();
    const within = pedidosAll.filter((pp) => {
      const ms = pp.pedidoAt ?? null;
      if (ms === null) return periodo === "hist";
      return ms >= range.from && ms <= range.to;
    });

    for (const prov of proveedores) {
      const list = within.filter((x) => x.proveedorId === prov.id || x.proveedor === prov.nombre);
      if (!list.length) continue;
      const responded = list.filter((x) => !!x.respondioAt);
      const respDays = responded
        .map((x) => (x.pedidoAt && x.respondioAt ? Math.max(0, (x.respondioAt - x.pedidoAt) / 86_400_000) : null))
        .filter((x): x is number => typeof x === "number");
      const ratings = responded.map((x) => x.rating).filter((x): x is number => typeof x === "number");
      rows.push({
        proveedor: prov.nombre,
        categoria: prov.categoria,
        pedidos: list.length,
        respondidos: responded.length,
        respAvgDays: respDays.length ? respDays.reduce((a, b) => a + b, 0) / respDays.length : null,
        ratingAvg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      });
    }
    rows.sort((a, b) => (a.respAvgDays ?? 9999) - (b.respAvgDays ?? 9999));
    return rows;
  }, [pedidosByEventoId, periodo, proveedores, range.from, range.to]);

  const clientesStats = useMemo(() => {
    const byEmpresa: Record<
      string,
      { empresa: string; okUsd: number; okArs: number; pendUsd: number; pendArs: number; eventos: number }
    > = {};
    for (const ev of eventos) {
      const evMs = parseDateLabel(ev.fecha);
      if (evMs !== null && (evMs < range.from || evMs > range.to)) continue;
      const k = ev.empresa || "—";
      byEmpresa[k] ??= { empresa: k, okUsd: 0, okArs: 0, pendUsd: 0, pendArs: 0, eventos: 0 };
      byEmpresa[k].eventos += 1;
      for (const p of pagosByEventoId[ev.id] ?? []) {
        if (p.tipo !== "cobro_cliente") continue;
        if (p.moneda === "USD") byEmpresa[k][p.ok ? "okUsd" : "pendUsd"] += p.monto;
        else byEmpresa[k][p.ok ? "okArs" : "pendArs"] += p.monto;
      }
    }
    const rows = Object.values(byEmpresa);
    rows.sort((a, b) => b.okUsd + b.okArs - (a.okUsd + a.okArs));
    return rows;
  }, [eventos, pagosByEventoId, range.from, range.to]);

  const eventosRows = useMemo(() => {
    const rows = eventos
      .map((ev) => {
        const evMs = parseDateLabel(ev.fecha);
        if (evMs !== null && (evMs < range.from || evMs > range.to)) return null;
        const cobros = (pagosByEventoId[ev.id] ?? []).filter((p) => p.tipo === "cobro_cliente");
        const pend = cobros.filter((p) => !p.ok);
        const next = pend
          .map((p) => ({ p, ms: parseDateLabel(p.fechaLabel) }))
          .filter((x): x is { p: typeof pend[number]; ms: number } => typeof x.ms === "number")
          .sort((a, b) => a.ms - b.ms)[0];
        const firstOk = cobros
          .filter((p) => p.ok)
          .map((p) => parseDateLabel(p.fechaLabel))
          .filter((x): x is number => typeof x === "number")
          .sort((a, b) => a - b)[0];
        const daysToFirstCobro =
          typeof firstOk === "number" && typeof evMs === "number" ? (firstOk - evMs) / 86_400_000 : null;
        return {
          id: ev.id,
          nombre: ev.nombre,
          empresa: ev.empresa,
          fecha: ev.fecha,
          cur: ev.cur,
          pendientes: pend.length,
          nextLabel: next ? next.p.fechaLabel : null,
          nextMonto: next ? next.p.monto : null,
          nextMoneda: next ? next.p.moneda : null,
          daysToFirstCobro,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    rows.sort((a, b) => (b.pendientes ?? 0) - (a.pendientes ?? 0));
    return rows;
  }, [eventos, pagosByEventoId, range.from, range.to]);

  const prs = useMemo(() => {
    const anyOk = (ingresos.USD.ok + ingresos.ARS.ok) > 0;
    const provRating =
      proveedoresStats.length && proveedoresStats.some((x) => typeof x.ratingAvg === "number")
        ? proveedoresStats
            .map((x) => x.ratingAvg)
            .filter((x): x is number => typeof x === "number")
            .reduce((a, b) => a + b, 0) /
          proveedoresStats.map((x) => x.ratingAvg).filter((x): x is number => typeof x === "number").length
        : null;

    return [
      {
        l: "Cobros (OK)",
        v: `${money("USD", ingresos.USD.ok)} · ${money("ARS", ingresos.ARS.ok)}`,
        sub: "en el período",
        bg: "#FEF0EA",
      },
      {
        l: "Cobros pendientes",
        v: `${money("USD", ingresos.USD.pending)} · ${money("ARS", ingresos.ARS.pending)}`,
        sub: "por cobrar",
        bg: "#EDF5FF",
      },
      {
        l: "Eventos con cobros pendientes",
        v: `${eventosRows.filter((x) => x.pendientes > 0).length}`,
        sub: "a seguir",
        bg: "#FFF8EC",
      },
      {
        l: "Rating prom. proveedores",
        v: provRating === null ? "—" : `${provRating.toFixed(2)} ★`,
        sub: "sobre pedidos respondidos",
        bg: anyOk ? "#E6F5F0" : "#F1EFE8",
      },
    ];
  }, [eventosRows, ingresos, proveedoresStats]);

  const serviciosStats = useMemo(() => {
    // Usamos la última versión de cotización por evento para "servicios contratados".
    // Margen por servicio: estimado prorrateando el margen del evento por participación del item.
    const byServicio: Record<
      string,
      { servicio: string; veces: number; revUsd: number; revArs: number; margenUsdEst: number; margenArsEst: number }
    > = {};

    for (const ev of eventos) {
      const evMs = parseDateLabel(ev.fecha);
      if (evMs !== null && (evMs < range.from || evMs > range.to)) continue;

      const versions = cotizacionesByEventoId[ev.id] ?? [];
      const v = versions[versions.length - 1];
      if (!v) continue;

      const items = v.items.filter((it) => it.servicio.trim());
      if (!items.length) continue;

      const itemsEvCur = items.filter((it) => (it.unitCur ?? ev.cur) === ev.cur);
      const totalEvCur = itemsEvCur.reduce((s, it) => s + it.pax * it.unit, 0);
      const margenEvento = totalEvCur > 0 ? totalEvCur - (ev.costo ?? 0) : 0;

      for (const it of items) {
        const servicio = it.servicio.trim();
        byServicio[servicio] ??= {
          servicio,
          veces: 0,
          revUsd: 0,
          revArs: 0,
          margenUsdEst: 0,
          margenArsEst: 0,
        };
        byServicio[servicio].veces += 1;
        const rev = it.pax * it.unit;
        if (it.unitCur === "ARS") byServicio[servicio].revArs += rev;
        else byServicio[servicio].revUsd += rev;

        if ((it.unitCur ?? ev.cur) === ev.cur && totalEvCur > 0) {
          const share = rev / totalEvCur;
          if (ev.cur === "USD") byServicio[servicio].margenUsdEst += margenEvento * share;
          else byServicio[servicio].margenArsEst += margenEvento * share;
        }
      }
    }

    const rows = Object.values(byServicio);
    rows.sort((a, b) => b.veces - a.veces);
    return rows;
  }, [cotizacionesByEventoId, eventos, range.from, range.to]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>
          Estadísticas
        </h1>
        <div style={{ display: "flex", gap: 6 }}>
          {periodos.map((p) => (
            <Chip key={p.k} type="button" active={periodo === p.k} onClick={() => setPeriodo(p.k)}>
              {p.l}
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
        {(
          [
            { k: "resumen", l: "Resumen" },
            { k: "proveedores", l: "Proveedores" },
            { k: "clientes", l: "Clientes" },
            { k: "eventos", l: "Eventos" },
            { k: "servicios", l: "Servicios" },
          ] as const
        ).map((t) => (
          <Chip key={t.k} type="button" active={tab === t.k} onClick={() => setTab(t.k)}>
            {t.l}
          </Chip>
        ))}
      </div>

      {tab === "resumen" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
          {prs.map((x) => (
            <div key={x.l} style={{ borderRadius: 12, padding: "14px 16px", background: x.bg }}>
              <div style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, fontWeight: 700 }}>
                {x.l}
              </div>
              <div style={{ fontSize: 21, fontWeight: 700, fontFamily: "var(--font-serif)" }}>{x.v}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>{x.sub}</div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "proveedores" ? (
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Proveedores · respuesta</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Proveedor", "Pedidos", "Resp.", "Resp. prom.", "Rating"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proveedoresStats.length ? (
                proveedoresStats.map((r) => (
                  <tr key={r.proveedor}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 800 }}>{r.proveedor}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{r.categoria}</div>
                    </td>
                    <td style={tdStyle}>{r.pedidos}</td>
                    <td style={tdStyle}>{r.respondidos}</td>
                    <td style={tdStyle}>
                      {r.respAvgDays === null ? (
                        "—"
                      ) : (
                        <Pill style={{ background: "#E1F5EE", color: "#0E6B52" }}>
                          {r.respAvgDays.toFixed(1)} días
                        </Pill>
                      )}
                    </td>
                    <td style={tdStyle}>{r.ratingAvg === null ? "—" : `${r.ratingAvg.toFixed(2)} ★`}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    <span style={{ color: "var(--color-text-secondary)" }}>Sin datos en el período.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "clientes" ? (
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Clientes · cobros</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Cliente", "Eventos", "Cobrado", "Pendiente"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientesStats.length ? (
                clientesStats.map((c) => (
                  <tr key={c.empresa}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 800 }}>{c.empresa}</div>
                    </td>
                    <td style={tdStyle}>{c.eventos}</td>
                    <td style={tdStyle}>
                      <div>{money("USD", c.okUsd)}</div>
                      <div>{money("ARS", c.okArs)}</div>
                    </td>
                    <td style={tdStyle}>
                      <div>{money("USD", c.pendUsd)}</div>
                      <div>{money("ARS", c.pendArs)}</div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={tdStyle} colSpan={4}>
                    <span style={{ color: "var(--color-text-secondary)" }}>Sin datos en el período.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "eventos" ? (
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Eventos · cobros pendientes y timing</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Evento", "Fecha", "Pendientes", "Próx. venc.", "Tiempo al 1er cobro"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventosRows.length ? (
                eventosRows.map((e) => (
                  <tr key={e.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 800 }}>{e.nombre}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{e.empresa}</div>
                    </td>
                    <td style={tdStyle}>{e.fecha}</td>
                    <td style={tdStyle}>
                      {e.pendientes ? (
                        <Pill style={{ background: "#FAECE7", color: "#8E2E12" }}>
                          {e.pendientes}
                        </Pill>
                      ) : (
                        <Pill style={{ background: "#E1F5EE", color: "#0E6B52" }}>0</Pill>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {e.nextLabel ? (
                        <div>
                          <div style={{ fontWeight: 800 }}>{e.nextLabel}</div>
                          {typeof e.nextMonto === "number" && e.nextMoneda ? (
                            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                              {money(e.nextMoneda, e.nextMonto)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={tdStyle}>
                      {e.daysToFirstCobro === null ? (
                        "—"
                      ) : (
                        <span style={{ color: "var(--color-text-secondary)", fontWeight: 800 }}>
                          {e.daysToFirstCobro.toFixed(0)} días
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    <span style={{ color: "var(--color-text-secondary)" }}>Sin datos en el período.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-secondary)" }}>
            Período seleccionado: <strong>{periodo}</strong> · (en prototipo usamos fechas “label”, luego lo pasamos a fechas reales de DB)
          </div>
        </div>
      ) : null}

      {tab === "servicios" ? (
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Servicios · más contratados y margen</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Servicio", "Veces", "Ingresos", "Margen (estimado)"].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {serviciosStats.length ? (
                serviciosStats.slice(0, 25).map((s) => (
                  <tr key={s.servicio}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 900 }}>{s.servicio}</div>
                    </td>
                    <td style={tdStyle}>{s.veces}</td>
                    <td style={tdStyle}>
                      <div>{money("USD", s.revUsd)}</div>
                      <div>{money("ARS", s.revArs)}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: "var(--color-text-secondary)", fontWeight: 900 }}>
                        {money("USD", s.margenUsdEst)}
                      </div>
                      <div style={{ color: "var(--color-text-secondary)", fontWeight: 900 }}>
                        {money("ARS", s.margenArsEst)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                        prorrateado por evento (si moneda coincide)
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={tdStyle} colSpan={4}>
                    <span style={{ color: "var(--color-text-secondary)" }}>Sin datos en el período.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: 12,
  padding: 16,
  background: "var(--color-background-primary)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  marginBottom: 10,
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
  padding: "9px 10px",
  borderBottom: "0.5px solid var(--color-border-tertiary)",
  fontSize: 12,
  verticalAlign: "top",
};

