import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./ui";
import { SearchDropdown } from "./SearchDropdown";
import { useAppStore } from "../state/useAppStore";
import type { CatalogoActividad } from "../state/catalogo";
import { apiCreateActividad, apiDeleteActividad, apiPatchActividad, apiUploadActividadFoto, apiDeleteActividadFoto } from "../api/catalogo";
import { useCanEdit } from "../auth/perms";
import { useAuthGate } from "../auth/useAuthGate";
import { ConfirmModal } from "./ConfirmModal";
import { API_BASE } from "../api/client";

type FormState = {
  nombre: string;
  descripcion: string;
  categoria: string;
  precioUsd: number;
  proveedorId: string;
  fotos: Array<{ id: string; url: string }>;
  uploads: File[];
};

function toForm(a: CatalogoActividad, proveedores: { id: string; nombre: string }[]): FormState {
  const prov = proveedores.find((p) => p.nombre === a.proveedorSugerido);
  const fotos = (a.fotos ?? [])
    .map((x: any) => {
      if (!x) return null;
      if (typeof x === "string") {
        const url = x.trim();
        return url ? { id: `tmp-url-${Date.now()}-${Math.random().toString(16).slice(2)}`, url } : null;
      }
      const id = String((x as any).id ?? "").trim();
      const url = String((x as any).url ?? "").trim();
      return id && url ? { id, url } : null;
    })
    .filter(Boolean) as Array<{ id: string; url: string }>;
  return {
    nombre: a.nombre,
    descripcion: a.descripcion ?? "",
    categoria: a.categoria,
    precioUsd: a.precioUsd,
    proveedorId: prov?.id ?? "",
    fotos,
    uploads: [],
  };
}

function toAbsoluteUrl(url: string) {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [f, setF] = useState<FormState>(() => {
    if (mode === "edit" && initial) return toForm(initial, proveedores);
    return { nombre: "", descripcion: "", categoria: "", precioUsd: 0, proveedorId: "", fotos: [], uploads: [] };
  });

  const fotosWithAbs = useMemo(() => f.fotos.map((ph) => ({ ...ph, url: toAbsoluteUrl(ph.url) })), [f.fotos]);

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
      fotos: (a.fotos ?? [])
        .map((ph: any) => ({
          id: String(ph.id ?? ""),
          url: String(ph.url ?? ph.blobUrl ?? "").trim(),
        }))
        .filter((x: any) => x.id && x.url),
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
      fotos: f.fotos.map((x) => ({ url: x.url })),
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
          fotos: payload.fotos?.map((x) => ({ id: `tmp-photo-${Date.now()}-${Math.random().toString(16).slice(2)}`, url: x.url })) ?? [],
        };
        setCatalogo([optimistic, ...actividades]);

        const res = await apiCreateActividad(payload);
        const created = mapToStore(res.actividad);
        setCatalogo((useAppStore.getState().catalogo ?? []).map((x) => (x.id === tmpId ? created : x)));

        // Upload selected files (best-effort). Refresh will happen in caller (CatalogoPage onSaved).
        for (const file of f.uploads) {
          try {
            await apiUploadActividadFoto({ actividadId: created.id, file });
          } catch {
            // ignore (user can retry)
          }
        }

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

      for (const file of f.uploads) {
        try {
          await apiUploadActividadFoto({ actividadId: updated.id, file });
        } catch {
          // ignore
        }
      }

      await afterSavedSafe();
    }).finally(() => {
      setBusy(false);
    });
  }

  return (
    <>
      {confirmDelete && canDelete && initial ? (
        <ConfirmModal
          title="Eliminar actividad"
          message="¿Realmente querés eliminar esta actividad del catálogo?"
          confirmText="Sí, eliminar"
          cancelText="Cancelar"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void gate.run(async () => {
              await apiDeleteActividad(initial.id);
              setCatalogo(actividades.filter((x) => x.id !== initial.id));
              await afterSavedSafe();
              onClose();
            });
          }}
        />
      ) : null}

      <Modal
        title={mode === "create" ? "Nueva actividad" : "Editar actividad"}
        onClose={onClose}
        footer={
          <>
            {canDelete ? (
              <Button type="button" onClick={() => setConfirmDelete(true)} disabled={!canEdit}>
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
            {(fotosWithAbs.length ? fotosWithAbs : [{ id: "tmp-empty", url: "" }]).map((ph, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {ph.url ? (
                  <a
                    href={ph.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: 40,
                      height: 28,
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "0.5px solid var(--color-border-tertiary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      background: "var(--color-background-secondary)",
                      textDecoration: "none",
                    }}
                    title="Ver foto"
                  >
                    <img src={ph.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </a>
                ) : (
                  <div style={{ width: 40, height: 28, borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }} />
                )}
                <input
                  value={ph.url}
                  onChange={(e) => {
                    const v = e.target.value;
                    setF((s) => {
                      const fotos = s.fotos.length ? [...s.fotos] : [{ id: `tmp-url-${Date.now()}`, url: "" }];
                      fotos[idx] = { ...fotos[idx]!, url: v };
                      return { ...s, fotos };
                    });
                  }}
                  placeholder="https://…"
                  style={{ ...inputStyle, marginTop: 0 }}
                  disabled={!canEdit}
                />
                <Button
                  type="button"
                  onClick={() => {
                    const cur = f.fotos[idx];
                    if (!cur) return;
                    if (!canEdit) return void gate.ensureAuthed();
                    void gate.run(async () => {
                      // If it is an existing photo (not tmp), delete in backend too.
                      if (cur.id && !cur.id.startsWith("tmp-") && cur.id !== "tmp-empty") {
                        await apiDeleteActividadFoto({ actividadId: initial?.id ?? "", fotoId: cur.id });
                      }
                      setF((s) => ({ ...s, fotos: s.fotos.filter((_, i) => i !== idx) }));
                    });
                  }}
                  disabled={!canEdit}
                >
                  Quitar
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                onClick={() => setF((s) => ({ ...s, fotos: [...s.fotos, { id: `tmp-url-${Date.now()}`, url: "" }] }))}
                disabled={!canEdit}
              >
                + Agregar foto
              </Button>
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-secondary)" }}>
            Podés usar URLs o subir archivos (se guardan en la base).
          </div>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Subir fotos (archivos)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setF((s) => ({ ...s, uploads: files }));
            }}
            style={{ ...inputStyle, padding: "7px 11px" }}
            disabled={!canEdit}
          />
          {f.uploads.length ? (
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-secondary)" }}>
              {f.uploads.length} archivo(s) seleccionados.
            </div>
          ) : null}
        </div>
        </div>
      </Modal>
    </>
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

