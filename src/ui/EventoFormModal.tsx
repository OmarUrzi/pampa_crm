import { useMemo, useState } from "react";
import type { Currency, Evento, EventoStatus, UserId } from "../types";
import { useAppStore } from "../state/useAppStore";
import { Button } from "./ui";
import { Modal } from "./Modal";
import { ClienteFormModal } from "./ClienteFormModal";
import { SearchDropdown } from "./SearchDropdown";
import { apiCreateEvento, fetchEventos, patchEvento } from "../api/eventos";
import { useAuthGate } from "../auth/useAuthGate";
import { useCanEdit } from "../auth/perms";
import { useNoticeStore } from "../state/useNoticeStore";

type FormState = {
  nombre: string;
  clienteId: string;
  contactoId: string;
  locacion: string;
  fecha: string;
  pax: string;
  tipo: string;
  resp: UserId;
  cur: Currency;
  status: EventoStatus;
};

function toForm(ev: Evento): FormState {
  return {
    nombre: ev.nombre,
    clienteId: ev.clienteId ?? "",
    contactoId: ev.contactoId ?? "",
    locacion: ev.locacion,
    fecha: ev.fecha,
    pax: String(ev.pax),
    tipo: ev.tipo,
    resp: ev.resp,
    cur: ev.cur,
    status: ev.status,
  };
}

export function EventoFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: Evento;
  onClose: () => void;
  onSaved: (eventoId: string) => void;
}) {
  const activeUser = useAppStore((s) => s.activeUser);
  const eventos = useAppStore((s) => s.eventos);
  const clientes = useAppStore((s) => s.clientes);
  const addEvento = useAppStore((s) => s.addEvento);
  const updateEvento = useAppStore((s) => s.updateEvento);
  const setEventos = useAppStore((s) => s.setEventos);
  const gate = useAuthGate();
  const canEdit = useCanEdit();
  const notice = useNoticeStore((s) => s);

  const [f, setF] = useState<FormState>(() => {
    if (mode === "edit" && initial) return toForm(initial);
    return {
      nombre: "",
      clienteId: "",
      contactoId: "",
      locacion: "Bariloche",
      fecha: "",
      pax: "50",
      tipo: "Corporativo",
      resp: activeUser,
      cur: "USD",
      status: "consulta",
    };
  });
  const [showNewCliente, setShowNewCliente] = useState(false);
  const [busy, setBusy] = useState(false);

  const error = useMemo(() => {
    if (!f.nombre.trim()) return "Falta el nombre del evento.";
    return null;
  }, [f]);

  const clienteSel = useMemo(
    () => clientes.find((c) => c.id === f.clienteId),
    [clientes, f.clienteId],
  );
  const contactosSel = useMemo(() => clienteSel?.contactos ?? [], [clienteSel]);
  const contactosItems = useMemo(
    () =>
      contactosSel.map((ct) => ({
        id: ct.id,
        label: ct.nombre,
        sublabel: [ct.cargo, ct.email, ct.telefono].filter(Boolean).join(" · "),
      })),
    [contactosSel],
  );

  function field<T extends keyof FormState>(k: T, v: FormState[T]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function save() {
    if (error) return;
    if (!canEdit) {
      notice.show("No tenés permisos para editar.", { variant: "warning", ttlMs: 2500 });
      return;
    }
    if (!gate.ensureAuthed()) return;

    const paxRaw = f.pax.trim();
    const pax = paxRaw ? Number(paxRaw) : 0;
    const paxSafe = Number.isFinite(pax) && pax >= 0 ? pax : 0;

    if (mode === "create") {
      const cliente = clientes.find((c) => c.id === f.clienteId);
      const contacto = cliente?.contactos.find((c) => c.id === f.contactoId);
      const contactoRef = (contacto?.email ?? contacto?.nombre ?? "").trim() || undefined;

      // Optimistic local create for snappy UX; replaced after API refresh.
      const tmpId = addEvento({
        nombre: f.nombre.trim(),
        empresa: cliente?.nombre ?? "—",
        contacto: contacto?.nombre ?? "—",
        clienteId: cliente?.id,
        contactoId: contacto?.id,
        locacion: f.locacion.trim() || "Bariloche",
        fecha: f.fecha.trim() || "—",
        pax: paxSafe,
        status: f.status,
        cur: f.cur,
        cotizado: 0,
        costo: 0,
        resp: f.resp,
        tipo: f.tipo.trim() || "—",
      });

      setBusy(true);
      try {
        await gate.run(async () => {
          await apiCreateEvento({
            empresaNombre: cliente?.nombre ?? "—",
            sector: cliente?.sector ?? undefined,
            nombre: f.nombre.trim(),
            contactoRef,
            locacion: f.locacion.trim() || "Bariloche",
            fechaLabel: f.fecha.trim() || "—",
            pax: paxSafe,
            status: f.status,
            currency: f.cur,
            responsable: f.resp,
            tipo: f.tipo.trim() || "—",
          });

          const res = await fetchEventos();
          setEventos(
            res.eventos.map((e) => ({
              id: e.id,
              nombre: e.nombre,
              empresa: e.empresa?.nombre ?? "—",
              contacto: e.contactoRef ?? "—",
              locacion: e.locacion ?? "—",
              fecha: e.fechaLabel,
              pax: e.pax ?? 0,
              status: e.status as any,
              cur: e.currency === "ARS" ? "ARS" : "USD",
              cotizado: e.cotizadoTotal ?? 0,
              costo: e.costoEstimado ?? 0,
              resp: (e.responsable as any) ?? "Laura",
              tipo: e.tipo ?? "—",
            })),
          );
        });

        notice.show("Evento creado.", { variant: "info", ttlMs: 1600 });
        onSaved(tmpId);
        onClose();
      } catch (e: any) {
        // If API create fails, keep optimistic event but let user know.
        notice.show(e?.message ? String(e.message) : "No se pudo crear el evento.", {
          variant: "error",
          ttlMs: 3500,
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!initial) return;
    const cliente = clientes.find((c) => c.id === f.clienteId);
    const contacto = cliente?.contactos.find((c) => c.id === f.contactoId);
      const contactoRef = (contacto?.email ?? contacto?.nombre ?? "").trim() || null;
    updateEvento(initial.id, {
      nombre: f.nombre.trim(),
      empresa: cliente?.nombre ?? "—",
      contacto: contacto?.nombre ?? "—",
      clienteId: cliente?.id,
      contactoId: contacto?.id,
      locacion: f.locacion.trim() || "Bariloche",
      fecha: f.fecha.trim() || "—",
      pax: paxSafe,
      status: f.status,
      cur: f.cur,
      resp: f.resp,
      tipo: f.tipo.trim() || "—",
    });

    setBusy(true);
    try {
      await gate.run(async () => {
        await patchEvento(initial.id, {
          nombre: f.nombre.trim(),
          contactoRef,
          locacion: f.locacion.trim() || "Bariloche",
          fechaLabel: f.fecha.trim() || "—",
          pax: paxSafe,
          status: f.status,
          currency: f.cur,
          responsable: f.resp,
          tipo: f.tipo.trim() || "—",
        });
      });
      notice.show("Evento actualizado.", { variant: "info", ttlMs: 1400 });
    } catch (e: any) {
      notice.show(e?.message ? String(e.message) : "No se pudo actualizar el evento.", {
        variant: "error",
        ttlMs: 3500,
      });
    } finally {
      setBusy(false);
    }

    onSaved(initial.id);
    onClose();
  }

  return (
    <Modal
      title={mode === "create" ? "Nuevo evento" : "Editar evento"}
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
          <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
            Evento
          </label>
          <input
            value={f.nombre}
            onChange={(e) => field("nombre", e.target.value)}
            placeholder="Retiro Corporativo Verano"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
            Tipo
          </label>
          <input
            value={f.tipo}
            onChange={(e) => field("tipo", e.target.value)}
            placeholder="Corporativo / Casamiento / Congreso…"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
            Cliente / Empresa
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <select
              value={f.clienteId}
              onChange={(e) =>
                setF((s) => ({ ...s, clienteId: e.target.value, contactoId: "" }))
              }
              style={{ ...selectStyle, marginTop: 0, flex: 1 }}
            >
              <option value="">— Seleccionar —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <Button type="button" onClick={() => setShowNewCliente(true)}>
              + Nuevo
            </Button>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
            Contacto
          </label>
          <SearchDropdown
            valueId={f.contactoId}
            disabled={!f.clienteId}
            placeholder={f.clienteId ? "— Seleccionar —" : "Seleccioná un cliente primero"}
            items={contactosItems}
            onChange={(id) => field("contactoId", id)}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
            Locación
          </label>
          <input
            value={f.locacion}
            onChange={(e) => field("locacion", e.target.value)}
            placeholder="Bariloche / El Correntoso"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
            Fecha (texto)
          </label>
          <input
            value={f.fecha}
            onChange={(e) => field("fecha", e.target.value)}
            placeholder="15 Feb 2025"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
            Pax
          </label>
          <input
            value={f.pax}
            onChange={(e) => field("pax", e.target.value)}
            inputMode="numeric"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
              Moneda
            </label>
            <select
              value={f.cur}
              onChange={(e) => field("cur", e.target.value as Currency)}
              style={selectStyle}
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
              Responsable
            </label>
            <select
              value={f.resp}
              onChange={(e) => field("resp", e.target.value as UserId)}
              style={selectStyle}
            >
              <option value="Laura">Laura</option>
              <option value="Melanie">Melanie</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 900, color: "var(--color-text-secondary)" }}>
            Estado
          </label>
          <select
            value={f.status}
            onChange={(e) => field("status", e.target.value as EventoStatus)}
            style={selectStyle}
          >
            <option value="consulta">Consulta</option>
            <option value="cotizando">Cotizando</option>
            <option value="enviada">Cot. Enviada</option>
            <option value="negociacion">En Negociación</option>
            <option value="confirmado">Confirmado</option>
            <option value="perdido">Perdido</option>
          </select>
        </div>
      </div>

      {error ? (
        <div style={{ marginTop: 12, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
          {error}
        </div>
      ) : null}

      {showNewCliente ? (
        <ClienteFormModal
          mode="create"
          onClose={() => setShowNewCliente(false)}
          onSaved={(id) => {
            setF((s) => ({ ...s, clienteId: id, contactoId: "" }));
          }}
        />
      ) : null}
    </Modal>
  );
}

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

const selectStyle: React.CSSProperties = {
  width: "100%",
  border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 10,
  padding: "8px 11px",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  fontSize: 12,
  marginTop: 6,
};

