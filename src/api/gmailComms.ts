import { apiFetch } from "./client";

export type GmailComm = {
  id: string;
  mailbox: string;
  fromEmail: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  at: string;
};

export async function apiEventoGmailComms(eventoId: string) {
  return await apiFetch<{ messages: GmailComm[] }>(`/eventos/${eventoId}/gmail-comms`);
}

