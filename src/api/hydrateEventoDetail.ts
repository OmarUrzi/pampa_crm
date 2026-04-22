import { fetchEventoDetail } from "./eventos";
import { mapDbVersions } from "./cotizaciones";
import { useAppStore } from "../state/useAppStore";
import type { EventoStatus } from "../types";

export async function refreshEventoDetailIntoStore(eventoId: string) {
  const res = await fetchEventoDetail(eventoId);
  const e = res.evento;

  const mapped = {
    id: e.id,
    nombre: e.nombre,
    empresa: e.empresa?.nombre ?? "—",
    contacto: e.contactoRef ?? "—",
    locacion: e.locacion ?? "—",
    fecha: e.fechaLabel,
    pax: e.pax ?? 0,
    status: e.status as EventoStatus,
    cur: e.currency === "ARS" ? "ARS" : "USD",
    cotizado: e.cotizadoTotal ?? 0,
    costo: e.costoEstimado ?? 0,
    resp: (e.responsable as "Laura" | "Melanie") ?? "Laura",
    tipo: e.tipo ?? "—",
  };

  const curList = useAppStore.getState().eventos;
  const next = curList.some((x) => x.id === mapped.id)
    ? curList.map((x) => (x.id === mapped.id ? mapped : x))
    : [mapped, ...curList];
  useAppStore.getState().setEventos(next);

  useAppStore.getState().setCotizacionesForEvento(eventoId, mapDbVersions(e.cotizaciones ?? []));

  useAppStore.setState((s) => ({
    pagosByEventoId: {
      ...s.pagosByEventoId,
      [eventoId]: (e.pagos ?? []).map((p) => ({
        id: p.id,
        concepto: p.concepto,
        tipo: p.tipo as any,
        monto: p.monto,
        moneda: (p.moneda === "ARS" ? "ARS" : "USD") as any,
        fechaLabel: p.fechaLabel,
        ok: p.ok,
      })),
    },
    proveedoresPedidosByEventoId: {
      ...s.proveedoresPedidosByEventoId,
      [eventoId]: (e.proveedores ?? []).map((pp) => ({
        id: pp.id,
        proveedorId: pp.proveedorId ?? undefined,
        proveedor: pp.proveedorTxt,
        categoria: pp.categoria,
        pedidoLabel: pp.pedidoLabel,
        pedidoAt: pp.pedidoAt ? new Date(pp.pedidoAt).getTime() : undefined,
        respondioLabel: pp.respondioLabel,
        respondioAt: pp.respondioAt ? new Date(pp.respondioAt).getTime() : undefined,
        montoLabel: pp.montoLabel,
        rating: pp.rating ?? undefined,
      })),
    },
    commsByEventoId: {
      ...s.commsByEventoId,
      [eventoId]: (e.comms ?? []).map((c) => ({
        id: c.id,
        de: c.de,
        msg: c.msg,
        horaLabel: c.horaLabel,
        dir: c.dir as any,
        tipo: c.tipo as any,
      })),
    },
    chatByEventoId: {
      ...s.chatByEventoId,
      [eventoId]: (e.chat ?? []).map((m) => ({
        id: m.id,
        r: m.role === "user" ? "user" : "ai",
        m: m.msg,
      })),
    },
  }));
}

