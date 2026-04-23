import { useMemo, useState } from "react";
import { Button, Chip, Pill } from "../ui/ui";
import { useAppStore } from "../state/useAppStore";
import { CatalogoActividadFormModal } from "../ui/CatalogoActividadFormModal";
import { apiFetch } from "../api/client";
import { apiListCatalogo } from "../api/catalogo";
import { useCanEdit } from "../auth/perms";
import { useAuthGate } from "../auth/useAuthGate";

const CATCOL: Record<string, string> = {
  Outdoor: "#EAF3DE",
  "Gastronomía": "#FAEEDA",
  "Team Building": "#EDF5FF",
  Eventos: "#FAECE7",
  Cultural: "#EEEDFE",
  Transporte: "#E1F5EE",
  "Audio/Técnica": "#F1EFE8",
};

export function CatalogoPage() {
  const actividades = useAppStore((s) => s.catalogo);
  const setCatalogo = useAppStore((s) => s.setCatalogo);
  const canEdit = useCanEdit();
  const gate = useAuthGate();
  const [catFilter, setCatFilter] = useState("Todos");
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [slidesBusy, setSlidesBusy] = useState(false);

  const cats = useMemo(() => {
    const set = new Set<string>(["Todos"]);
    for (const a of actividades) set.add(a.categoria);
    return [...set.values()];
  }, [actividades]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = actividades;
    if (catFilter !== "Todos") list = list.filter((a) => a.categoria === catFilter);
    if (qq) {
      list = list.filter((a) => {
        const hay = `${a.nombre} ${a.categoria} ${a.proveedorSugerido}`.toLowerCase();
        return hay.includes(qq);
      });
    }
    return list;
  }, [actividades, catFilter, q]);

  const edit = editId ? actividades.find((a) => a.id === editId) ?? null : null;

  return (
    <div>
      {showNew ? (
        <CatalogoActividadFormModal
          mode="create"
          onClose={() => setShowNew(false)}
          onSaved={async () => {
            const res = await apiListCatalogo();
            setCatalogo(
              res.actividades.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                descripcion: a.descripcion ?? "",
                categoria: a.categoria,
                precioUsd: a.precioUsd ?? 0,
                proveedorSugerido: a.proveedorTxt ?? "—",
                fotos: a.fotos.map((f) => f.url),
              })),
            );
          }}
        />
      ) : null}
      {edit ? (
        <CatalogoActividadFormModal
          mode="edit"
          initial={edit}
          onClose={() => setEditId(null)}
          onSaved={async () => {
            const res = await apiListCatalogo();
            setCatalogo(
              res.actividades.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                descripcion: a.descripcion ?? "",
                categoria: a.categoria,
                precioUsd: a.precioUsd ?? 0,
                proveedorSugerido: a.proveedorTxt ?? "—",
                fotos: a.fotos.map((f) => f.url),
              })),
            );
          }}
        />
      ) : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>
          Catálogo de actividades
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="button"
            onClick={async () => {
              setSlidesBusy(true);
              try {
                await gate.run(async () => {
                  const res = await apiFetch<{ ok: boolean; url: string }>("/slides/generate", {
                    method: "POST",
                    body: JSON.stringify({
                      prompt:
                        "Generá slides de catálogo de actividades (outdoor, gastronomía y team building) con fotos cuando existan URLs.",
                    }),
                  });
                  if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer");
                });
              } finally {
                setSlidesBusy(false);
              }
            }}
            disabled={!canEdit || slidesBusy}
          >
            {slidesBusy ? "Generando…" : "Generar Slides ↗"}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              if (!gate.ensureAuthed()) return;
              setShowNew(true);
            }}
            disabled={!canEdit}
          >
            + Nueva actividad
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar actividad / categoría / proveedor…"
          style={{
            flex: 1,
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: 12,
            padding: "9px 12px",
            background: "var(--color-background-primary)",
            color: "var(--color-text-primary)",
            fontSize: 12,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 7, marginBottom: 16, flexWrap: "wrap" }}>
        {cats.map((c) => (
          <Chip key={c} type="button" active={catFilter === c} onClick={() => setCatFilter(c)}>
            {c}
          </Chip>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
        {filtered.map((a) => (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (!gate.ensureAuthed()) return;
              setEditId(a.id);
            }}
            style={{
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--color-background-primary)",
              cursor: canEdit ? "pointer" : "not-allowed",
              opacity: canEdit ? 1 : 0.75,
            }}
          >
            <div style={{ height: 44, background: CATCOL[a.categoria] ?? "#f5f5f5", padding: "0 14px", display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {a.categoria}
              </span>
            </div>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{a.nombre}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  U$D {a.precioUsd}
                  <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)" }}>/pax</span>
                </span>
              </div>
              {a.descripcion ? (
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                  {a.descripcion.length > 120 ? `${a.descripcion.slice(0, 120)}…` : a.descripcion}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                  Editar
                </Pill>
                <Pill style={{ background: "#EDF5FF", color: "#185FA5" }}>
                  Fotos: {a.fotos?.length ?? 0}
                </Pill>
              </div>
              {a.proveedorSugerido !== "—" ? (
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>· {a.proveedorSugerido}</div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>· (sin proveedor sugerido)</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

