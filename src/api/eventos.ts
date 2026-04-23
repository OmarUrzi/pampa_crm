import { apiFetch } from "./client";
import { withRetry } from "./retry";

export type ApiEventosList = {
  eventos: Array<{
    id: string;
    nombre: string;
    fechaLabel: string;
    locacion?: string;
    pax: number;
    status: string;
    currency: string;
    responsable: string;
    tipo: string;
    cotizadoTotal: number;
    costoEstimado: number;
    empresa: { id: string; nombre: string };
    contactoRef?: string | null;
  }>;
};

export async function fetchEventos() {
  return await withRetry(() => apiFetch<ApiEventosList>("/eventos"), { attempts: 2 });
}

export type ApiEventoDetail = {
  evento: {
    id: string;
    nombre: string;
    contactoRef: string | null;
    locacion: string;
    fechaLabel: string;
    pax: number;
    status: string;
    currency: string;
    responsable: string;
    tipo: string;
    cotizadoTotal: number;
    costoEstimado: number;
    empresa: { id: string; nombre: string };
    cotizaciones: Array<{
      id: string;
      label: string;
      versionNo: number;
      createdAt: string;
      items: Array<{
        id: string;
        servicio: string;
        proveedor: string;
        pax: number;
        unitCur: string;
        unit: number;
      }>;
    }>;
    pagos: Array<{
      id: string;
      concepto: string;
      tipo: string;
      monto: number;
      moneda: string;
      fechaLabel: string;
      ok: boolean;
    }>;
    proveedores: Array<{
      id: string;
      proveedorId: string | null;
      proveedorTxt: string;
      categoria: string;
      pedidoLabel: string;
      pedidoAt: string | null;
      respondioLabel: string | null;
      respondioAt: string | null;
      montoLabel: string | null;
      rating: number | null;
    }>;
    comms: Array<{
      id: string;
      de: string;
      msg: string;
      horaLabel: string;
      dir: string;
      tipo: string;
    }>;
    chat: Array<{
      id: string;
      role: string;
      msg: string;
    }>;
  };
};

export async function fetchEventoDetail(eventoId: string) {
  return await withRetry(() => apiFetch<ApiEventoDetail>(`/eventos/${eventoId}`), { attempts: 2 });
}

export async function apiCreateEvento(input: {
  empresaNombre: string;
  sector?: string;
  nombre: string;
  contactoRef?: string;
  locacion: string;
  fechaLabel: string;
  pax: number;
  status: string;
  currency: string;
  responsable: string;
  tipo: string;
}) {
  return await apiFetch<{ evento: ApiEventoDetail["evento"] }>("/eventos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchEvento(
  eventoId: string,
  patch: Partial<{
    status: string;
    responsable: string;
    cotizadoTotal: number;
    costoEstimado: number;
    nombre: string;
    contactoRef: string | null;
    locacion: string;
    fechaLabel: string;
    pax: number;
    currency: string;
    tipo: string;
  }>,
) {
  return await apiFetch<{ evento: unknown }>(`/eventos/${eventoId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

