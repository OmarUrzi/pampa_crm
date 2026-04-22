import { apiFetch } from "./client";

export type Mailbox = { id: string; email: string; createdAt: string; updatedAt: string };

export async function apiListMailboxes() {
  return await apiFetch<{ mailboxes: Mailbox[] }>("/mailboxes");
}

export async function apiSyncMailbox(id: string) {
  return await apiFetch<{ ok: boolean; upserted: number }>(`/mailboxes/${id}/sync`, { method: "POST" });
}

export async function apiMailboxCommsByEmail(email: string) {
  const q = encodeURIComponent(email);
  return await apiFetch<{
    messages: Array<{
      id: string;
      mailbox: string;
      fromEmail: string | null;
      toEmails: string[];
      subject: string | null;
      snippet: string | null;
      at: string;
    }>;
  }>(`/mailboxes/comms?email=${q}`);
}

