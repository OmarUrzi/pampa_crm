import { useEffect, useMemo, useState } from "react";
import type { CotizacionVersion, Currency } from "../../../types";
import { Button } from "../../../ui/ui";
import { ConfirmModal } from "../../../ui/ConfirmModal";
import { useAppStore } from "../../../state/useAppStore";
import { apiFetch } from "../../../api/client";
import { SearchDropdown } from "../../../ui/SearchDropdown";
import { ProveedorFormModal } from "../../../ui/ProveedorFormModal";
import { useCanEdit } from "../../../auth/perms";
import { useAuthGate } from "../../../auth/useAuthGate";
import { apiListSlidesForEvento, type SlideDeckListItem } from "../../../api/slides";
import {
  apiAddCotizacionItem,
  apiCreateCotizacionVersion,
  apiDeleteCotizacionItem,
  apiFetchEventoCotizaciones,
  apiPatchCotizacionItem,
} from "../../../api/cotizaciones";

function money(cur: Currency, amount: number) {
  const prefix = cur === "USD" ? "U$D" : "$";
  return `${prefix} ${amount.toLocaleString("en-US")}`;
}

function subtotal(v: { pax: number; unit: number }) {
  return v.pax * v.unit;
}

export function CotizacionesTab({ eventoId }: { eventoId: string }) {
  const ev = useAppStore((s) => s.eventos.find((e) => e.id === eventoId));
  const versions = useAppStore((s) => s.cotizacionesByEventoId[eventoId] ?? []);
  const addVersion = useAppStore((s) => s.addCotizacionVersion);
  const updateItem = useAppStore((s) => s.updateCotizacionItem);
  const addItem = useAppStore((s) => s.addCotizacionItem);
  const removeItem = useAppStore((s) => s.removeCotizacionItem);
  const setCotizacionesForEvento = useAppStore((s) => s.setCotizacionesForEvento);
  const updateEvento = useAppStore((s) => s.updateEvento);
  const proveedores = useAppStore((s) => s.proveedores);
  const ensurePedido = useAppStore((s) => s.ensureProveedorPedidoToEvento);
  const catalogo = useAppStore((s) => s.catalogo);
  const canEdit = useCanEdit();
  const gate = useAuthGate();

  const [activeVersionId, setActiveVersionId] = useState<string | null>(
    versions[versions.length - 1]?.id ?? null,
  );
  const [showNewProv, setShowNewProv] = useState(false);
  const [provRowItemId, setProvRowItemId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<null | { versionId: string; itemId: string }>(null);
  const [slides, setSlides] = useState<SlideDeckListItem[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);

  const active = useMemo<CotizacionVersion | null>(() => {
    if (!activeVersionId) return null;
    return versions.find((v) => v.id === activeVersionId) ?? null;
  }, [activeVersionId, versions]);

  if (!ev) return null;

  const cur = ev.cur;
  const totalsByCur = useMemo(() => {
    const out: Record<Currency, number> = { USD: 0, ARS: 0 };
    for (const it of active?.items ?? []) {
      const ic = (it.unitCur ?? ev.cur) as Currency;
      out[ic] += subtotal(it);
    }
    return out;
  }, [active?.items, ev.cur]);
  const onlyCur: Currency | null = useMemo(() => {
    const set = new Set<Currency>();
    for (const it of active?.items ?? []) set.add(((it.unitCur ?? ev.cur) as Currency) ?? ev.cur);
    return set.size === 1 ? [...set.values()][0] : null;
  }, [active?.items, ev.cur]);
  const totalCotizado = (active?.items ?? []).reduce((s, it) => s + subtotal(it), 0);
  const costoEstimado = ev.costo;
  const margen = onlyCur === ev.cur ? totalsByCur[ev.cur] - costoEstimado : null;
  const margenPct =
    onlyCur === ev.cur && totalsByCur[ev.cur] > 0
      ? Math.round((margen! / totalsByCur[ev.cur]) * 100)
      : null;

  const proveedoresItems = useMemo(
    () =>
      [
        { id: "", label: "— Sin proveedor —", sublabel: "Opcional" },
        { id: "__new__", label: "+ Nuevo proveedor…", sublabel: "Crear y seleccionar" },
        ...proveedores.map((p) => ({ id: p.id, label: p.nombre, sublabel: p.categoria })),
      ] as { id: string; label: string; sublabel?: string }[],
    [proveedores],
  );

  const catalogoItems = useMemo(
    () =>
      [
        { id: "", label: "— Elegir del catálogo —", sublabel: "Opcional" },
        ...catalogo.map((a) => ({
          id: a.id,
          label: `${a.nombre}`,
          sublabel: `${a.categoria} · U$D ${a.precioUsd}/pax`,
        })),
      ] as { id: string; label: string; sublabel?: string }[],
    [catalogo],
  );

  const servicioValueIdByItemId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const it of active?.items ?? []) {
      const a = catalogo.find((x) => x.nombre === it.servicio);
      map[it.id] = a?.id ?? "";
    }
    return map;
  }, [active?.items, catalogo]);

  useEffect(() => {
    // Preferir DB si el backend está disponible.
    (async () => {
      try {
        const v = await apiFetchEventoCotizaciones(eventoId);
        if (v.length) setCotizacionesForEvento(eventoId, v);
      } catch {
        // fallback local
      }
    })();
  }, [eventoId, setCotizacionesForEvento]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setSlidesLoading(true);
      try {
        const res = await gate.run(async () => await apiListSlidesForEvento(eventoId));
        if (!alive) return;
        setSlides((res?.decks ?? []) as SlideDeckListItem[]);
      } catch {
        // ignore
      } finally {
        if (alive) setSlidesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventoId, gate]);

  useEffect(() => {
    // Si crean un evento nuevo, no hay versiones: dejamos lista una v1 para editar.
    if (versions.length > 0) return;
    (async () => {
      try {
        await apiCreateCotizacionVersion(eventoId);
        const v = await apiFetchEventoCotizaciones(eventoId);
        if (v.length) setCotizacionesForEvento(eventoId, v);
      } catch {
        addVersion(eventoId);
      }
    })();
  }, [addVersion, eventoId, versions.length]);

  useEffect(() => {
    // Que el resumen (Eventos/KPIs) refleje lo que se arma acá.
    if (!active) return;
    // Solo si toda la versión está en la moneda del evento.
    if (onlyCur !== ev.cur) return;
    const next = totalsByCur[ev.cur];
    if (ev.cotizado === next) return;
    updateEvento(eventoId, { cotizado: next });
  }, [active, ev.cur, ev.cotizado, eventoId, onlyCur, totalsByCur, updateEvento]);

  return (
    <div>
      {confirmDelete ? (
        <ConfirmModal
          title="Eliminar ítem"
          message="¿Realmente querés eliminar este ítem de la cotización?"
          confirmText="Sí, eliminar"
          cancelText="Cancelar"
          danger
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const { versionId, itemId } = confirmDelete;
            setConfirmDelete(null);
            if (!canEdit) {
              gate.ensureAuthed();
              return;
            }
            removeItem(eventoId, versionId, itemId);
            void gate.run(async () => {
              await apiDeleteCotizacionItem(eventoId, versionId, itemId);
              const v = await apiFetchEventoCotizaciones(eventoId);
              setCotizacionesForEvento(eventoId, v);
            });
          }}
        />
      ) : null}
      {showNewProv ? (
        <ProveedorFormModal
          mode="create"
          onClose={() => {
            setShowNewProv(false);
            setProvRowItemId(null);
          }}
          onSaved={(proveedorId) => {
            const p = useAppStore.getState().proveedores.find((x) => x.id === proveedorId);
            if (!p) return;
            if (!provRowItemId || !active) return;
            updateItem(eventoId, active.id, provRowItemId, { proveedor: p.nombre });
            setShowNewProv(false);
            setProvRowItemId(null);
          }}
        />
      ) : null}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveVersionId(v.id)}
              style={{
                padding: "7px 13px",
                borderRadius: 10,
                border: `0.5px solid ${
                  activeVersionId === v.id
                    ? "var(--color-border-primary)"
                    : "var(--color-border-tertiary)"
                }`,
                background: activeVersionId === v.id ? "var(--color-primary-subtle)" : "transparent",
                fontSize: 12,
                fontWeight: activeVersionId === v.id ? 700 : 600,
                color:
                  activeVersionId === v.id
                    ? "var(--color-primary)"
                    : "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              {v.label} — {v.createdAtLabel}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              if (!canEdit) return void gate.ensureAuthed();
              // optimistic: add local version immediately
              addVersion(eventoId);
              const nextActive = (useAppStore.getState().cotizacionesByEventoId[eventoId] ?? []).slice(-1)[0]?.id ?? null;
              if (nextActive) setActiveVersionId(nextActive);
              void gate.run(async () => {
                await apiCreateCotizacionVersion(eventoId);
                const v = await apiFetchEventoCotizaciones(eventoId);
                setCotizacionesForEvento(eventoId, v);
              });
            }}
            disabled={!canEdit}
          >
            + Nueva versión
          </Button>
        </div>
      </div>

      {!active ? (
        <div
          style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 12,
            padding: 14,
            background: "var(--color-background-primary)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>No hay cotizaciones todavía</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            Creá una versión para empezar a armar la propuesta.
          </div>
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              void gate.run(async () => {
                addVersion(eventoId);
              });
            }}
            disabled={!canEdit}
          >
            Crear v1
          </Button>
        </div>
      ) : null}

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
        <div
          style={{
            background: "var(--color-background-secondary)",
            padding: "9px 14px",
            borderBottom: "0.5px solid var(--color-border-tertiary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            Cotización {active?.label ?? "—"} — Vigente
          </span>
          <div style={{ display: "flex", gap: 7 }}>
            <Button
              type="button"
              onClick={() => {
                if (!active) return;
                if (!canEdit) return void gate.ensureAuthed();
                addItem(eventoId, active.id, {
                  servicio: "Nuevo ítem",
                  proveedor: "",
                  pax: ev.pax || 0,
                  unitCur: ev.cur,
                  unit: 0,
                });
                void gate.run(async () => {
                  await apiAddCotizacionItem(eventoId, active.id, {
                    servicio: "Nuevo ítem",
                    proveedor: "",
                    pax: ev.pax || 0,
                    unitCur: ev.cur,
                    unit: 0,
                  });
                  const v = await apiFetchEventoCotizaciones(eventoId);
                  setCotizacionesForEvento(eventoId, v);
                });
              }}
              disabled={!canEdit}
            >
              + Ítem
            </Button>
            <div style={{ width: 260 }}>
              <SearchDropdown
                valueId=""
                placeholder="+ Catálogo…"
                items={catalogoItems}
                onChange={(id) => {
                  if (!id || !active) return;
                  const a = catalogo.find((x) => x.id === id);
                  if (!a) return;
                  const prov = proveedores.find((p) => p.nombre === a.proveedorSugerido);
                  if (prov) ensurePedido(eventoId, prov.id);
                  if (!canEdit) return void gate.ensureAuthed();
                  addItem(eventoId, active.id, {
                    servicio: a.nombre,
                    proveedor: a.proveedorSugerido === "—" ? "" : a.proveedorSugerido,
                    pax: ev.pax || 0,
                    unitCur: "USD",
                    unit: a.precioUsd,
                  });
                  void gate.run(async () => {
                    await apiAddCotizacionItem(eventoId, active.id, {
                      servicio: a.nombre,
                      proveedor: a.proveedorSugerido === "—" ? "" : a.proveedorSugerido,
                      pax: ev.pax || 0,
                      unitCur: "USD",
                      unit: a.precioUsd,
                    });
                    const v = await apiFetchEventoCotizaciones(eventoId);
                    setCotizacionesForEvento(eventoId, v);
                  });
                }}
              />
            </div>
            <Button
              type="button"
              disabled={!canEdit}
              onClick={() => {
                if (!canEdit) return void gate.ensureAuthed();
                gate.info("Exportar PDF: pendiente de implementación.");
              }}
              title="Placeholder (próxima iteración)"
            >
              Exportar PDF
            </Button>
            <Button
              type="button"
              onClick={async () => {
                await gate.run(async () => {
                  const res = await apiFetch<{ url?: string }>("/slides/generate-from-evento", {
                    method: "POST",
                    body: JSON.stringify({
                      eventoId,
                      prompt:
                        "Generá una presentación (cotización) basada en la cotización actual del evento. Incluí precio por ítem, descripciones y fotos del catálogo cuando existan. Usá el logo de la agencia en la portada si está disponible.",
                    }),
                    // Claude puede demorar; evitamos abortar el request por timeout del cliente.
                    timeoutMs: 60_000,
                  } as any);
                  const url = res?.url ?? "https://docs.google.com/presentation/d/FAKE_DECK_ID/edit";
                  window.open(url, "_blank", "noopener,noreferrer");
                  try {
                    const list = await apiListSlidesForEvento(eventoId);
                    setSlides((list?.decks ?? []) as SlideDeckListItem[]);
                  } catch {
                    // ignore
                  }
                });
              }}
              disabled={!canEdit}
            >
              Generar Slides ↗
            </Button>
          </div>
        </div>

        <div style={{ marginTop: 12, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", background: "var(--color-background-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Slides generadas</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{slidesLoading ? "cargando…" : `${slides.length}`}</div>
          </div>
          <div style={{ padding: 12, display: "grid", gap: 8 }}>
            {slides.length ? (
              slides.slice(0, 8).map((d) => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.title ?? d.prompt ?? "Slides"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                      {new Date(d.createdAt).toLocaleString()} · {d.provider ?? "—"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={() => window.open(d.url, "_blank", "noopener,noreferrer")}
                    style={{ fontSize: 11, padding: "6px 10px", flexShrink: 0 }}
                  >
                    Ver ↗
                  </Button>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                Todavía no hay slides generadas para este evento.
              </div>
            )}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              {["Servicio", "Proveedor", "Pax", "P. Unit.", "Subtotal", ""].map((h) => (
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
            {(active?.items ?? []).map((r) => (
              <tr key={r.id}>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <SearchDropdown
                    valueId={servicioValueIdByItemId[r.id] ?? ""}
                    placeholder="— (opcional) —"
                    items={catalogoItems}
                    onChange={(id) => {
                      if (!canEdit) {
                        gate.ensureAuthed();
                        return;
                      }
                      if (!id) {
                        updateItem(eventoId, active.id, r.id, { servicio: "", unitCur: ev.cur, unit: 0 });
                        apiPatchCotizacionItem(eventoId, active.id, r.id, { servicio: "", unitCur: ev.cur, unit: 0 }).catch(
                          () => {},
                        );
                        return;
                      }
                      const a = catalogo.find((x) => x.id === id);
                      if (!a) return;
                      const prov = proveedores.find((p) => p.nombre === a.proveedorSugerido);
                      if (prov) ensurePedido(eventoId, prov.id);
                      updateItem(eventoId, active.id, r.id, {
                        servicio: a.nombre,
                        unitCur: "USD",
                        unit: a.precioUsd,
                        proveedor: a.proveedorSugerido === "—" ? "" : a.proveedorSugerido,
                      });
                      apiPatchCotizacionItem(eventoId, active.id, r.id, {
                        servicio: a.nombre,
                        unitCur: "USD",
                        unit: a.precioUsd,
                        proveedor: a.proveedorSugerido === "—" ? "" : a.proveedorSugerido,
                      }).catch(() => {});
                    }}
                  />
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <SearchDropdown
                    valueId={
                      proveedores.find((p) => p.nombre === r.proveedor)?.id ?? ""
                    }
                    placeholder="— (opcional) —"
                    items={proveedoresItems}
                    onChange={(id) => {
                      if (!canEdit) {
                        gate.ensureAuthed();
                        return;
                      }
                      if (id === "__new__") {
                        setProvRowItemId(r.id);
                        setShowNewProv(true);
                        return;
                      }
                      if (!id) {
                        updateItem(eventoId, active.id, r.id, { proveedor: "" });
                        apiPatchCotizacionItem(eventoId, active.id, r.id, { proveedor: "" }).catch(() => {});
                        return;
                      }
                      const p = proveedores.find((x) => x.id === id);
                      if (p) ensurePedido(eventoId, p.id);
                      updateItem(eventoId, active.id, r.id, { proveedor: p?.nombre ?? "" });
                      apiPatchCotizacionItem(eventoId, active.id, r.id, { proveedor: p?.nombre ?? "" }).catch(() => {});
                    }}
                  />
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <input
                    type="number"
                    value={r.pax}
                    onChange={(e) =>
                      canEdit
                        ? updateItem(eventoId, active.id, r.id, { pax: Number(e.target.value) })
                        : gate.ensureAuthed()
                    }
                    onBlur={() =>
                      canEdit
                        ? apiPatchCotizacionItem(eventoId, active.id, r.id, { pax: r.pax }).catch((e) => {
                            gate.handleAuthError(e);
                          })
                        : undefined
                    }
                    disabled={!canEdit}
                    style={{
                      width: 90,
                      border: "0.5px solid var(--color-border-secondary)",
                      borderRadius: 10,
                      padding: "7px 11px",
                      background: "var(--color-background-primary)",
                      color: "var(--color-text-primary)",
                      fontSize: 12,
                    }}
                  />
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select
                      value={(r.unitCur ?? ev.cur) as Currency}
                      onChange={(e) =>
                        canEdit
                          ? updateItem(eventoId, active.id, r.id, { unitCur: e.target.value as Currency })
                          : gate.ensureAuthed()
                      }
                      onBlur={() =>
                        canEdit
                          ? apiPatchCotizacionItem(eventoId, active.id, r.id, { unitCur: r.unitCur }).catch((e) => {
                              gate.handleAuthError(e);
                            })
                          : undefined
                      }
                      disabled={!canEdit}
                      style={{
                        width: 78,
                        border: "0.5px solid var(--color-border-secondary)",
                        borderRadius: 10,
                        padding: "7px 9px",
                        background: "var(--color-background-primary)",
                        color: "var(--color-text-primary)",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                      title="Moneda del precio unitario"
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                    <input
                      type="number"
                      value={r.unit}
                      onChange={(e) =>
                        canEdit
                          ? updateItem(eventoId, active.id, r.id, { unit: Number(e.target.value) })
                          : gate.ensureAuthed()
                      }
                      onBlur={() =>
                        canEdit
                          ? apiPatchCotizacionItem(eventoId, active.id, r.id, { unit: r.unit }).catch((e) => {
                              gate.handleAuthError(e);
                            })
                          : undefined
                      }
                      disabled={!canEdit}
                      style={{
                        width: 110,
                        border: "0.5px solid var(--color-border-secondary)",
                        borderRadius: 10,
                        padding: "7px 11px",
                        background: "var(--color-background-primary)",
                        color: "var(--color-text-primary)",
                        fontSize: 12,
                      }}
                    />
                  </div>
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 700 }}>
                  {money(((r.unitCur ?? ev.cur) as Currency) ?? ev.cur, subtotal(r))}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEdit) {
                        gate.ensureAuthed();
                        return;
                      }
                      removeItem(eventoId, active.id, r.id);
                    }}
                    onClickCapture={() => {
                      if (!canEdit) return;
                      void gate.run(async () => {
                        await apiDeleteCotizacionItem(eventoId, active.id, r.id);
                        // best-effort re-sync
                        const v = await apiFetchEventoCotizaciones(eventoId);
                        setCotizacionesForEvento(eventoId, v);
                      });
                    }}
                    disabled={!canEdit}
                    style={{
                      border: "0.5px solid var(--color-border-tertiary)",
                      background: "transparent",
                      color: "var(--color-text-secondary)",
                      borderRadius: 10,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                    title="Eliminar ítem"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}

            <tr style={{ background: "var(--color-background-secondary)" }}>
              <td colSpan={5} style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700 }}>
                Total cotizado
              </td>
              <td style={{ padding: "9px 12px", fontSize: 14, fontWeight: 800 }}>
                {onlyCur ? (
                  money(onlyCur, totalsByCur[onlyCur])
                ) : (
                  <div style={{ display: "grid", gap: 2 }}>
                    <div>{money("USD", totalsByCur.USD)}</div>
                    <div>{money("ARS", totalsByCur.ARS)}</div>
                  </div>
                )}
              </td>
            </tr>
            <tr>
              <td colSpan={5} style={{ padding: "9px 12px", textAlign: "right", color: "var(--color-text-secondary)" }}>
                Costo estimado
              </td>
              <td style={{ padding: "9px 12px", color: "var(--color-text-secondary)" }}>
                <input
                  type="number"
                  value={costoEstimado}
                  onChange={(e) =>
                    canEdit ? updateEvento(eventoId, { costo: Number(e.target.value) }) : gate.ensureAuthed()
                  }
                  disabled={!canEdit}
                  style={{
                    width: 140,
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: 10,
                    padding: "7px 11px",
                    background: "var(--color-background-primary)",
                    color: "var(--color-text-primary)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                />
              </td>
            </tr>
            <tr>
              <td
                colSpan={5}
                style={{ padding: "9px 12px", textAlign: "right", fontWeight: 800, color: "var(--color-success-fg)" }}
              >
                Margen bruto
              </td>
              <td style={{ padding: "9px 12px", fontWeight: 800, color: "var(--color-success-fg)" }}>
                {margen === null || margenPct === null ? (
                  <span style={{ color: "var(--color-text-secondary)", fontWeight: 800 }}>
                    — (mezcla de monedas)
                  </span>
                ) : (
                  <>
                    {money(cur, margen)} · {margenPct}%
                  </>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

