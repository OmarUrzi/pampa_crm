import { apiFetch } from "./client";

export async function apiMarkPagoOk(eventoId: string, pagoId: string, ok: boolean) {
  return await apiFetch<{ pago: unknown }>(`/eventos/${eventoId}/pagos/${pagoId}`, {
    method: "PATCH",
    body: JSON.stringify({ ok }),
  });
}

