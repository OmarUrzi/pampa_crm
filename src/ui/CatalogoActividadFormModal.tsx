import { useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./ui";
import { SearchDropdown } from "./SearchDropdown";
import { useAppStore } from "../state/useAppStore";
import type { CatalogoActividad } from "../state/catalogo";
import {
  apiCreateActividad,
  apiDeleteActividad,
  apiPatchActividad,
  apiUploadActividadFoto,
  apiDeleteActividadFoto,
} from "../api/catalogo";
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
  /** Fotos persistidas (URL absoluta o blob del API) */
  fotos: Array<{ id: string; url: string }>;
};

function toForm(a: CatalogoActividad, proveedores: { id: string; nombre: string }[]): FormState {
  const prov = proveedores.find((p) => p.nombre === a.proveedorSugerido);
  const fotos = (a.fotos ?? [])
    .map((x: unknown) => {
      if (!x) return null;
      if (typeof x === "string") {
        const url = x.trim();
        return url ? { id: `tmp-url-${Date.now()}-${Math.random().toString(16).slice(2)}`, url } : null;
      }
      const o = x as { id?: string; url?: string };
      const id = String(o.id ?? "").trim();
      const url = String(o.url ?? "").trim();
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

function blobUrlForFotoId(fotoId: string) {
  return `${API_BASE}/catalogo/fotos/${encodeURIComponent(fotoId)}/blob`;
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
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [confirmDeleteFoto, setConfirmDeleteFoto] = useState<{ id: string } | null>(null);
  const libraryFileRef = useRef<HTMLInputElement | null>(null);

  const [f, setF] = useState<FormState>(() => {
    if (mode === "edit" && initial) return toForm(initial, proveedores);
    return { nombre: "", descripcion: "", categoria: "", precioUsd: 0, proveedorId: "", fotos: [] };
  });

  const fotosWithAbs = useMemo(() => f.fotos.map((ph) => ({ ...ph, absUrl: toAbsoluteUrl(ph.url) })), [f.fotos]);

  const provItems = useMemo(
    () => [
      { id: "", label: "— Sin proveedor sugerido —", sublabel: "Opcional" },
      ...proveedores.map((p) => ({ id: p.id, label: p.nombre, sublabel: p.categoria })),
    ],
    [proveedores],
  );

  const canDelete = mode === "edit" && !!initial;
  const actividadIdForLibrary = mode === "edit" && initial ? initial.id : null;

  async function afterSavedSafe() {
    try {
      await onSaved?.();
    } catch {
      // ignore
    }
  }

  function mapToStore(a: {
    id: string;
    nombre: string;
    descripcion?: string | null;
    categoria: string;
    precioUsd?: number | null;
    proveedorTxt?: string | null;
    fotos?: Array<{ id: string; url?: string | null; blobUrl?: string | null }>;
  }): CatalogoActividad {
    return {
      id: a.id,
      nombre: a.nombre,
      descripcion: a.descripcion ?? "",
      categoria: a.categoria,
      precioUsd: a.precioUsd ?? 0,
      proveedorSugerido: a.proveedorTxt ?? "—",
      fotos: (a.fotos ?? [])
        .map((ph) => {
          const raw = String(ph.url ?? ph.blobUrl ?? "").trim();
          const url = raw.startsWith("/") ? `${API_BASE}${raw}` : raw;
          const id = String(ph.id ?? "").trim();
          return id && url ? { id, url } : null;
        })
        .filter(Boolean) as Array<{ id: string; url: string }>,
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
    };

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
          fotos: [],
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

  async function handleLibraryPickFiles(files: File[]) {
    if (!actividadIdForLibrary || !canEdit) return;
    setLibraryBusy(true);
    try {
      let next = [...f.fotos];
      for (const file of files) {
        const res = await gate.run(async () => await apiUploadActividadFoto({ actividadId: actividadIdForLibrary, file }));
        const id = res?.foto?.id;
        if (!id) continue;
        const url = blobUrlForFotoId(id);
        next = [...next, { id, url }];
      }
      setF((s) => ({ ...s, fotos: next }));
      setCatalogo((useAppStore.getState().catalogo ?? []).map((x) => (x.id === actividadIdForLibrary ? { ...x, fotos: next } : x)));
      await afterSavedSafe();
    } finally {
      setLibraryBusy(false);
    }
  }

  return (
    <>
      {confirmDeleteFoto && actividadIdForLibrary ? (
        <ConfirmModal
          title="Eliminar foto"
          message="¿Realmente querés eliminar esta foto?"
          confirmText="Sí, eliminar"
          cancelText="Cancelar"
          danger
          zIndex={220}
          onClose={() => setConfirmDeleteFoto(null)}
          onConfirm={() => {
            const { id } = confirmDeleteFoto;
            setConfirmDeleteFoto(null);
            void gate.run(async () => {
              await apiDeleteActividadFoto({ actividadId: actividadIdForLibrary, fotoId: id });
              const act = useAppStore.getState().catalogo.find((x) => x.id === actividadIdForLibrary);
              const next = (act?.fotos ?? []).filter((p) => p.id !== id);
              setCatalogo(
                (useAppStore.getState().catalogo ?? []).map((x) => (x.id === actividadIdForLibrary ? { ...x, fotos: next } : x)),
              );
              setF((s) => ({ ...s, fotos: next }));
              await afterSavedSafe();
            });
          }}
        />
      ) : null}

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

      {showLibrary && actividadIdForLibrary ? (
        <Modal
          title="Biblioteca de fotos"
          zIndex={160}
          maxWidth="min(920px, 100%)"
          onClose={() => {
            if (libraryBusy) return;
            setShowLibrary(false);
          }}
          footer={
            <Button type="button" onClick={() => setShowLibrary(false)} disabled={libraryBusy}>
              Cerrar
            </Button>
          }
        >
          <input
            ref={libraryFileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void handleLibraryPickFiles(files);
            }}
          />
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 14px", lineHeight: 1.5 }}>
            Subí imágenes desde tu computadora. Se guardan en la base de datos asociadas a esta actividad.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 12,
            }}
          >
            {fotosWithAbs.map((ph) => (
              <div
                key={ph.id}
                style={{
                  position: "relative",
                  aspectRatio: "1",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "0.5px solid var(--color-border-tertiary)",
                  background: "var(--color-background-secondary)",
                }}
              >
                <img src={ph.absUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteFoto({ id: ph.id })}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      border: "none",
                      background: "rgba(0,0,0,0.55)",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 900,
                      lineHeight: 1,
                    }}
                    aria-label="Eliminar foto"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            {canEdit ? (
              <button
                type="button"
                disabled={libraryBusy}
                onClick={() => libraryFileRef.current?.click()}
                style={{
                  aspectRatio: "1",
                  borderRadius: 12,
                  border: "1.5px dashed var(--color-border-secondary)",
                  background: "var(--color-background-primary)",
                  cursor: libraryBusy ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 36,
                  fontWeight: 300,
                  color: "var(--color-text-secondary)",
                  opacity: libraryBusy ? 0.6 : 1,
                }}
                aria-label="Agregar fotos"
                title="Agregar fotos"
              >
                +
              </button>
            ) : null}
          </div>
          {libraryBusy ? (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--color-text-secondary)" }}>Subiendo…</div>
          ) : null}
        </Modal>
      ) : null}

      <Modal title={mode === "create" ? "Nueva actividad" : "Editar actividad"} onClose={onClose}>
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
            <label style={labelStyle}>Fotos</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 6 }}>
              <Button type="button" variant="primary" disabled={!canEdit || mode === "create"} onClick={() => setShowLibrary(true)}>
                Biblioteca de fotos{f.fotos.length ? ` (${f.fotos.length})` : ""}
              </Button>
              {mode === "create" ? (
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                  Guardá la actividad primero; después podés abrir la biblioteca y subir archivos.
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "0.5px solid var(--color-border-tertiary)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
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
