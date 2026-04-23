import { apiFetch } from "./client";

export async function apiCreateChatMessage(
  eventoId: string,
  input: { role: "ai" | "user"; msg: string },
) {
  return await apiFetch<{ chat: unknown }>(`/eventos/${eventoId}/chat`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiAiChat(eventoId: string, prompt: string) {
  return await apiFetch<{ ok: boolean; provider: string; response: string }>(`/ai/chat`, {
    method: "POST",
    body: JSON.stringify({ eventoId, prompt }),
    timeoutMs: 60_000,
  });
}

