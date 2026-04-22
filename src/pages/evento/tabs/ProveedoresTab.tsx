import { Button } from "../../../ui/ui";
import { useAppStore } from "../../../state/useAppStore";
import { useMemo, useState } from "react";
import { SearchDropdown } from "../../../ui/SearchDropdown";
import { ProveedorFormModal } from "../../../ui/ProveedorFormModal";
import { apiCreateProveedorPedido, apiPatchProveedorPedido } from "../../../api/pedidos";
import { refreshEventoDetailIntoStore } from "../../../api/hydrateEventoDetail";
import { useCanEdit } from "../../../auth/perms";
import { useAuthGate } from "../../../auth/useAuthGate";

export function ProveedoresTab({ eventoId }: { eventoId: string }) {
  const pedidos = useAppStore((s) => s.proveedoresPedidosByEventoId[eventoId] ?? []);
  const proveedores = useAppStore((s) => s.proveedores);
  const canEdit = useCanEdit();
  const gate = useAuthGate();

  const [showAdd, setShowAdd] = useState(false);
  const [selProvId, setSelProvId] = useState("");
  const [showNewProv, setShowNewProv] = useState(false);
  const [draftMontoByPedidoId, setDraftMontoByPedidoId] = useState<Record<string, string>>({});

  const items = useMemo(
    () =>
      proveedores.map((p) => ({
        id: p.id,
        label: p.nombre,
        sublabel: `${p.categoria}`,
      })),
    [proveedores],
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
          Pedidos de cotización para este evento
        </p>
        <Button
          variant="primary"
          type="button"
          onClick={() => {
            void gate.run(async () => {
              setShowAdd(true);
            });
          }}
          disabled={!canEdit}
        >
          + Agregar proveedor
        </Button>
      </div>

      {showAdd ? (
        <div
          style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            background: "var(--color-background-secondary)",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
                Buscar proveedor
              </div>
              <SearchDropdown
                valueId={selProvId}
                placeholder="— Seleccionar —"
                items={items}
                onChange={(id) => setSelProvId(id)}
              />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <Button type="button" onClick={() => setShowNewProv(true)}>
                + Nuevo proveedor
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={() => {
                  if (!selProvId) return;
                  (async () => {
                    const p = proveedores.find((x) => x.id === selProvId);
                    if (!p) return;
                    await gate.run(async () => {
                      await apiCreateProveedorPedido(eventoId, {
                        proveedorId: p.id,
                        proveedorTxt: p.nombre,
                        categoria: p.categoria,
                        pedidoLabel: "Hoy",
                      });
                      await refreshEventoDetailIntoStore(eventoId);
                    });
                    setSelProvId("");
                    setShowAdd(false);
                  })();
                }}
                disabled={!selProvId}
              >
                Agregar
              </Button>
              <Button type="button" onClick={() => setShowAdd(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pedidos.map((p) => {
          const ok = !!p.respondioLabel;
          const montoDraft = draftMontoByPedidoId[p.id] ?? (p.montoLabel ?? "");
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "12px 14px",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: 12,
                borderLeft: `3px solid ${ok ? "#1D9E75" : "#EA6536"}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{p.proveedor}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                  {p.categoria} · Pedido: {p.pedidoLabel}
                </div>
              </div>

              {ok ? (
                <div style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
                    <input
                      value={montoDraft}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraftMontoByPedidoId((s) => ({ ...s, [p.id]: v }));
                      }}
                      onBlur={() => {
                        const v = (draftMontoByPedidoId[p.id] ?? (p.montoLabel ?? "")).trim();
                        const next = v || null;
                        const prev = (p.montoLabel ?? "").trim() || null;
                        if (next === prev) return;
                        void gate.run(async () => {
                          await apiPatchProveedorPedido(eventoId, p.id, { montoLabel: next });
                          await refreshEventoDetailIntoStore(eventoId);
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        (e.currentTarget as HTMLInputElement).blur();
                      }}
                      placeholder="Monto (ej: U$D 6.800)"
                      disabled={!canEdit}
                      style={{
                        width: 160,
                        border: "0.5px solid var(--color-border-secondary)",
                        borderRadius: 10,
                        padding: "7px 11px",
                        background: "var(--color-background-primary)",
                        color: "var(--color-text-primary)",
                        fontSize: 12,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "#1D9E75", marginTop: 2 }}>
                    ✓ Respondió {p.respondioLabel}
                  </div>
                  {typeof p.rating === "number" ? (
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
                      Calificación: <strong>{p.rating}</strong>/5
                    </div>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <select
                        value={""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          (async () => {
                            await gate.run(async () => {
                              await apiPatchProveedorPedido(eventoId, p.id, {
                                rating: Number.isFinite(n) ? n : null,
                              });
                              await refreshEventoDetailIntoStore(eventoId);
                            });
                          })();
                        }}
                        disabled={!canEdit}
                        style={{
                          border: "0.5px solid var(--color-border-secondary)",
                          borderRadius: 10,
                          padding: "6px 10px",
                          background: "var(--color-background-primary)",
                          color: "var(--color-text-primary)",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        <option value="" disabled>
                          Calificar…
                        </option>
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} / 5
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "3px 9px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: "#FAECE7",
                      color: "#993C1D",
                      marginBottom: 6,
                    }}
                  >
                    Sin respuesta
                  </div>
                  <div>
                    <Button
                      type="button"
                      style={{ fontSize: 11 }}
                      onClick={async () => {
                        await gate.run(async () => {
                          await apiPatchProveedorPedido(eventoId, p.id, {
                            pedidoLabel: "Hoy",
                            pedidoAt: new Date().toISOString(),
                            respondioLabel: null,
                            respondioAt: null,
                            rating: null,
                          });
                          await refreshEventoDetailIntoStore(eventoId);
                        });
                      }}
                      disabled={!canEdit}
                    >
                      Reenviar pedido
                    </Button>
                    <Button
                      type="button"
                      style={{ fontSize: 11, marginLeft: 8 }}
                      onClick={async () => {
                        await gate.run(async () => {
                          await apiPatchProveedorPedido(eventoId, p.id, {
                            respondioLabel: "Hoy",
                            respondioAt: new Date().toISOString(),
                            montoLabel: p.montoLabel ?? null,
                          });
                          await refreshEventoDetailIntoStore(eventoId);
                        });
                      }}
                      disabled={!canEdit}
                    >
                      Marcar respondió
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showNewProv ? (
        <ProveedorFormModal
          mode="create"
          onClose={() => setShowNewProv(false)}
          onSaved={(id) => {
            setSelProvId(id);
          }}
        />
      ) : null}
    </div>
  );
}

