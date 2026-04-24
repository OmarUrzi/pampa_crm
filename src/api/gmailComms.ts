import { apiFetch } from "./client";

export type GmailComm = {
  id: string;
  threadId?: string | null;
  mailbox: string;
  fromEmail: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  bodyText?: string | null;
  at: string;
};

export async function apiEventoGmailComms(eventoId: string) {
  return await apiFetch<{ messages: GmailComm[] }>(`/eventos/${eventoId}/gmail-comms`);
}

export async function apiEventoGmailThread(eventoId: string, threadId: string) {
  const q = encodeURIComponent(threadId);
  return await apiFetch<{ messages: GmailComm[] }>(`/eventos/${eventoId}/gmail-thread?threadId=${q}`);
}

