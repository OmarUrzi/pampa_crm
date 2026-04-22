import { apiFetch } from "./client";
import type { EventoCommsTipo } from "../types";

export async function apiCreateComm(
  eventoId: string,
  input: { de: string; msg: string; horaLabel: string; dir: "in" | "out"; tipo: EventoCommsTipo },
) {
  return await apiFetch<{ comm: unknown }>(`/eventos/${eventoId}/comms`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

