import { apiListCatalogo } from "../api/catalogo";
import { apiListProveedores } from "../api/proveedores";
import { apiListClientes } from "../api/clientes";
import { fetchEventos } from "../api/eventos";
import type { EventoStatus } from "../types";
import { useAppStore } from "./useAppStore";
import { useNoticeStore } from "./useNoticeStore";
import { useBootstrapStore } from "./useBootstrapStore";

type Key = string;
const inflight = new Map<Key, Promise<void>>();

export async function bootstrapData(key: Key) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    useBootstrapStore.getState().setBootstrapping(true);
    useNoticeStore.getState().show("Cargando datos…", { variant: "info", ttlMs: 1200 });
    const [proveedores, clientesRes, catalogoRes, eventosRes] = await Promise.all([
      apiListProveedores().catch(() => null),
      apiListClientes().catch(() => null),
      apiListCatalogo().catch(() => null),
      fetchEventos().catch(() => null),
    ]);

    if (proveedores) useAppStore.getState().setProveedores(proveedores);
    if (clientesRes) {
      useAppStore.getState().setClientes(
        clientesRes.clientes.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          sector: c.sector ?? undefined,
          contactos: (c.contactos ?? []).map((ct) => ({
            id: ct.id,
            nombre: ct.nombre,
            cargo: ct.cargo ?? undefined,
            email: ct.email ?? undefined,
            telefono: ct.telefono ?? undefined,
          })),
        })),
      );
    }
    if (catalogoRes) {
      useAppStore.getState().setCatalogo(
        catalogoRes.actividades.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          descripcion: a.descripcion ?? "",
          categoria: a.categoria,
          precioUsd: a.precioUsd ?? 0,
          proveedorSugerido: a.proveedorTxt ?? "—",
          fotos: a.fotos.map((f) => f.url),
        })),
      );
    }
    if (eventosRes) {
      useAppStore.getState().setEventos(
        eventosRes.eventos.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          empresa: e.empresa?.nombre ?? "—",
          contacto: e.contactoRef ?? "—",
          locacion: e.locacion ?? "Bariloche",
          fecha: e.fechaLabel,
          pax: e.pax ?? 0,
          status: e.status as EventoStatus,
          cur: e.currency === "ARS" ? "ARS" : "USD",
          cotizado: e.cotizadoTotal ?? 0,
          costo: e.costoEstimado ?? 0,
          resp: (e.responsable as "Laura" | "Melanie") ?? "Laura",
          tipo: e.tipo ?? "—",
        })),
      );
    }
    useBootstrapStore.getState().setBootstrapping(false);
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

