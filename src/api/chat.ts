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

export async function apiAiChat(
  eventoId: string,
  prompt: string,
  opts?: { provider?: "gemini" | "anthropic" | "auto" },
) {
  return await apiFetch<{
    ok: boolean;
    provider: string;
    response: string;
    fallbackFromGemini?: boolean;
  }>(`/ai/chat`, {
    method: "POST",
    body: JSON.stringify({
      eventoId,
      prompt,
      provider: opts?.provider ?? "auto",
    }),
    timeoutMs: 60_000,
  });
}

