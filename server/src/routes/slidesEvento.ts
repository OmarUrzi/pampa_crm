import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { callAnthropicClaude, getAiProviderKey, AiUpstreamError } from "../services/aiProviders.js";
import { env } from "../config.js";

type EventoDeck = {
  title: string;
  logo?: { variant?: "square" | "wide"; url?: string };
  slides: Array<
    | { kind: "title"; title: string; subtitle?: string }
    | { kind: "section"; title: string; bullets?: string[] }
    | {
        kind: "quote_item";
        title: string;
        supplier?: string | null;
        bullets?: string[];
        priceLabel?: string | null;
        imageUrls?: string[];
      }
    | { kind: "closing"; title: string; bullets?: string[] }
  >;
};

function redactTokens(input: string) {
  // Avoid logging JWTs (Authorization query tokens) in server logs / API responses.
  return String(input ?? "").replace(/([?&]token=)[^&\s"]+/gi, "$1[REDACTED]");
}

function extractFirstJsonObject(raw: string): string | null {
  const s = String(raw ?? "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === "\"") {
        inStr = false;
        continue;
      }
      continue;
    }
    if (ch === "\"") {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseDeckJson(raw: string): { ok: true; deck: EventoDeck; usedExtraction?: boolean } | { ok: false } {
  const txt = String(raw ?? "").trim();
  if (!txt) return { ok: false };
  try {
    return { ok: true, deck: JSON.parse(txt) as EventoDeck };
  } catch {
    const extracted = extractFirstJsonObject(txt);
    if (extracted) {
      try {
        return { ok: true, deck: JSON.parse(extracted) as EventoDeck, usedExtraction: true };
      } catch {
        return { ok: false };
      }
    }
    return { ok: false };
  }
}

function apiAbsUrl(path: string) {
  const base = String(process.env.API_PUBLIC_BASE ?? "").trim().replace(/\/$/, "");
  if (!base) return path; // fallback
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function moneyLabel(cur: string, amount: number) {
  const prefix = cur === "ARS" ? "$" : "U$D";
  return `${prefix} ${Number(amount ?? 0).toLocaleString("en-US")}`;
}

export async function registerSlidesEventoRoutes(app: FastifyInstance) {
  app.post("/slides/generate-from-evento", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const schema = z.object({
      eventoId: z.string().min(1),
      prompt: z.string().min(1),
      provider: z.enum(["anthropic"]).optional(),
    });
    const body = schema.parse(req.body);

    const evento = await prisma.evento.findUnique({
      where: { id: body.eventoId },
      include: { empresa: true },
    });
    if (!evento || evento.deletedAt) return reply.code(404).send({ error: "not_found" });

    const version = await prisma.cotizacionVersion.findFirst({
      where: { eventoId: body.eventoId, deletedAt: null, isCurrent: true },
      include: { items: { where: { deletedAt: null } } },
      orderBy: { versionNo: "desc" },
    });
    if (!version) return reply.code(404).send({ error: "not_found" });

    const agency = await prisma.agencyProfile.findFirst({
      where: { deletedAt: null },
      include: { assets: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
    });

    // Resolve catalog photos for quote items by servicio name (best-effort).
    const servicios = Array.from(
      new Set((version.items ?? []).map((it: any) => String(it.servicio ?? "").trim()).filter(Boolean)),
    ) as string[];
    const acts = servicios.length
      ? await prisma.actividadCatalogo.findMany({
          where: { deletedAt: null, nombre: { in: servicios } },
          include: { fotos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
          take: 80,
        })
      : [];
    const actByName = new Map<string, any>();
    for (const a of acts) actByName.set(String(a.nombre ?? "").trim(), a);

    const token = String((req.headers as any)?.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
    const tokenQ = token ? `?token=${encodeURIComponent(token)}` : "";

    const agencyAssets = (agency?.assets ?? []).map((a: any) => ({
      id: a.id,
      kind: a.kind,
      label: a.label ?? null,
      url: a.url ?? null,
      blobUrl: a.bytes ? apiAbsUrl(`/agencia/assets/${a.id}/blob${tokenQ}`) : null,
      mime: a.mime ?? null,
    }));

    const logoWide = agencyAssets.find((a) => a.kind === "logo_wide" && a.blobUrl) ?? null;
    const logoSquare = agencyAssets.find((a) => a.kind === "logo_square" && a.blobUrl) ?? null;

    const quoteItems = (version.items ?? []).map((it: any) => {
      const name = String(it.servicio ?? "").trim();
      const act = actByName.get(name);
      const fotos = (act?.fotos ?? []).slice(0, 3).map((f: any) => {
        if (f.url) return f.url;
        if (f.bytes) return apiAbsUrl(`/catalogo/fotos/${f.id}/blob${tokenQ}`);
        return null;
      }).filter(Boolean);
      return {
        servicio: name,
        proveedor: it.proveedor ?? null,
        pax: it.pax ?? null,
        unitCur: it.unitCur ?? null,
        unit: it.unit ?? null,
        subtotal: typeof it.pax === "number" && typeof it.unit === "number" ? it.pax * it.unit : null,
        fotos,
        descripcion: act?.descripcion ?? null,
      };
    });

    const context = {
      agencia: agency
        ? {
            name: agency.name,
            tagline: agency.tagline ?? null,
            about: agency.about ?? null,
            contact: agency.contact ?? null,
            website: agency.website ?? null,
            assets: agencyAssets,
          }
        : null,
      evento: {
        id: evento.id,
        nombre: evento.nombre,
        empresa: evento.empresa?.nombre ?? null,
        fecha: (evento as any).fechaLabel ?? null,
        pax: evento.pax ?? null,
        locacion: evento.locacion ?? null,
        contactoRef: evento.contactoRef ?? null,
        currency: evento.currency ?? null,
      },
      cotizacion: {
        versionId: version.id,
        label: version.label,
        items: quoteItems,
      },
    };

    const apiKey = await getAiProviderKey("anthropic");
    if (!apiKey) {
      return reply.code(400).send({ error: "anthropic_not_configured", message: "No hay API key de Anthropic (Claude). Configurala en Admin → IA." });
    }

    const system = [
      "Sos un asistente que arma presentaciones de cotización para una agencia de eventos.",
      "Respondé SOLO JSON válido, sin markdown, sin texto extra.",
      'NO uses la clave "type". Usá SIEMPRE la clave "kind".',
      'Los valores permitidos para slide.kind son: "title" | "section" | "quote_item" | "closing".',
      "Escapá saltos de línea dentro de strings como \\n.",
      "Usá el contexto provisto (agencia, evento, cotización) para estructurar el deck.",
      "Incluí logo de agencia en la portada si hay assets disponibles.",
      "Usá como máximo 14 slides.",
      "Estructura requerida:",
      '{"title": string, "logo"?: { "variant"?: "square"|"wide", "url"?: string }, "slides": [ ... ] }',
      'Ejemplo mínimo válido: {"title":"Cotización","slides":[{"kind":"title","title":"...","subtitle":"..."}]}',
    ].join("\n");

    const user = `CONTEXT_JSON:\n${JSON.stringify(context)}\n\nINSTRUCCION:\n${body.prompt}`;

    let deck: EventoDeck;
    try {
      // eslint-disable-next-line no-console
      console.info("[slidesEvento] calling_claude", {
        eventoId: body.eventoId,
        model: "claude-sonnet-4-6",
        systemChars: system.length,
        userChars: user.length,
      });
      const txt = await callAnthropicClaude({
        apiKey,
        system,
        messages: [{ role: "user", content: user }],
        model: "claude-sonnet-4-6",
        maxTokens: 2400,
        stopSequences: ["\n\nINSTRUCCION:", "\n\nCONTEXT_JSON:"],
      });
      const parsed = tryParseDeckJson(txt);
      if (!parsed.ok) {
        // eslint-disable-next-line no-console
        console.warn("[slidesEvento] Claude JSON parse error", {
          eventoId: body.eventoId,
          upstreamSnippet: redactTokens(String(txt ?? "")).slice(0, 2000),
        });
        return reply.code(502).send({
          error: "ai_parse_error",
          message: "Claude devolvió un JSON inválido.",
          upstreamBodySnippet: redactTokens(String(txt ?? "")).slice(0, 8000),
        });
      }
      deck = parsed.deck;
    } catch (e) {
      if (e instanceof AiUpstreamError) {
        return reply.code(502).send({
          error: "ai_upstream_error",
          message: "Error generando slides con Claude.",
          provider: e.provider,
          httpStatus: e.httpStatus,
          bodySnippet: redactTokens(e.bodySnippet),
        });
      }
      // eslint-disable-next-line no-console
      console.warn("[slidesEvento] Claude call failed", { eventoId: body.eventoId });
      return reply.code(502).send({ error: "ai_parse_error", message: "Claude devolvió un JSON inválido." });
    }

    // Ensure logo hint if model didn't include it.
    if (!deck.logo?.url) {
      const preferred = logoWide?.blobUrl ?? logoSquare?.blobUrl ?? null;
      if (preferred) deck.logo = { variant: logoWide?.blobUrl ? "wide" : "square", url: preferred };
    }

    const row = await prisma.slideDeck.create({
      data: {
        eventoId: evento.id,
        source: "evento",
        title: deck.title ?? null,
        prompt: body.prompt,
        provider: "anthropic",
        deckJson: deck as any,
      },
    });

    return reply.send({ ok: true, provider: "anthropic", deckId: row.id, url: `/slides/decks/${row.id}` });
  });
}

