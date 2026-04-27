import { AiUpstreamError, getAiProviderKey } from "./aiProviders.js";

export type AnthropicFileMetadata = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at?: string;
};

export async function uploadFileToAnthropic(input: {
  filename: string;
  mime: string;
  bytes: Uint8Array;
  apiKey?: string;
}): Promise<AnthropicFileMetadata> {
  const apiKey = input.apiKey ?? (await getAiProviderKey("anthropic"));
  if (!apiKey) throw new AiUpstreamError("anthropic", 400, "anthropic_not_configured");

  const fd = new FormData();
  // Ensure we pass an ArrayBuffer-backed BlobPart (avoids TS mismatch with SharedArrayBuffer typings).
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes as any);
  fd.append("file", new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], { type: input.mime }), input.filename);

  const res = await fetch("https://api.anthropic.com/v1/files", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "files-api-2025-04-14",
    },
    body: fd as any,
  });
  const text = await res.text();
  if (!res.ok) throw new AiUpstreamError("anthropic", res.status, text.slice(0, 800));
  const json = JSON.parse(text) as any;
  return {
    id: String(json?.id ?? ""),
    filename: String(json?.filename ?? input.filename),
    mime_type: String(json?.mime_type ?? input.mime),
    size_bytes: Number(json?.size_bytes ?? input.bytes.byteLength),
    created_at: json?.created_at ? String(json.created_at) : undefined,
  };
}

