import { apiFetch } from "./client";

export async function apiCreateProveedorPedido(
  eventoId: string,
  input: { proveedorId?: string; proveedorTxt: string; categoria: string; pedidoLabel?: string },
) {
  return await apiFetch<{ pedido: unknown }>(`/eventos/${eventoId}/proveedores/pedidos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiPatchProveedorPedido(
  eventoId: string,
  pedidoId: string,
  patch: Partial<{
    respondioLabel: string | null;
    respondioAt: string | null;
    montoLabel: string | null;
    rating: number | null;
    pedidoLabel: string | null;
    pedidoAt: string | null;
  }>,
) {
  return await apiFetch<{ pedido: unknown }>(`/eventos/${eventoId}/proveedores/pedidos/${pedidoId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

