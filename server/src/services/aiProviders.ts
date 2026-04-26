import { prisma } from "../prisma.js";
import { decryptSecret } from "../google/crypto.js";

/** Keys stored in DB / called upstream */
export type AiProvider = "openai" | "anthropic" | "gemini";

/** Thrown when an upstream LLM API returns non-2xx */
export class AiUpstreamError extends Error {
  name = "AiUpstreamError";
  constructor(
    public provider: AiProvider,
    public httpStatus: number,
    public bodySnippet: string,
  ) {
    super(`${provider}_error_${httpStatus}`);
  }
}

export async function getAiProviderKey(provider: AiProvider): Promise<string | null> {
  const row = await prisma.aiProviderKey.findFirst({
    where: { provider: provider as any, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { apiKeyEnc: true },
  });
  if (!row?.apiKeyEnc) return null;
  try {
    return decryptSecret(row.apiKeyEnc);
  } catch {
    return null;
  }
}

/** Google AI Studio / Gemini API (API key en query). Default model configurable via GEMINI_MODEL. */
export async function callGeminiGenerateContent(input: {
  apiKey: string;
  system: string;
  userText: string;
  model?: string;
}): Promise<string> {
  const model = input.model ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.userText }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new AiUpstreamError("gemini", res.status, text.slice(0, 800));
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiUpstreamError("gemini", 502, text.slice(0, 200));
  }
  const parts = json?.candidates?.[0]?.content?.parts;
  const out = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : "";
  const trimmed = String(out).trim();
  if (!trimmed && json?.promptFeedback?.blockReason) {
    throw new AiUpstreamError("gemini", 400, String(json.promptFeedback.blockReason));
  }
  return trimmed;
}

export async function callAnthropicClaude(input: {
  apiKey: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  system?: string;
  model?: string;
}): Promise<string> {
  const model = input.model ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      temperature: 0.2,
      system: input.system ?? undefined,
      messages: input.messages,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new AiUpstreamError("anthropic", res.status, text.slice(0, 800));
  const json = JSON.parse(text) as any;
  const parts = json?.content ?? [];
  const out = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : "";
  return String(out).trim();
}
