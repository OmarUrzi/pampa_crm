import { useMemo, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { Button, Pill } from "../ui/ui";
import { ProveedorFormModal } from "../ui/ProveedorFormModal";
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
  Alojamiento: "#F1EFE8",
  Catering: "#FAECE7",
};

function stars(r: number) {
  const rounded = Math.round(r);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ color: i + 1 <= rounded ? "#EA6536" : "var(--color-border-secondary)" }}>
            ★
          </span>
        ))}
      </span>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{r.toFixed(1)}</span>
    </span>
  );
}

export function ProveedoresPage() {
  const proveedores = useAppStore((s) => s.proveedores);
  const pedidosByEvento = useAppStore((s) => s.proveedoresPedidosByEventoId);
  const eventos = useAppStore((s) => s.eventos);
  const canEdit = useCanEdit();
  const gate = useAuthGate();

  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const statsByProveedorId = useMemo(() => {
    const map = new Map<
      string,
      { eventos: number; ratings: number[]; respDays: number[] }
    >();

    for (const e of eventos) {
      const pedidos = pedidosByEvento[e.id] ?? [];
      for (const p of pedidos) {
        const pid = p.proveedorId;
        if (!pid) continue;
        const cur = map.get(pid) ?? { eventos: 0, ratings: [], respDays: [] };
        cur.eventos += 1;
        if (typeof p.rating === "number") cur.ratings.push(p.rating);
        if (typeof p.pedidoAt === "number" && typeof p.respondioAt === "number") {
          const days = Math.max(
            0,
            Math.round((p.respondioAt - p.pedidoAt) / (1000 * 60 * 60 * 24)),
          );
          cur.respDays.push(days);
        }
        map.set(pid, cur);
      }
    }
    return map;
  }, [eventos, pedidosByEvento]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return proveedores;
    return proveedores.filter((p) => {
      const contacts = p.contactos
        .map((c) => `${c.nombre} ${c.email ?? ""} ${c.telefono ?? ""}`)
        .join(" ");
      const hay = `${p.nombre} ${p.categoria} ${contacts}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [proveedores, q]);

  const editing = editId ? proveedores.find((p) => p.id === editId) : undefined;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>
            Proveedores
          </h1>
          <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {filtered.length} / {proveedores.length}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proveedor o contacto..."
            style={{
              width: 260,
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 10,
              padding: "7px 11px",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-primary)",
              fontSize: 12,
            }}
          />
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              if (!gate.ensureAuthed()) return;
              setShowNew(true);
            }}
            disabled={!canEdit}
          >
            + Nuevo proveedor
          </Button>
        </div>
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              {["Proveedor", "Categoría", "Contacto", "Rating", "Eventos", "Resp.", "Acciones"].map((h) => (
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
            {filtered.map((p) => {
              const st = statsByProveedorId.get(p.id) ?? {
                eventos: 0,
                ratings: [],
                respDays: [],
              };
              const ratingAvg =
                st.ratings.length > 0
                  ? st.ratings.reduce((a, b) => a + b, 0) / st.ratings.length
                  : null;
              const respAvg =
                st.respDays.length > 0
                  ? st.respDays.reduce((a, b) => a + b, 0) / st.respDays.length
                  : null;

              const respDays = respAvg === null ? null : Math.round(respAvg);
              const dc =
                respDays === null
                  ? "var(--color-text-secondary)"
                  : respDays <= 1
                    ? "#1D9E75"
                    : respDays <= 2
                      ? "var(--color-text-primary)"
                      : "#D97706";
              const mainContact = p.contactos[0]?.nombre ?? "—";
              const evCount = st.eventos;
              return (
                <tr key={p.id}>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 700 }}>
                    {p.nombre}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <Pill style={{ background: CATCOL[p.categoria] ?? "#eee", color: "var(--color-text-secondary)" }}>{p.categoria}</Pill>
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                    {mainContact}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {ratingAvg === null ? (
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>—</span>
                    ) : (
                      stars(ratingAvg)
                    )}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                    {evCount}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", color: dc, fontWeight: (respDays ?? 0) > 2 ? 700 : 500 }}>
                    {respDays === null ? "—" : `${respDays}d`}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button
                        type="button"
                        style={{ fontSize: 11, padding: "6px 10px" }}
                        onClick={() => {
                          if (!gate.ensureAuthed()) return;
                          setEditId(p.id);
                        }}
                        disabled={!canEdit}
                      >
                        Editar
                      </Button>
                      <Button type="button" style={{ fontSize: 11, padding: "6px 10px" }}>
                        ✉ Cotizar
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew ? (
        <ProveedorFormModal
          mode="create"
          onClose={() => setShowNew(false)}
          onSaved={() => {
            // queda creado
          }}
        />
      ) : null}

      {editing ? (
        <ProveedorFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditId(null)}
          onSaved={() => {
            // se actualiza
          }}
        />
      ) : null}
    </div>
  );
}

