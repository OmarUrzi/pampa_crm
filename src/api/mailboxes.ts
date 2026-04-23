import { apiFetch } from "./client";

export type Mailbox = {
  id: string;
  email: string;
  lastHistoryId: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function apiListMailboxes() {
  return await apiFetch<{ mailboxes: Mailbox[] }>("/mailboxes");
}

export async function apiSyncMailbox(id: string) {
  return await apiFetch<{ ok: boolean; upserted: number; scanned?: number }>(`/mailboxes/${id}/sync`, {
    method: "POST",
    body: JSON.stringify({}),
    // Gmail sync can take longer than normal API requests.
    timeoutMs: 60_000,
  });
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

