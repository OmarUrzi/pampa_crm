import { prisma } from "../prisma.js";
import { decryptSecret } from "../google/crypto.js";

export type AiProvider = "openai" | "anthropic";

/** Thrown when OpenAI/Anthropic return a non-2xx response (quota, invalid key, etc.). */
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

export async function callOpenAiChat(input: {
  apiKey: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
}): Promise<string> {
  const model = input.model ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: input.messages,
      temperature: 0.2,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new AiUpstreamError("openai", res.status, text.slice(0, 800));
  const json = JSON.parse(text) as any;
  return String(json?.choices?.[0]?.message?.content ?? "").trim();
}

export async function callAnthropicClaude(input: {
  apiKey: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  system?: string;
  model?: string;
}): Promise<string> {
  const model = input.model ?? "claude-3-5-sonnet-latest";
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

