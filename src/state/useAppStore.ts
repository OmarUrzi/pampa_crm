import { create } from "zustand";
import type {
  ChatMsg,
  Cliente,
  Contacto,
  CotizacionVersion,
  Currency,
  Evento,
  EventoComm,
  EventoStatus,
  Pago,
  ProveedorPedido,
  Proveedor,
  ProveedorContacto,
  UserId,
} from "../types";
import { seedData } from "./seedData";
import { loadPersisted, savePersisted } from "./persist";
import { seedClientesFromEventos } from "./seedClientes";
import { seedProveedores } from "./seedProveedores";
import {
  seedChat,
  seedComms,
  seedCotizaciones,
  seedPagos,
  seedProveedoresPedidos,
} from "./seedEventoData";
import { catalogoActividades, type CatalogoActividad } from "./catalogo";
import { fetchEventos, patchEvento } from "../api/eventos";
import { useNoticeStore } from "./useNoticeStore";

type AppState = {
  activeUser: UserId;
  eventos: Evento[];
  clientes: Cliente[];
  proveedores: Proveedor[];
  catalogo: CatalogoActividad[];
  cotizacionesByEventoId: Record<string, CotizacionVersion[]>;
  proveedoresPedidosByEventoId: Record<string, ProveedorPedido[]>;
  pagosByEventoId: Record<string, Pago[]>;
  commsByEventoId: Record<string, EventoComm[]>;
  chatByEventoId: Record<string, ChatMsg[]>;
  setActiveUser: (u: UserId) => void;
  setProveedores: (items: Proveedor[]) => void;
  setClientes: (items: Cliente[]) => void;
  addCliente: (data: Omit<Cliente, "id">) => string;
  updateCliente: (id: string, patch: Partial<Pick<Cliente, "nombre" | "sector" | "contactos">>) => void;
  addContacto: (clienteId: string, data: Omit<Contacto, "id">) => string;
  deleteContacto: (clienteId: string, contactoId: string) => void;
  addEvento: (data: Omit<Evento, "id">) => string;
  updateEvento: (id: string, patch: Partial<Evento>) => void;
  setEventos: (items: Evento[]) => void;
  setEventoStatus: (id: string, status: EventoStatus) => void;
  transferEvento: (id: string, resp: UserId) => void;
  addCotizacionVersion: (eventoId: string) => void;
  setCotizacionesForEvento: (eventoId: string, versions: CotizacionVersion[]) => void;
  updateCotizacionItem: (
    eventoId: string,
    versionId: string,
    itemId: string,
    patch: Partial<{ servicio: string; proveedor: string; pax: number; unitCur: Currency; unit: number }>,
  ) => void;
  addCotizacionItem: (
    eventoId: string,
    versionId: string,
    data: { servicio: string; proveedor: string; pax: number; unitCur: Currency; unit: number },
  ) => void;
  removeCotizacionItem: (eventoId: string, versionId: string, itemId: string) => void;
  markPago: (eventoId: string, pagoId: string, ok: boolean) => void;
  reenviarPedidoProveedor: (eventoId: string, pedidoId: string) => void;
  addProveedor: (data: Omit<Proveedor, "id">) => string;
  updateProveedor: (id: string, patch: Partial<Omit<Proveedor, "id">>) => void;
  addProveedorContacto: (proveedorId: string, data: Omit<ProveedorContacto, "id">) => string;
  deleteProveedorContacto: (proveedorId: string, contactoId: string) => void;
  addProveedorPedidoToEvento: (eventoId: string, proveedorId: string) => void;
  ensureProveedorPedidoToEvento: (eventoId: string, proveedorId: string) => void;
  addCatalogoActividad: (data: Omit<CatalogoActividad, "id">) => string;
  updateCatalogoActividad: (id: string, patch: Partial<Omit<CatalogoActividad, "id">>) => void;
  deleteCatalogoActividad: (id: string) => void;
  setCatalogo: (items: CatalogoActividad[]) => void;
  updateProveedorPedido: (
    eventoId: string,
    pedidoId: string,
    patch: Partial<ProveedorPedido>,
  ) => void;
  addComm: (eventoId: string, comm: EventoComm) => void;
  chatSend: (eventoId: string, text: string) => void;
};

type Persisted = Pick<
  AppState,
  | "activeUser"
  | "eventos"
  | "clientes"
  | "proveedores"
  | "catalogo"
  | "cotizacionesByEventoId"
  | "proveedoresPedidosByEventoId"
  | "pagosByEventoId"
  | "commsByEventoId"
  | "chatByEventoId"
>;

function persistAll() {
  const s = useAppStore.getState();
  savePersisted<Persisted>({
    activeUser: s.activeUser,
    eventos: s.eventos,
    clientes: s.clientes,
    proveedores: s.proveedores,
    catalogo: s.catalogo,
    cotizacionesByEventoId: s.cotizacionesByEventoId,
    proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
    pagosByEventoId: s.pagosByEventoId,
    commsByEventoId: s.commsByEventoId,
    chatByEventoId: s.chatByEventoId,
  });
}

export const useAppStore = create<AppState>(() => ({
  activeUser: loadPersisted<Persisted>()?.activeUser ?? "Laura",
  eventos: loadPersisted<Persisted>()?.eventos ?? seedData.eventos,
  clientes:
    loadPersisted<Persisted>()?.clientes ??
    seedClientesFromEventos(loadPersisted<Persisted>()?.eventos ?? seedData.eventos),
  proveedores: loadPersisted<Persisted>()?.proveedores ?? seedProveedores,
  catalogo: loadPersisted<Persisted>()?.catalogo ?? catalogoActividades,
  cotizacionesByEventoId:
    loadPersisted<Persisted>()?.cotizacionesByEventoId ?? {
      "1": seedCotizaciones("1"),
    },
  proveedoresPedidosByEventoId:
    loadPersisted<Persisted>()?.proveedoresPedidosByEventoId ?? {
      "1": seedProveedoresPedidos("1"),
    },
  pagosByEventoId:
    loadPersisted<Persisted>()?.pagosByEventoId ?? {
      "1": seedPagos("1"),
    },
  commsByEventoId:
    loadPersisted<Persisted>()?.commsByEventoId ?? {
      "1": seedComms("1"),
    },
  chatByEventoId:
    loadPersisted<Persisted>()?.chatByEventoId ?? {
      "1": seedChat("1", seedData.eventos.find((e) => e.id === "1")?.nombre ?? "este evento"),
    },
  setProveedores: (items) => {
    useAppStore.setState({ proveedores: items });
    persistAll();
  },
  setClientes: (items) => {
    useAppStore.setState({ clientes: items });
    persistAll();
  },
  setActiveUser: (u) => {
    useAppStore.setState({ activeUser: u });
    persistAll();
  },
  setCatalogo: (items) => {
    useAppStore.setState({ catalogo: items });
    persistAll();
  },
  setEventos: (items) => {
    useAppStore.setState({ eventos: items });
    persistAll();
  },
  addCliente: (data) => {
    const id = `cli-${Date.now()}`;
    useAppStore.setState((s) => ({
      clientes: [{ ...data, id }, ...s.clientes],
    }));
    persistAll();
    return id;
  },
  updateCliente: (id, patch) => {
    useAppStore.setState((s) => ({
      clientes: s.clientes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
    persistAll();
  },
  addContacto: (clienteId, data) => {
    const id = `ct-${Date.now()}`;
    useAppStore.setState((s) => ({
      clientes: s.clientes.map((c) =>
        c.id !== clienteId ? c : { ...c, contactos: [...c.contactos, { ...data, id }] },
      ),
    }));
    persistAll();
    return id;
  },
  deleteContacto: (clienteId, contactoId) => {
    useAppStore.setState((s) => ({
      clientes: s.clientes.map((c) =>
        c.id !== clienteId
          ? c
          : { ...c, contactos: c.contactos.filter((ct) => ct.id !== contactoId) },
      ),
    }));
    persistAll();
  },
  addEvento: (data) => {
    const id = `${Date.now()}`;
    useAppStore.setState((s) => ({
      eventos: [{ ...data, id }, ...s.eventos],
      cotizacionesByEventoId: { ...s.cotizacionesByEventoId, [id]: [] },
      proveedoresPedidosByEventoId: { ...s.proveedoresPedidosByEventoId, [id]: [] },
      pagosByEventoId: { ...s.pagosByEventoId, [id]: [] },
      commsByEventoId: { ...s.commsByEventoId, [id]: [] },
      chatByEventoId: {
        ...s.chatByEventoId,
        [id]: [{ id: `c1-${id}`, r: "ai", m: `Hola, soy el asistente de Pampa. ¿En qué te puedo ayudar?` }],
      },
    }));
    persistAll();
    return id;
  },
  updateEvento: (id, patch) => {
    useAppStore.setState((s) => ({
      eventos: s.eventos.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
    persistAll();
  },
  setEventoStatus: (id, status) => {
    useAppStore.setState((s) => ({
      eventos: s.eventos.map((e) => (e.id === id ? { ...e, status } : e)),
    }));
    persistAll();

    (async () => {
      try {
        await patchEvento(id, { status });
      } catch {
        // Si falla (ej 401), re-sync desde API para no quedar inconsistente
        try {
          const res = await fetchEventos();
          useAppStore.getState().setEventos(
            res.eventos.map((e) => ({
              id: e.id,
              nombre: e.nombre,
              empresa: e.empresa?.nombre ?? "—",
              contacto: e.contactoRef ?? "—",
              locacion: e.locacion ?? "Bariloche",
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
        } catch {
          // ignore
        }
      }
    })();
  },
  transferEvento: (id, resp) => {
    useAppStore.setState((s) => ({
      eventos: s.eventos.map((e) => (e.id === id ? { ...e, resp } : e)),
    }));
    persistAll();

    (async () => {
      try {
        await patchEvento(id, { responsable: resp });
      } catch {
        // ignore; el re-sync se puede hacer desde EventosPage cuando refresque
      }
    })();
  },
  addCotizacionVersion: (eventoId) => {
    useAppStore.setState((s) => {
      const prev = s.cotizacionesByEventoId[eventoId] ?? [];
      const base = prev[prev.length - 1];
      const nextNum = prev.length + 1;
      const next: CotizacionVersion = {
        id: `v${nextNum}`,
        label: `v${nextNum}`,
        createdAtLabel: "Hoy",
        items: base ? base.items.map((it) => ({ ...it, id: `${it.id}-${nextNum}` })) : [],
      };
      return {
        cotizacionesByEventoId: {
          ...s.cotizacionesByEventoId,
          [eventoId]: [...prev, next],
        },
      };
    });
    persistAll();
  },
  setCotizacionesForEvento: (eventoId, versions) => {
    useAppStore.setState((s) => ({
      cotizacionesByEventoId: { ...s.cotizacionesByEventoId, [eventoId]: versions },
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  updateCotizacionItem: (eventoId, versionId, itemId, patch) => {
    useAppStore.setState((s) => ({
      cotizacionesByEventoId: {
        ...s.cotizacionesByEventoId,
        [eventoId]: (s.cotizacionesByEventoId[eventoId] ?? []).map((v) =>
          v.id !== versionId
            ? v
            : {
                ...v,
                items: v.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
              },
        ),
      },
    }));
    persistAll();
  },
  addCotizacionItem: (eventoId, versionId, data) => {
    const id = `ci-${Date.now()}`;
    useAppStore.setState((s) => ({
      cotizacionesByEventoId: {
        ...s.cotizacionesByEventoId,
        [eventoId]: (s.cotizacionesByEventoId[eventoId] ?? []).map((v) =>
          v.id !== versionId ? v : { ...v, items: [...v.items, { ...data, id }] },
        ),
      },
    }));
    persistAll();
    return id;
  },
  removeCotizacionItem: (eventoId, versionId, itemId) => {
    useAppStore.setState((s) => ({
      cotizacionesByEventoId: {
        ...s.cotizacionesByEventoId,
        [eventoId]: (s.cotizacionesByEventoId[eventoId] ?? []).map((v) =>
          v.id !== versionId ? v : { ...v, items: v.items.filter((it) => it.id !== itemId) },
        ),
      },
    }));
    persistAll();
  },
  addCatalogoActividad: (data) => {
    const id = `act-${Date.now()}`;
    useAppStore.setState((s) => ({ catalogo: [{ ...data, id }, ...s.catalogo] }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
    return id;
  },
  updateCatalogoActividad: (id, patch) => {
    useAppStore.setState((s) => ({
      catalogo: s.catalogo.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  deleteCatalogoActividad: (id) => {
    useAppStore.setState((s) => ({ catalogo: s.catalogo.filter((a) => a.id !== id) }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  markPago: (eventoId, pagoId, ok) => {
    useAppStore.setState((s) => ({
      pagosByEventoId: {
        ...s.pagosByEventoId,
        [eventoId]: (s.pagosByEventoId[eventoId] ?? []).map((p) =>
          p.id === pagoId ? { ...p, ok } : p,
        ),
      },
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  reenviarPedidoProveedor: (eventoId, pedidoId) => {
    const user = useAppStore.getState().activeUser;
    const comm: EventoComm = {
      id: `sys-${Date.now()}`,
      de: `${user} V.`,
      msg: "Te reenvío el pedido de cotización para este evento. ¿Podés confirmarnos valores y disponibilidad?",
      horaLabel: "Recién",
      dir: "out",
      tipo: "Mail",
    };

    useAppStore.setState((s) => ({
      proveedoresPedidosByEventoId: {
        ...s.proveedoresPedidosByEventoId,
        [eventoId]: (s.proveedoresPedidosByEventoId[eventoId] ?? []).map((p) =>
          p.id === pedidoId ? { ...p, pedidoLabel: "Hoy" } : p,
        ),
      },
      commsByEventoId: {
        ...s.commsByEventoId,
        [eventoId]: [comm, ...(s.commsByEventoId[eventoId] ?? [])],
      },
    }));

    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  addProveedor: (data) => {
    const id = `prov-${Date.now()}`;
    useAppStore.setState((s) => ({ proveedores: [{ ...data, id }, ...s.proveedores] }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
    return id;
  },
  updateProveedor: (id, patch) => {
    useAppStore.setState((s) => ({
      proveedores: s.proveedores.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  addProveedorContacto: (proveedorId, data) => {
    const id = `pc-${Date.now()}`;
    useAppStore.setState((s) => ({
      proveedores: s.proveedores.map((p) =>
        p.id !== proveedorId ? p : { ...p, contactos: [...p.contactos, { ...data, id }] },
      ),
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
    return id;
  },
  deleteProveedorContacto: (proveedorId, contactoId) => {
    useAppStore.setState((s) => ({
      proveedores: s.proveedores.map((p) =>
        p.id !== proveedorId
          ? p
          : { ...p, contactos: p.contactos.filter((c) => c.id !== contactoId) },
      ),
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      catalogo: s.catalogo,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  addProveedorPedidoToEvento: (eventoId, proveedorId) => {
    const prov = useAppStore.getState().proveedores.find((p) => p.id === proveedorId);
    if (!prov) return;
    const exists = (useAppStore.getState().proveedoresPedidosByEventoId[eventoId] ?? []).some(
      (x) => x.proveedor === prov.nombre,
    );
    if (exists) return;

    useAppStore.setState((s) => ({
      proveedoresPedidosByEventoId: {
        ...s.proveedoresPedidosByEventoId,
        [eventoId]: [
          {
            id: `pp-${Date.now()}`,
            proveedorId: prov.id,
            proveedor: prov.nombre,
            categoria: prov.categoria,
            pedidoLabel: "Hoy",
            pedidoAt: Date.now(),
            respondioLabel: null,
            respondioAt: undefined,
            montoLabel: null,
            rating: undefined,
          },
          ...(s.proveedoresPedidosByEventoId[eventoId] ?? []),
        ],
      },
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  ensureProveedorPedidoToEvento: (eventoId, proveedorId) => {
    const prov = useAppStore.getState().proveedores.find((p) => p.id === proveedorId);
    if (!prov) return;
    const exists = (useAppStore.getState().proveedoresPedidosByEventoId[eventoId] ?? []).some(
      (x) => x.proveedorId === prov.id || x.proveedor === prov.nombre,
    );
    if (exists) return;
    useAppStore.getState().addProveedorPedidoToEvento(eventoId, proveedorId);
  },
  updateProveedorPedido: (eventoId, pedidoId, patch) => {
    useAppStore.setState((s) => ({
      proveedoresPedidosByEventoId: {
        ...s.proveedoresPedidosByEventoId,
        [eventoId]: (s.proveedoresPedidosByEventoId[eventoId] ?? []).map((p) =>
          p.id === pedidoId ? { ...p, ...patch } : p,
        ),
      },
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  addComm: (eventoId, comm) => {
    useAppStore.setState((s) => ({
      commsByEventoId: {
        ...s.commsByEventoId,
        [eventoId]: [comm, ...(s.commsByEventoId[eventoId] ?? [])],
      },
    }));
    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
  chatSend: (eventoId, text) => {
    const q = text.trim();
    if (!q) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, r: "user", m: q };
    const pending: ChatMsg = { id: `a-${Date.now() + 1}`, r: "ai", m: "..." };

    useAppStore.setState((s) => ({
      chatByEventoId: {
        ...s.chatByEventoId,
        [eventoId]: [...(s.chatByEventoId[eventoId] ?? []), userMsg, pending],
      },
    }));

    // Simular respuesta
    setTimeout(() => {
      const state = useAppStore.getState();
      const ev = state.eventos.find((e) => e.id === eventoId);
      const answer = simpleAiReply(q, ev?.nombre ?? "este evento");
      useAppStore.setState((s2) => ({
        chatByEventoId: {
          ...s2.chatByEventoId,
          [eventoId]: (s2.chatByEventoId[eventoId] ?? []).map((m) =>
            m.id === pending.id ? { ...m, m: answer } : m,
          ),
        },
      }));
      const s3 = useAppStore.getState();
      savePersisted<Persisted>({
        activeUser: s3.activeUser,
        eventos: s3.eventos,
        clientes: s3.clientes,
        proveedores: s3.proveedores,
        cotizacionesByEventoId: s3.cotizacionesByEventoId,
        proveedoresPedidosByEventoId: s3.proveedoresPedidosByEventoId,
        pagosByEventoId: s3.pagosByEventoId,
        commsByEventoId: s3.commsByEventoId,
        chatByEventoId: s3.chatByEventoId,
      });
    }, 600);

    const s = useAppStore.getState();
    savePersisted<Persisted>({
      activeUser: s.activeUser,
      eventos: s.eventos,
      clientes: s.clientes,
      proveedores: s.proveedores,
      cotizacionesByEventoId: s.cotizacionesByEventoId,
      proveedoresPedidosByEventoId: s.proveedoresPedidosByEventoId,
      pagosByEventoId: s.pagosByEventoId,
      commsByEventoId: s.commsByEventoId,
      chatByEventoId: s.chatByEventoId,
    });
  },
}));

function simpleAiReply(q: string, eventoNombre: string) {
  const ql = q.toLowerCase();
  if (/proveedor|respond|cotiz/.test(ql)) {
    return `Para "${eventoNombre}", Hotel Llao Llao no respondió todavía la solicitud de cotización. El resto ya respondieron. ¿Querés que redacte un mail de seguimiento?`;
  }
  if (/margen|ganancia|profit/.test(ql)) {
    return `En "${eventoNombre}" la v3 tiene U$D 53.000 cotizados vs U$D 31.000 de costo estimado. Margen bruto: U$D 22.000 (≈41%).`;
  }
  if (/pago|cobr|saldo|seña/.test(ql)) {
    return `Seña del 30% cobrada. Queda pendiente el saldo antes del evento y pagos a proveedores (prioridad: alojamiento).`;
  }
  if (/estado|resumen|como va/.test(ql)) {
    return `"${eventoNombre}" está en curso de coordinación. Próximos pasos típicos: confirmar proveedores pendientes y cerrar programa definitivo.`;
  }
  return `Puedo ayudarte con proveedores pendientes, pagos, margen, o a armar slides para "${eventoNombre}". ¿Qué necesitás?`;
}

