import { Button } from "../../../ui/ui";
import { useAppStore } from "../../../state/useAppStore";
import type { Currency, Pago } from "../../../types";
import { apiMarkPagoOk } from "../../../api/pagos";
import { refreshEventoDetailIntoStore } from "../../../api/hydrateEventoDetail";
import { useCanEdit } from "../../../auth/perms";
import { useAuthGate } from "../../../auth/useAuthGate";

function money(cur: Currency, amount: number) {
  const prefix = cur === "USD" ? "U$D" : "$";
  return `${prefix} ${amount.toLocaleString("en-US")}`;
}

export function PagosTab({ eventoId }: { eventoId: string }) {
  const ev = useAppStore((s) => s.eventos.find((e) => e.id === eventoId));
  const pagos = useAppStore((s) => s.pagosByEventoId[eventoId] ?? []);
  const markPago = useAppStore((s) => s.markPago);
  const canEdit = useCanEdit();
  const gate = useAuthGate();

  if (!ev) return null;

  const cur = ev.cur;
  const totalCotizado = ev.cotizado;
  const cobrado = pagos
    .filter((p) => p.tipo === "cobro_cliente" && p.ok && p.moneda === cur)
    .reduce((s, p) => s + p.monto, 0);
  const pendienteCliente = pagos
    .filter((p) => p.tipo === "cobro_cliente" && !p.ok && p.moneda === cur)
    .reduce((s, p) => s + p.monto, 0);
  const aPagarProv = pagos
    .filter((p) => p.tipo === "pago_proveedor" && !p.ok && p.moneda === cur)
    .reduce((s, p) => s + p.monto, 0);

  const mcs = [
    { l: "Total cotizado", v: money(cur, totalCotizado), bg: "#FEF0EA" },
    { l: "Cobrado", v: money(cur, cobrado), bg: "#E6F5F0" },
    { l: "Pendiente cliente", v: money(cur, pendienteCliente), bg: "#FFF8EC" },
    { l: "A pagar proveedores", v: money(cur, aPagarProv), bg: "#EDF5FF" },
  ];

  function rowStatus(p: Pago) {
    if (p.ok) return { label: "Pagado", bg: "#E6F5F0", fg: "#0F6E56" };
    return { label: "Pendiente", bg: "#FFF8EC", fg: "#D97706" };
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
        {mcs.map((x) => (
          <div key={x.l} style={{ borderRadius: 12, padding: "14px 16px", background: x.bg }}>
            <div style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, fontWeight: 700 }}>
              {x.l}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "var(--font-serif)" }}>{x.v}</div>
          </div>
        ))}
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              {["Concepto", "Tipo", "Monto", "Fecha", "Estado"].map((h) => (
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
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {pagos.map((p) => {
              const st = rowStatus(p);
              return (
                <tr key={p.id}>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 800 }}>
                    {p.concepto}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                    {p.tipo === "cobro_cliente" ? "Cobro a cliente" : "Pago proveedor"}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 800 }}>
                    {money(p.moneda, p.monto)}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                    {p.fechaLabel}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: st.bg,
                        color: st.fg,
                      }}
                    >
                      {st.label}
                    </span>
                    {!p.ok ? (
                      <Button
                        type="button"
                        style={{ fontSize: 11, marginLeft: 8, padding: "4px 8px", borderRadius: 8 }}
                        onClick={() => {
                          if (!canEdit) return void gate.ensureAuthed();
                          // optimistic UI
                          markPago(eventoId, p.id, true);
                          void gate.run(async () => {
                            await apiMarkPagoOk(eventoId, p.id, true);
                            // best-effort re-sync to avoid drift
                            await refreshEventoDetailIntoStore(eventoId);
                          });
                        }}
                        disabled={!canEdit}
                      >
                        Marcar pagado
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

