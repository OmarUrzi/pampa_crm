import { useMemo, useState } from "react";
import type { Proveedor, ProveedorContacto } from "../types";
import { useAppStore } from "../state/useAppStore";
import { Button } from "./ui";
import { Modal } from "./Modal";
import { apiCreateProveedor, apiPatchProveedor } from "../api/proveedores";
import { useCanEdit } from "../auth/perms";
import { useAuthGate } from "../auth/useAuthGate";
import { ConfirmModal } from "./ConfirmModal";

type FormState = {
  nombre: string;
  categoria: string;
  contactos: Array<{ id: string; nombre: string; email: string; telefono: string }>;
};

function toForm(p: Proveedor): FormState {
  return {
    nombre: p.nombre,
    categoria: p.categoria,
    contactos: p.contactos.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      email: c.email ?? "",
      telefono: c.telefono ?? "",
    })),
  };
}

export function ProveedorFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: Proveedor;
  onClose: () => void;
  onSaved: (proveedorId: string) => void;
}) {
  const setProveedores = useAppStore((s) => s.setProveedores);
  const proveedores = useAppStore((s) => s.proveedores);
  const canEdit = useCanEdit();
  const gate = useAuthGate();

  const [f, setF] = useState<FormState>(() => {
    if (mode === "edit" && initial) return toForm(initial);
    return { nombre: "", categoria: "", contactos: [] };
  });
  const [saving, setSaving] = useState(false);
  const [confirmRemoveContact, setConfirmRemoveContact] = useState<number | null>(null);

  const error = useMemo(() => {
    if (!f.nombre.trim()) return "Falta el nombre del proveedor.";
    if (!f.categoria.trim()) return "Falta la categoría.";
    return null;
  }, [f]);

  function setContact(idx: number, patch: Partial<FormState["contactos"][number]>) {
    setF((s) => ({
      ...s,
      contactos: s.contactos.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  function addContact() {
    if (!canEdit) {
      gate.ensureAuthed();
      return;
    }
    setF((s) => ({
      ...s,
      contactos: [
        ...s.contactos,
        { id: `tmp-${Date.now()}`, nombre: "", email: "", telefono: "" },
      ],
    }));
  }

  function deleteContact(idx: number) {
    if (!canEdit) {
      gate.ensureAuthed();
      return;
    }
    setConfirmRemoveContact(idx);
  }

  async function save() {
    if (!canEdit) return void gate.ensureAuthed();
    if (error) return;
    if (saving) return;
    const contactos: ProveedorContacto[] = f.contactos
      .map((c) => ({
        id: c.id,
        nombre: c.nombre.trim() || "—",
        email: c.email.trim() || undefined,
        telefono: c.telefono.trim() || undefined,
      }))
      .filter((x) => x.nombre && x.nombre !== "—");

    const payload = {
      nombre: f.nombre.trim(),
      categoria: f.categoria.trim(),
      contactos,
    };

    setSaving(true);

    // Optimistic UX: update UI immediately, then reconcile with API.
    const tmpId = mode === "create" ? `tmp-prov-${Date.now()}` : (initial?.id ?? "");
    const optimistic: Proveedor = {
      id: tmpId,
      nombre: payload.nombre,
      categoria: payload.categoria,
      contactos: payload.contactos.map((c) => ({
        id: c.id.startsWith("tmp-") ? `tmp-pc-${Date.now()}-${Math.random().toString(16).slice(2)}` : c.id,
        nombre: c.nombre,
        email: c.email,
        telefono: c.telefono,
      })),
    };

    if (mode === "create") {
      setProveedores([optimistic, ...proveedores]);
      onSaved(tmpId);
      onClose();
    } else if (initial) {
      setProveedores(proveedores.map((x) => (x.id === optimistic.id ? optimistic : x)));
      onSaved(optimistic.id);
      onClose();
    }

    try {
      const res = await gate.run(async () => {
        if (mode === "create") {
          const created = await apiCreateProveedor({
            nombre: payload.nombre,
            categoria: payload.categoria,
            contactos: payload.contactos.map((c) => ({
              nombre: c.nombre,
              email: c.email,
              telefono: c.telefono,
            })),
          });
          return { kind: "create" as const, proveedor: created };
        }
        if (!initial) return null;
        const updated = await apiPatchProveedor(initial.id, {
          nombre: payload.nombre,
          categoria: payload.categoria || null,
          contactos: payload.contactos.map((c) => ({
            nombre: c.nombre,
            email: c.email,
            telefono: c.telefono,
          })),
        });
        return { kind: "edit" as const, proveedor: updated };
      });

      if (!res) {
        // request failed; revert optimistic create (edit keeps optimistic values)
        if (mode === "create") setProveedores(useAppStore.getState().proveedores.filter((x) => x.id !== tmpId));
        return;
      }

      const p = res.proveedor;
      if (res.kind === "create") {
        setProveedores(useAppStore.getState().proveedores.map((x) => (x.id === tmpId ? p : x)));
      } else {
        setProveedores(useAppStore.getState().proveedores.map((x) => (x.id === p.id ? p : x)));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Nuevo proveedor" : "Editar proveedor"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="button" onClick={save} disabled={!!error || saving || !canEdit}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      {confirmRemoveContact !== null ? (
        <ConfirmModal
          title="Eliminar contacto"
          message="¿Realmente querés eliminar este contacto?"
          confirmLabel="Sí, eliminar"
          onCancel={() => setConfirmRemoveContact(null)}
          onConfirm={() => {
            const idx = confirmRemoveContact;
            setConfirmRemoveContact(null);
            setF((s) => ({ ...s, contactos: s.contactos.filter((_, i) => i !== idx) }));
          }}
        />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Proveedor</label>
          <input
            value={f.nombre}
            onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))}
            style={inputStyle}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label style={labelStyle}>Categoría</label>
          <input
            value={f.categoria}
            onChange={(e) => setF((s) => ({ ...s, categoria: e.target.value }))}
            style={inputStyle}
            placeholder="Catering / Transporte / Outdoor…"
            disabled={!canEdit}
          />
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 900 }}>Contactos</div>
        <Button type="button" onClick={addContact} disabled={!canEdit}>
          + Agregar contacto
        </Button>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {f.contactos.length ? (
          f.contactos.map((ct, idx) => (
            <div key={ct.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Nombre</label>
                  <input
                    value={ct.nombre}
                    onChange={(e) => setContact(idx, { nombre: e.target.value })}
                    style={inputStyle}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    value={ct.email}
                    onChange={(e) => setContact(idx, { email: e.target.value })}
                    style={inputStyle}
                    disabled={!canEdit}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <label style={labelStyle}>Teléfono</label>
                  <input
                    value={ct.telefono}
                    onChange={(e) => setContact(idx, { telefono: e.target.value })}
                    style={inputStyle}
                    disabled={!canEdit}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                  <Button type="button" onClick={() => deleteContact(idx)} disabled={!canEdit}>
                    Eliminar
                  </Button>
                </div>
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

