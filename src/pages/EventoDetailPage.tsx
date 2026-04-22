import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAppStore } from "../state/useAppStore";
import type { EventoStatus, EventoTab, UserId } from "../types";
import { Button, Pill, SectionTitle } from "../ui/ui";
import { EventoTabs } from "./evento/EventoTabs";
import { EventoTabPlaceholder } from "./evento/tabs/placeholder";
import { CotizacionesTab } from "./evento/tabs/CotizacionesTab";
import { ProveedoresTab } from "./evento/tabs/ProveedoresTab";
import { PagosTab } from "./evento/tabs/PagosTab";
import { ComunicacionesTab } from "./evento/tabs/ComunicacionesTab";
import { ChatTab } from "./evento/tabs/ChatTab";
import { EventoFormModal } from "../ui/EventoFormModal";
import { refreshEventoDetailIntoStore } from "../api/hydrateEventoDetail";
import { mapDbVersions } from "../api/cotizaciones";

const ST: Record<EventoStatus, { label: string; bg: string; fg: string }> = {
  consulta: { label: "Consulta", bg: "#EDF5FF", fg: "#185FA5" },
  cotizando: { label: "Cotizando", bg: "#FFF8EC", fg: "#854F0B" },
  enviada: { label: "Cot. Enviada", bg: "#FEF3E2", fg: "#D97706" },
  negociacion: { label: "En Negociación", bg: "#F1EFE8", fg: "#5F5E5A" },
  confirmado: { label: "Confirmado", bg: "#E6F5F0", fg: "#0F6E56" },
  perdido: { label: "Perdido", bg: "#FAECE7", fg: "#993C1D" },
};

function badge(status: EventoStatus) {
  const x = ST[status];
  return <Pill style={{ background: x.bg, color: x.fg }}>{x.label}</Pill>;
}

function avatarUser(u: UserId) {
  return u === "Laura" ? (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        background: "rgba(234,101,54,0.2)",
        color: "#F07A52",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      LV
    </div>
  ) : (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        background: "rgba(29,158,117,0.2)",
        color: "#1D9E75",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      MD
    </div>
  );
}

export function EventoDetailPage() {
  const { eventoId } = useParams();
  const ev = useAppStore((s) => s.eventos.find((x) => x.id === eventoId));
  const setEventos = useAppStore((s) => s.setEventos);
  const setCotizacionesForEvento = useAppStore((s) => s.setCotizacionesForEvento);
  const setEventoStatus = useAppStore((s) => s.setEventoStatus);
  const transferEvento = useAppStore((s) => s.transferEvento);
  const markPago = useAppStore((s) => s.markPago);
  const addPedido = useAppStore((s) => s.addProveedorPedidoToEvento);
  const updatePedido = useAppStore((s) => s.updateProveedorPedido);
  const addComm = useAppStore((s) => s.addComm);

  const [tab, setTab] = useState<EventoTab>("resumen");
  const [showTransfer, setShowTransfer] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    if (!eventoId) return;
    (async () => {
      try {
        await refreshEventoDetailIntoStore(eventoId);
      } catch {
        // fallback local
      }
    })();
  }, [eventoId, setCotizacionesForEvento, setEventos]);

  const statusOptions = useMemo(
    () =>
      (Object.keys(ST) as EventoStatus[]).map((k) => ({
        k,
        label: ST[k].label,
      })),
    [],
  );

  if (!eventoId) return <Navigate to="/eventos" replace />;
  if (!ev) return <Navigate to="/eventos" replace />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Link to="/eventos" style={{ color: "var(--color-text-secondary)" }}>
          ← Volver
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
            <h1 style={{ fontSize: 18, fontFamily: "var(--font-serif)", fontWeight: 700, margin: 0 }}>
              {ev.nombre}
            </h1>
            {badge(ev.status)}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            {ev.empresa} · {ev.contacto} · {ev.locacion} · {ev.pax} pax
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {avatarUser(ev.resp)}
          <Button type="button" onClick={() => setShowTransfer((v) => !v)}>
            Transferir
          </Button>
          <Button variant="primary" type="button" onClick={() => setShowEdit(true)}>
            Editar
          </Button>
        </div>
      </div>

      {showTransfer ? (
        <div
          style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--color-background-secondary)",
          }}
        >
          <div style={{ fontSize: 12 }}>
            Transferir responsable a{" "}
            <strong>{ev.resp === "Laura" ? "Melanie" : "Laura"}</strong>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="button" onClick={() => setShowTransfer(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={() => {
                const next = ev.resp === "Laura" ? "Melanie" : "Laura";
                transferEvento(ev.id, next);
                setShowTransfer(false);
              }}
            >
              Confirmar
            </Button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Estado</span>
        {statusOptions.map((o) => (
          <Button
            key={o.k}
            type="button"
            onClick={() => setEventoStatus(ev.id, o.k)}
            style={{
              fontSize: 11,
              padding: "6px 10px",
              borderColor: ev.status === o.k ? "var(--color-border-primary)" : "var(--color-border-secondary)",
              background: ev.status === o.k ? "#FEF0EA" : "transparent",
              color: ev.status === o.k ? "var(--color-primary)" : "var(--color-text-primary)",
              fontWeight: ev.status === o.k ? 700 : 600,
            }}
          >
            {o.label}
          </Button>
        ))}
      </div>

      <EventoTabs tab={tab} onChange={setTab} />

      {tab === "resumen" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div>
            <SectionTitle>Información</SectionTitle>
            {[
              ["Tipo", ev.tipo],
              ["Locación", ev.locacion],
              ["Fecha", ev.fecha],
              ["Personas", `${ev.pax} pax`],
              ["Responsable", ev.resp],
              ["Moneda", ev.cur],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 1fr",
                  columnGap: 14,
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                }}
              >
                <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{k}</span>
                <span style={{ fontWeight: 700, fontSize: 12, justifySelf: "start" }}>{v}</span>
              </div>
            ))}
          </div>

          <div>
            <SectionTitle>Cliente</SectionTitle>
            <div
              style={{
                padding: 12,
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{ev.empresa}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
                {ev.contacto}
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <Button type="button">✉ Mail</Button>
                <Button type="button">WhatsApp</Button>
              </div>
            </div>

            <SectionTitle>Notas</SectionTitle>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                padding: 12,
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: 12,
                margin: 0,
              }}
            >
              Evento de 3 días con team building en montaña, cena de gala con catering premium y
              actividades outdoor. Asistentes son ejecutivos IT. Solicitan traslado desde Buenos
              Aires incluido.
            </p>
          </div>
        </div>
      ) : tab === "cotizaciones" ? (
        <CotizacionesTab eventoId={ev.id} />
      ) : tab === "proveedores" ? (
        <ProveedoresTab eventoId={ev.id} />
      ) : tab === "pagos" ? (
        <PagosTab eventoId={ev.id} />
      ) : tab === "comunicaciones" ? (
        <ComunicacionesTab eventoId={ev.id} />
      ) : tab === "chat" ? (
        <ChatTab eventoId={ev.id} />
      ) : (
        <EventoTabPlaceholder label={`Tab: ${tab}`} />
      )}

      {showEdit ? (
        <EventoFormModal
          mode="edit"
          initial={ev}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            // se actualiza in-place
          }}
        />
      ) : null}
    </div>
  );
}

