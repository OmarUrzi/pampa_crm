import { useMemo, useState } from "react";
import type { Cliente, Contacto } from "../types";
import { useAppStore } from "../state/useAppStore";
import { Button } from "./ui";
import { Modal } from "./Modal";
import { ConfirmModal } from "./ConfirmModal";
import { apiCreateCliente, apiPatchCliente } from "../api/clientes";
import { useAuthGate } from "../auth/useAuthGate";
import { useCanEdit } from "../auth/perms";
import { useNoticeStore } from "../state/useNoticeStore";

type FormState = {
  nombre: string;
  sector: string;
  contactos: Array<{
    id: string;
    nombre: string;
    cargo: string;
    email: string;
    telefono: string;
  }>;
};

function toForm(c: Cliente): FormState {
  return {
    nombre: c.nombre,
    sector: c.sector ?? "",
    contactos: c.contactos.map((ct) => ({
      id: ct.id,
      nombre: ct.nombre,
      cargo: ct.cargo ?? "",
      email: ct.email ?? "",
      telefono: ct.telefono ?? "",
    })),
  };
}

export function ClienteFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: Cliente;
  onClose: () => void;
  onSaved: (clienteId: string) => void;
}) {
  const addCliente = useAppStore((s) => s.addCliente);
  const updateCliente = useAppStore((s) => s.updateCliente);
  const clientes = useAppStore((s) => s.clientes);
  const setClientes = useAppStore((s) => s.setClientes);
  const gate = useAuthGate();
  const canEdit = useCanEdit();
  const notice = useNoticeStore((s) => s);
  const [busy, setBusy] = useState(false);
  const [confirmDelContactIdx, setConfirmDelContactIdx] = useState<number | null>(null);

  const [f, setF] = useState<FormState>(() => {
    if (mode === "edit" && initial) return toForm(initial);
    return {
      nombre: "",
      sector: "",
      contactos: [],
    };
  });

  const error = useMemo(() => {
    if (!f.nombre.trim()) return "Falta el nombre del cliente/empresa.";
    return null;
  }, [f.nombre]);

  function setContact(idx: number, patch: Partial<FormState["contactos"][number]>) {
    setF((s) => ({
      ...s,
      contactos: s.contactos.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  function addContact() {
    setF((s) => ({
      ...s,
      contactos: [
        ...s.contactos,
        { id: `tmp-${Date.now()}`, nombre: "", cargo: "", email: "", telefono: "" },
      ],
    }));
  }

  function deleteContact(idx: number) {
    setF((s) => ({ ...s, contactos: s.contactos.filter((_, i) => i !== idx) }));
  }

  async function save() {
    if (error) return;
    if (busy) return;
    if (!canEdit) {
      notice.show("No tenés permisos para editar.", { variant: "warning", ttlMs: 2500 });
      return;
    }
    if (!gate.ensureAuthed()) return;

    const contactos: Contacto[] = f.contactos
      .map((ct) => ({
        id: ct.id.startsWith("tmp-") ? `ct-${Date.now()}-${Math.random().toString(16).slice(2)}` : ct.id,
        nombre: ct.nombre.trim() || "—",
        cargo: ct.cargo.trim() || undefined,
        email: ct.email.trim() || undefined,
        telefono: ct.telefono.trim() || undefined,
      }))
      .filter((x) => x.nombre && x.nombre !== "—");

    setBusy(true);
    try {
      if (mode === "create") {
        // optimistic local create
        const tmpId = addCliente({
          nombre: f.nombre.trim(),
          sector: f.sector.trim() || undefined,
          contactos,
        });
        onClose();

        await gate.run(async () => {
          const res = await apiCreateCliente({
            nombre: f.nombre.trim(),
            sector: f.sector.trim() || undefined,
            contactos: contactos.map((ct) => ({
              id: undefined,
              nombre: ct.nombre,
              cargo: ct.cargo,
              email: ct.email,
              telefono: ct.telefono,
            })),
          });
          const created = res?.cliente;
          if (created) {
            const mapped: Cliente = {
              id: created.id,
              nombre: created.nombre,
              sector: created.sector ?? undefined,
              contactos: (created.contactos ?? []).map((ct) => ({
                id: ct.id,
                nombre: ct.nombre,
                cargo: ct.cargo ?? undefined,
                email: ct.email ?? undefined,
                telefono: ct.telefono ?? undefined,
              })),
            };
            setClientes([mapped, ...clientes.filter((c) => c.id !== tmpId)]);
            onSaved(mapped.id);
          } else {
            onSaved(tmpId);
          }
        });
        return;
      }

      if (!initial) return;
      updateCliente(initial.id, {
        nombre: f.nombre.trim(),
        sector: f.sector.trim() || undefined,
        contactos,
      });
      onClose();

      await gate.run(async () => {
        const res = await apiPatchCliente(initial.id, {
          nombre: f.nombre.trim(),
          sector: f.sector.trim() || null,
          contactos: contactos.map((ct) => ({
            id: ct.id.startsWith("ct-") ? undefined : ct.id,
            nombre: ct.nombre,
            cargo: ct.cargo,
            email: ct.email,
            telefono: ct.telefono,
          })),
        });
        const updated = res?.cliente;
        if (updated) {
          const mapped: Cliente = {
            id: updated.id,
            nombre: updated.nombre,
            sector: updated.sector ?? undefined,
            contactos: (updated.contactos ?? []).map((ct) => ({
              id: ct.id,
              nombre: ct.nombre,
              cargo: ct.cargo ?? undefined,
              email: ct.email ?? undefined,
              telefono: ct.telefono ?? undefined,
            })),
          };
          setClientes(clientes.map((c) => (c.id === mapped.id ? mapped : c)));
        }
      });

      onSaved(initial.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Nuevo cliente" : "Editar cliente"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="button" onClick={save} disabled={!!error || busy}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Cliente / Empresa</label>
          <input value={f.nombre} onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Sector (opcional)</label>
          <input value={f.sector} onChange={(e) => setF((s) => ({ ...s, sector: e.target.value }))} style={inputStyle} />
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 900 }}>Contactos</div>
        <Button type="button" onClick={addContact}>
          + Agregar contacto
        </Button>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {f.contactos.length ? (
          f.contactos.map((ct, idx) => (
            <div key={ct.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Nombre</label>
                  <input value={ct.nombre} onChange={(e) => setContact(idx, { nombre: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Cargo</label>
                  <input value={ct.cargo} onChange={(e) => setContact(idx, { cargo: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input value={ct.email} onChange={(e) => setContact(idx, { email: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono</label>
                  <input value={ct.telefono} onChange={(e) => setContact(idx, { telefono: e.target.value })} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <Button type="button" onClick={() => setConfirmDelContactIdx(idx)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            Todavía no hay contactos. Podés agregarlos ahora o más tarde.
          </div>
        )}
      </div>

      {error ? (
        <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>{error}</div>
      ) : null}

      {confirmDelContactIdx !== null ? (
        <ConfirmModal
          title="Eliminar contacto"
          message="¿Realmente querés eliminar este contacto?"
          confirmText="Sí, eliminar"
          onClose={() => setConfirmDelContactIdx(null)}
          onConfirm={() => {
            deleteContact(confirmDelContactIdx);
            setConfirmDelContactIdx(null);
          }}
        />
      ) : null}
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

