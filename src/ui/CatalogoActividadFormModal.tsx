import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./ui";
import { SearchDropdown } from "./SearchDropdown";
import { useAppStore } from "../state/useAppStore";
import type { CatalogoActividad } from "../state/catalogo";
import { apiCreateActividad, apiDeleteActividad, apiPatchActividad } from "../api/catalogo";
import { useCanEdit } from "../auth/perms";
import { useAuthGate } from "../auth/useAuthGate";

type FormState = {
  nombre: string;
  descripcion: string;
  categoria: string;
  precioUsd: number;
  proveedorId: string;
  fotos: string[];
};

function toForm(a: CatalogoActividad, proveedores: { id: string; nombre: string }[]): FormState {
  const prov = proveedores.find((p) => p.nombre === a.proveedorSugerido);
  return {
    nombre: a.nombre,
    descripcion: a.descripcion ?? "",
    categoria: a.categoria,
    precioUsd: a.precioUsd,
    proveedorId: prov?.id ?? "",
    fotos: a.fotos ?? [],
  };
}

export function CatalogoActividadFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: CatalogoActividad;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const proveedores = useAppStore((s) => s.proveedores);
  const actividades = useAppStore((s) => s.catalogo);
  const setCatalogo = useAppStore((s) => s.setCatalogo);
  const canEdit = useCanEdit();
  const gate = useAuthGate();
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState<FormState>(() => {
    if (mode === "edit" && initial) return toForm(initial, proveedores);
    return { nombre: "", descripcion: "", categoria: "", precioUsd: 0, proveedorId: "", fotos: [] };
  });

  const provItems = useMemo(
    () => [
      { id: "", label: "— Sin proveedor sugerido —", sublabel: "Opcional" },
      ...proveedores.map((p) => ({ id: p.id, label: p.nombre, sublabel: p.categoria })),
    ],
    [proveedores],
  );

  const canDelete = mode === "edit" && !!initial;

  async function afterSavedSafe() {
    try {
      await onSaved?.();
    } catch {
      // ignore (UI already updated optimistically)
    }
  }

  function mapToStore(a: any): CatalogoActividad {
    return {
      id: a.id,
      nombre: a.nombre,
      descripcion: a.descripcion ?? "",
      categoria: a.categoria,
      precioUsd: a.precioUsd ?? 0,
      proveedorSugerido: a.proveedorTxt ?? "—",
      fotos: (a.fotos ?? []).map((f: any) => f.url),
    };
  }

  function save() {
    if (busy) return;
    const prov = proveedores.find((p) => p.id === f.proveedorId);
    const payload = {
      nombre: f.nombre.trim() || "—",
      descripcion: f.descripcion.trim(),
      categoria: f.categoria.trim() || "—",
      precioUsd: Number.isFinite(f.precioUsd) ? f.precioUsd : 0,
      proveedorTxt: prov?.nombre ?? undefined,
      fotos: f.fotos
        .map((x) => x.trim())
        .filter(Boolean)
        .map((url) => ({ url })),
    };

    // Close immediately for snappier UX; update list optimistically.
    onClose();

    void gate.run(async () => {
      setBusy(true);
      if (mode === "create") {
        const tmpId = `tmp-act-${Date.now()}`;
        const optimistic: CatalogoActividad = {
          id: tmpId,
          nombre: payload.nombre,
          descripcion: payload.descripcion ?? "",
          categoria: payload.categoria,
          precioUsd: payload.precioUsd ?? 0,
          proveedorSugerido: payload.proveedorTxt ?? "—",
          fotos: payload.fotos?.map((x) => x.url) ?? [],
        };
        setCatalogo([optimistic, ...actividades]);

        const res = await apiCreateActividad(payload);
        const created = mapToStore(res.actividad);
        setCatalogo((useAppStore.getState().catalogo ?? []).map((x) => (x.id === tmpId ? created : x)));
        await afterSavedSafe();
        return;
      }
      if (!initial) return;
      const res = await apiPatchActividad(initial.id, {
        nombre: payload.nombre,
        descripcion: payload.descripcion,
        categoria: payload.categoria,
        precioUsd: payload.precioUsd,
        proveedorTxt: payload.proveedorTxt ?? null,
      });
      const updated = mapToStore(res.actividad);
      setCatalogo((useAppStore.getState().catalogo ?? []).map((x) => (x.id === updated.id ? updated : x)));
      await afterSavedSafe();
    }).finally(() => {
      setBusy(false);
    });
  }

  return (
    <Modal
      title={mode === "create" ? "Nueva actividad" : "Editar actividad"}
      onClose={onClose}
      footer={
        <>
          {canDelete ? (
            <Button
              type="button"
              onClick={() => {
                if (!initial) return;
                void gate.run(async () => {
                  await apiDeleteActividad(initial.id);
                  setCatalogo(actividades.filter((x) => x.id !== initial.id));
                  await afterSavedSafe();
                  onClose();
                });
              }}
              disabled={!canEdit}
            >
              Eliminar
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="button" onClick={save} disabled={!canEdit || busy}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Actividad</label>
          <input
            value={f.nombre}
            onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))}
            style={inputStyle}
            placeholder="Ej: Cabalgata en los Andes"
            disabled={!canEdit}
          />
        </div>
        <div>
          <label style={labelStyle}>Categoría</label>
          <input
            value={f.categoria}
            onChange={(e) => setF((s) => ({ ...s, categoria: e.target.value }))}
            style={inputStyle}
            placeholder="Ej: Outdoor"
            disabled={!canEdit}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Descripción</label>
          <textarea
            value={f.descripcion}
            onChange={(e) => setF((s) => ({ ...s, descripcion: e.target.value }))}
            placeholder="Texto para usar en Slides / presentación…"
            style={{
              ...inputStyle,
              minHeight: 90,
              resize: "vertical",
              fontFamily: "inherit",
            }}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label style={labelStyle}>Precio (USD / pax)</label>
          <input
            type="number"
            value={f.precioUsd}
            onChange={(e) => setF((s) => ({ ...s, precioUsd: Number(e.target.value) }))}
            style={inputStyle}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label style={labelStyle}>Proveedor sugerido</label>
          <SearchDropdown
            valueId={f.proveedorId}
            placeholder="— (opcional) —"
            items={provItems}
            onChange={(id) => {
              if (!canEdit) {
                gate.ensureAuthed();
                return;
              }
              setF((s) => ({ ...s, proveedorId: id }));
            }}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Álbum de fotos (URLs)</label>
          <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
            {(f.fotos.length ? f.fotos : [""]).map((url, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={url}
                  onChange={(e) => {
                    const v = e.target.value;
                    setF((s) => {
                      const fotos = s.fotos.length ? [...s.fotos] : [""];
                      fotos[idx] = v;
                      return { ...s, fotos };
                    });
                  }}
                  placeholder="https://…"
                  style={{ ...inputStyle, marginTop: 0 }}
                  disabled={!canEdit}
                />
                <Button
                  type="button"
                  onClick={() =>
                    setF((s) => ({ ...s, fotos: s.fotos.filter((_, i) => i !== idx) }))
                  }
                  disabled={!f.fotos.length || !canEdit}
                >
                  Quitar
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                onClick={() => setF((s) => ({ ...s, fotos: [...s.fotos, ""] }))}
                disabled={!canEdit}
              >
                + Agregar foto
              </Button>
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-secondary)" }}>
            Por ahora usamos URLs. En MVP lo pasamos a subida de archivos.
          </div>
        </div>
      </div>
    </Modal>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "var(--color-text-secondary)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 10,
  padding: "8px 11px",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  fontSize: 12,
  marginTop: 6,
};

