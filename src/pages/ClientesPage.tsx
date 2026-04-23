import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { Button, Pill } from "../ui/ui";
import { ClienteFormModal } from "../ui/ClienteFormModal";
import { Modal } from "../ui/Modal";

type ClienteVm = {
  id: string;
  empresa: string;
  contactos: { n: string; c: string; email?: string; tel?: string }[];
  eventos: number;
  facturadoUsd: number;
};

function avatar(text: string, bg: string, fg: string) {
  const init = text
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {init}
    </div>
  );
}

export function ClientesPage() {
  const eventos = useAppStore((s) => s.eventos);
  const clientesStore = useAppStore((s) => s.clientes);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const clientes = useMemo<ClienteVm[]>(() => {
    return clientesStore
      .map((c) => {
        const evs = eventos.filter((e) => e.clienteId === c.id || e.empresa === c.nombre);
        const fact = evs.filter((e) => e.cur === "USD").reduce((s, e) => s + (e.cotizado ?? 0), 0);
        return {
          id: c.id,
          empresa: c.nombre,
          contactos: c.contactos.map((ct) => ({
            n: ct.nombre,
            c: ct.cargo ?? "—",
            email: ct.email,
            tel: ct.telefono,
          })),
          eventos: evs.length,
          facturadoUsd: fact,
        };
      })
      .sort((a, b) => b.facturadoUsd - a.facturadoUsd);
  }, [clientesStore, eventos]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return clientes;
    return clientes.filter((c) => {
      const contactos = c.contactos
        .map((x) => `${x.n} ${x.email ?? ""} ${x.tel ?? ""}`)
        .join(" ");
      const hay = `${c.empresa} ${contactos}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [clientes, q]);

  const editing = editId ? clientesStore.find((c) => c.id === editId) : undefined;
  const viewing = viewId ? clientesStore.find((c) => c.id === viewId) : undefined;
  const viewingVm = viewId ? filtered.find((c) => c.id === viewId) : undefined;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore (some browsers block clipboard on http or without user gesture)
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 20, margin: 0, fontWeight: 600 }}>
            Clientes
          </h1>
          <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {filtered.length} / {clientes.length}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente o contacto..."
            style={{
              width: 240,
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 10,
              padding: "7px 11px",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-primary)",
              fontSize: 12,
            }}
          />
          <Button variant="primary" type="button" onClick={() => setShowNew(true)}>
            + Nuevo cliente
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
        {filtered.map((c) => (
          <div
            key={c.id}
            style={{
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 12,
              padding: 15,
              background: "var(--color-background-primary)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{c.empresa}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                  CRM interno · Bariloche
                </div>
              </div>
              <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                {c.eventos} eventos
              </Pill>
            </div>

            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10, marginBottom: 10 }}>
              {c.contactos.length ? (
                c.contactos.slice(0, 4).map((ct) => (
                  <div key={ct.n} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    {avatar(ct.n, "rgba(59,130,246,0.15)", "#3B82F6")}
                    <span style={{ fontSize: 12 }}>{ct.n}</span>
                    <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>· {ct.c}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Sin contactos cargados</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                Facturado:{" "}
                <strong style={{ color: "var(--color-text-primary)" }}>
                  {c.facturadoUsd > 0 ? `U$D ${c.facturadoUsd.toLocaleString("en-US")}` : "—"}
                </strong>
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  type="button"
                  style={{ fontSize: 11, padding: "6px 10px" }}
                  onClick={() => setViewId(c.id)}
                >
                  Ver
                </Button>
                <Button type="button" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => setEditId(c.id)}>
                  Editar
                </Button>
                <Link to={`/eventos?q=${encodeURIComponent(c.empresa)}`}>
                  <Button type="button" style={{ fontSize: 11, padding: "6px 10px" }}>
                    Ver eventos
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showNew ? (
        <ClienteFormModal
          mode="create"
          onClose={() => setShowNew(false)}
          onSaved={() => {
            // queda creado y visible
          }}
        />
      ) : null}

      {editing ? (
        <ClienteFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditId(null)}
          onSaved={() => {
            // se actualiza in-place
          }}
        />
      ) : null}

      {viewing && viewingVm ? (
        <Modal
          title={viewingVm.empresa}
          onClose={() => setViewId(null)}
          footer={
            <>
              <Button type="button" onClick={() => setViewId(null)}>
                Cerrar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setViewId(null);
                  setEditId(viewing.id);
                }}
              >
                Editar
              </Button>
              <Link to={`/eventos?q=${encodeURIComponent(viewingVm.empresa)}`}>
                <Button type="button">Ver eventos</Button>
              </Link>
            </>
          }
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                {viewingVm.eventos} eventos
              </Pill>
              <Pill style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                Facturado: {viewingVm.facturadoUsd > 0 ? `U$D ${viewingVm.facturadoUsd.toLocaleString("en-US")}` : "—"}
              </Pill>
            </div>

            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  color: "var(--color-text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  marginBottom: 8,
                }}
              >
                Contactos
              </div>

              {viewing.contactos.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {viewing.contactos.map((ct) => (
                    <div
                      key={ct.id}
                      style={{
                        border: "0.5px solid var(--color-border-tertiary)",
                        borderRadius: 12,
                        padding: 10,
                        background: "var(--color-background-primary)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {avatar(ct.nombre, "rgba(59,130,246,0.15)", "#3B82F6")}
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>{ct.nombre}</div>
                          <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                            {ct.cargo ?? "—"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Email:</span>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{ct.email ?? "—"}</span>
                          {ct.email ? (
                            <Button
                              type="button"
                              style={{ fontSize: 11, padding: "5px 9px" }}
                              onClick={() => void copy(ct.email!)}
                            >
                              Copiar
                            </Button>
                          ) : null}
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Tel:</span>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{ct.telefono ?? "—"}</span>
                          {ct.telefono ? (
                            <Button
                              type="button"
                              style={{ fontSize: 11, padding: "5px 9px" }}
                              onClick={() => void copy(ct.telefono!)}
                            >
                              Copiar
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Sin contactos cargados</div>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

