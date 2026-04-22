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

