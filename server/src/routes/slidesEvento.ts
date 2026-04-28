import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { callAnthropicClaude, getAiProviderKey, AiUpstreamError } from "../services/aiProviders.js";
import { env } from "../config.js";
import { renderDeckHtml } from "./slides.js";
import { DeckV2Schema } from "../services/pptxDeckV2.js";

type EventoDeck = any;

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
      anthropicFileId: a.anthropicFileId ?? null,
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
      const fotosAnthropicFileIds = (act?.fotos ?? [])
        .map((f: any) => String(f?.anthropicFileId ?? "").trim())
        .filter(Boolean)
        .slice(0, 3);
      return {
        servicio: name,
        proveedor: it.proveedor ?? null,
        pax: it.pax ?? null,
        unitCur: it.unitCur ?? null,
        unit: it.unit ?? null,
        subtotal: typeof it.pax === "number" && typeof it.unit === "number" ? it.pax * it.unit : null,
        fotos,
        fotosAnthropicFileIds,
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
            assets: agencyAssets.map((a) => ({
              id: a.id,
              kind: a.kind,
              label: a.label,
              mime: a.mime,
              blobUrl: a.blobUrl,
              anthropicFileId: a.anthropicFileId,
            })),
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
      "Vas a devolver un DECK JSON (no PPTX) que nuestro backend renderiza 1:1 a un archivo .pptx.",
      "Respondé SOLO JSON válido, sin markdown, sin texto extra.",
      "IMPORTANTE: devolvé SIEMPRE el formato DECK_V2 (layout spec) con version=2.",
      "",
      "DECK_V2:",
      "- Raíz: { version:2, title:string, theme?:{bg,fg,muted,accent,font}, slides:[...] }",
      "- Cada slide: { bg?:hex6, preset?:..., elements:[...] }",
      "- preset ayuda a estandarizar layouts, pero IGUAL debés devolver `elements` completos (el renderer no infiere nada).",
      "  preset permitido:",
      '  - { kind:"cover", variant?:"hero-right"|"hero-bottom" }',
      '  - { kind:"section" }',
      '  - { kind:"cards", columns:2|3, maxCards:2|3|4 }',
      '  - { kind:"grid", rows:2|3, cols:2|3 }',
      "- Elementos permitidos:",
      '  - text: { type:"text", text, x,y,w,h, fontSize?, bold?, italic?, color?, align?, valign?, fit? }',
      '  - shape: { type:"shape", shape:"rect"|"roundRect"|"line", x,y,w,h, fill?, line?, radius? }',
      '  - image: { type:"image", src:{ kind:"anthropic_file"|"url", value:string, mime? }, x,y,w,h, fit? }',
      '  - sectionHeader: { type:"sectionHeader", title, subtitle?, x,y,w,h }  // renderer genera estilo consistente',
      '  - card: { type:"card", x,y,w,h, title, subtitle?, bullets?, priceLabel?, image? } // renderer genera chrome + layout interno',
      "",
      "COORDENADAS:",
      "- Usamos layout 16:9 (PptxGenJS LAYOUT_WIDE). Unidades en pulgadas.",
      "- CANVAS: ancho=13.33, alto=7.50.",
      "- REGLA ESTRICTA: x>=0, y>=0, w>0, h>0.",
      "- REGLA ESTRICTA: x+w<=13.33 y y+h<=7.50.",
      "- Tamaño mínimo recomendado: w>=0.30, h>=0.20 (evitá 0/negativos).",
      "- Usá márgenes/\"safe area\". Evitá pegar texto al borde; dejá ~0.35\" de padding visual.",
      "",
      "TEXTOS:",
      "- Preferí cajas de texto amplias (w>=4.0) para títulos.",
      "- Para textos largos: poné fit=true (shrink) y reducís bullets.",
      "- Máximo 6 bullets por bloque. Máximo 14 palabras por bullet.",
      "- Nunca uses párrafos largos. Mejor 2-4 bullets cortos.",
      "",
      "REGLAS DE DISEÑO (estilo \"Pampa\" moderno):",
      "- Portada: logo arriba izq, título grande, subtítulo, y una foto hero a la derecha o abajo.",
      "- Secciones: título + bullets cortos + barra/acento.",
      "- Ítems cotizados: cards con foto (cover), título, proveedor, pax, precio, bullets; máximo 4 por slide.",
      "- Jerarquía tipográfica: título 40-52, subtítulos 18-22, cuerpo 14-18.",
      "- Usá theme oscuro por defecto (bg oscuro, texto claro, accent violeta/azul).",
      "- Si se adjunta una guía PPTX/PDF, priorizá su dirección visual: paleta, ritmo, composición, uso de logos, tipo de portada y estilo de slides.",
      "- No inventes una identidad visual genérica si hay guía adjunta; adaptá el contenido del evento al look & feel de esa guía.",
      "",
      "IMÁGENES:",
      "- Si tenés file_id (Anthropic Files) usá src.kind='anthropic_file' con value=file_id.",
      "- Si no, usá src.kind='url' con value=url absoluta.",
      "- Para fotos: fit='cover' en cards/hero. Para logos: fit='contain'.",
      "- No estires logos: mantenelos dentro de cajas anchas y bajas (ej: h<=0.7).",
      "",
      "LIMITES:",
      "- Máximo 14 slides.",
      "- Texto conciso, bullets cortos. Evitá párrafos largos.",
    ].join("\n");

    const attachments: any[] = [];
    // Attach guide/logos/photos if they were synced to Anthropic Files API.
    // PPTX guides are converted to PDF before upload; legacy rows may still store
    // the original PPTX mime locally, but the Anthropic file_id points to the PDF.
    const guide = agencyAssets.find((a) => a.kind === "pptx_guide" && a.anthropicFileId) ?? null;
    if (guide?.anthropicFileId) {
      attachments.push({ type: "document", source: { type: "file", file_id: guide.anthropicFileId } });
    }
    const logo = (logoWide?.anthropicFileId ? logoWide : logoSquare?.anthropicFileId ? logoSquare : null) as any;
    if (logo?.anthropicFileId) {
      attachments.push({
        type: "image",
        source: { type: "file", file_id: logo.anthropicFileId },
      });
    }
    // Attach up to 8 catalog photos referenced by current quote items.
    const photoIds = quoteItems.flatMap((qi: any) => (qi.fotosAnthropicFileIds ?? []) as string[]).filter(Boolean).slice(0, 8);
    for (const fid of photoIds) {
      attachments.push({ type: "image", source: { type: "file", file_id: fid } });
    }

    const userText = `CONTEXT_JSON:\n${JSON.stringify(context)}\n\nINSTRUCCION:\n${body.prompt}`;
    const user = {
      role: "user" as const,
      content: [
        ...(attachments.length ? attachments : []),
        { type: "text", text: userText },
      ],
    };

    let deck: EventoDeck;
    try {
      // eslint-disable-next-line no-console
      console.info("[slidesEvento] calling_claude", {
        eventoId: body.eventoId,
        model: "claude-sonnet-4-6",
        systemChars: system.length,
        userChars: userText.length,
      });
      async function callOnce(tag: "first" | "retry", apiKeyNonNull: string) {
        const txt = await callAnthropicClaude({
          apiKey: apiKeyNonNull,
          system,
          messages: [user],
          model: "claude-sonnet-4-6",
          maxTokens: 6000,
          betas: attachments.length ? ["files-api-2025-04-14"] : undefined,
          stopSequences: ["\n\nINSTRUCCION:", "\n\nCONTEXT_JSON:"],
        });
        const parsed = tryParseDeckJson(txt);
        if (!parsed.ok) {
          // eslint-disable-next-line no-console
          console.warn("[slidesEvento] Claude JSON parse error", {
            eventoId: body.eventoId,
            tag,
            upstreamSnippet: redactTokens(String(txt ?? "")).slice(0, 2000),
          });
          return { ok: false as const, txt };
        }
        try {
          const d = parsed.deck as any;
          if (d?.version !== 2) throw new Error("deck_not_v2");
          DeckV2Schema.parse(d);
          return { ok: true as const, deck: d, txt };
        } catch {
          // eslint-disable-next-line no-console
          console.warn("[slidesEvento] Claude deck v2 validation error", {
            eventoId: body.eventoId,
            tag,
            upstreamSnippet: redactTokens(String(txt ?? "")).slice(0, 2000),
          });
          return { ok: false as const, txt };
        }
      }

      const first = await callOnce("first", apiKey);
      if (first.ok) deck = first.deck;
      else {
        const retry = await callOnce("retry", apiKey);
        if (retry.ok) deck = retry.deck;
        else {
          return reply.code(502).send({
            error: "ai_parse_error",
            message: "Claude devolvió un JSON inválido (Deck v2).",
            upstreamBodySnippet: redactTokens(String(retry.txt ?? first.txt ?? "")).slice(0, 8000),
          });
        }
      }
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

    // For DeckV2, the renderer consumes explicit elements; we don't patch logo into the deck here.

    // Always log what Claude returned (to avoid losing paid output).
    // eslint-disable-next-line no-console
    console.info("[slidesEvento] Claude deck (parsed)", {
      eventoId: body.eventoId,
      deckTitle: deck.title ?? null,
      slidesCount: Array.isArray(deck.slides) ? deck.slides.length : null,
      version: deck?.version ?? null,
      reqId: (req as any).id ?? null,
    });

    try {
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
    } catch (e: any) {
      // DB failures (eg. migrations not applied) should not discard the Claude result.
      // eslint-disable-next-line no-console
      console.warn("[slidesEvento] Failed to persist SlideDeck; returning deck inline", {
        eventoId: body.eventoId,
        code: e?.code ?? null,
        message: String(e?.message ?? "").slice(0, 500),
      });
      return reply.code(200).send({
        ok: true,
        provider: "anthropic",
        warning: "deck_not_persisted",
        deck,
        previewHtml: renderDeckHtml(deck as any),
      });
    }
  });
}

