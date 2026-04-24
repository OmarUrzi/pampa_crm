import { apiFetch } from "./client";

export type WhatsAppComm = {
  id: string;
  provider: string;
  waMessageId: string | null;
  waChatId: string | null;
  fromPhone: string | null;
  toPhone: string | null;
  bodyText: string | null;
  at: string;
};

export async function apiEventoWhatsAppComms(eventoId: string) {
  return await apiFetch<{ messages: WhatsAppComm[] }>(`/eventos/${eventoId}/whatsapp-comms`);
}

