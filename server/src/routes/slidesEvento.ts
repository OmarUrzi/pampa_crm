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
  const resolvedBase = base || `http://localhost:${env.PORT ?? 8787}`;
  return `${resolvedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function moneyLabel(cur: string, amount: number) {
  const prefix = cur === "ARS" ? "$" : "USD";
  return `${prefix} ${Number(amount ?? 0).toLocaleString("en-US")}`;
}

function quoteOnlyDeck(input: { deck: any; context: any }) {
  const ctx = input.context;
  const items = Array.isArray(ctx?.cotizacion?.items) ? ctx.cotizacion.items : [];
  const event = ctx?.evento ?? {};
  const agencyAssets = Array.isArray(ctx?.agencia?.assets) ? ctx.agencia.assets : [];
  const logo =
    agencyAssets.find((a: any) => a.kind === "logo_wide" && a.blobUrl) ??
    agencyAssets.find((a: any) => a.kind === "logo_square" && a.blobUrl) ??
    null;
  const total = Number(ctx?.cotizacion?.total ?? 0);
  // Quote-only decks keep a stable agency-like palette; Claude may return random
  // accent colors that create inconsistent borders.
  const bg = "1A3A1A";
  const fg = "FFFFFF";
  const muted = "C8B87A";
  const accent = "C8A020";
  const theme = { bg, fg, muted, accent, font: "Georgia" };
  const light = "F5F0E8";
  const dark = bg || "1A3A1A";
  const title = `${event.nombre ?? "Cotización"} — ${event.locacion ?? ""}`.trim();
  const pax = event.pax ?? "—";
  const location = event.locacion ?? "—";
  const company = event.empresa ?? "—";

  const text = (text: string, x: number, y: number, w: number, h: number, opts: any = {}) => ({
    type: "text",
    text,
    x,
    y,
    w,
    h,
    ...opts,
  });
  const shape = (x: number, y: number, w: number, h: number, fill: string, opts: any = {}) => ({
    type: "shape",
    shape: "rect",
    x,
    y,
    w,
    h,
    fill,
    ...opts,
  });
  const logoEl = logo?.blobUrl
    ? [{ type: "image", src: { kind: "url", value: logo.blobUrl, mime: logo.mime ?? undefined }, x: 0.45, y: 0.32, w: 2.1, h: 0.72, fit: "contain" }]
    : [];
  const firstPhoto = items.find((it: any) => Array.isArray(it.fotos) && it.fotos[0])?.fotos?.[0] ?? null;

  const slides: any[] = [
    {
      bg: dark,
      preset: { kind: "cover", variant: "hero-bottom" },
      elements: [
        shape(0, 0, 13.33, 0.18, accent),
        shape(0, 7.28, 13.33, 0.22, accent),
        ...logoEl,
        ...(firstPhoto ? [{ type: "image", src: { kind: "url", value: firstPhoto }, x: 7.1, y: 0.65, w: 5.65, h: 5.85, fit: "cover" }] : []),
        text(String(location).toUpperCase(), 0.65, 1.85, firstPhoto ? 5.85 : 12.0, 1.15, { fontSize: 54, bold: true, color: accent, align: firstPhoto ? "left" : "center", fit: true }),
        text(`${company} · ${pax} PAX`, 0.68, 3.18, firstPhoto ? 5.7 : 12.0, 0.45, { fontSize: 18, color: fg, align: firstPhoto ? "left" : "center", fit: true }),
        text("Propuesta de servicios cotizados", 0.68, 3.83, firstPhoto ? 5.7 : 12.0, 0.45, { fontSize: 16, color: muted, align: firstPhoto ? "left" : "center", fit: true }),
      ],
    },
    {
      bg: light,
      elements: [
        shape(0, 0, 4.25, 7.5, dark),
        shape(12.95, 0, 0.38, 7.5, accent),
        text("SERVICIOS\nCOTIZADOS", 0.32, 1.1, 3.45, 1.6, { fontSize: 36, bold: true, color: fg, fit: true }),
        text(`${pax} PAX · ${location}`, 0.32, 5.7, 3.4, 0.45, { fontSize: 16, color: muted, italic: true, fit: true }),
        ...items.slice(0, 4).flatMap((it: any, idx: number) => {
          const y = 0.85 + idx * 1.25;
          const cur = it.unitCur ?? event.currency ?? "USD";
          const subtotal = Number(it.subtotal ?? 0);
          return [
            shape(4.65, y - 0.12, 7.85, 0.92, "FFFFFF", { line: { color: "FFFFFF", width: 0.5 }, radius: 0.18 }),
            text(String(it.servicio ?? "Servicio"), 4.9, y, 5.2, 0.36, { fontSize: 18, bold: true, color: dark, fit: true }),
            text(`${it.pax ?? pax} pax · ${cur} ${subtotal.toLocaleString("en-US")}`, 4.9, y + 0.43, 5.2, 0.28, { fontSize: 12, color: dark, fit: true }),
          ];
        }),
      ],
    },
  ];

  for (const [idx, it] of items.entries()) {
    const cur = it.unitCur ?? event.currency ?? "USD";
    const unit = Number(it.unit ?? 0);
    const subtotal = Number(it.subtotal ?? (Number(it.pax ?? pax ?? 0) * unit));
    const photo = Array.isArray(it.fotos) ? it.fotos[0] : null;
    const imageEls: any[] = photo
      ? [
          shape(7.0, 0.85, 5.75, 4.75, light, { line: { color: light, width: 0.5 } }),
          { type: "image", src: { kind: "url", value: photo }, x: 7.15, y: 1.0, w: 5.45, h: 4.45, fit: "cover" },
        ]
      : [shape(7.0, 0.85, 5.75, 4.75, "214A25", { line: { color: accent, width: 1 } })];
    slides.push({
      bg: dark,
      elements: [
        shape(0, 0, 13.33, 0.18, accent),
        text(String(it.servicio ?? `Servicio ${idx + 1}`), 0.55, 0.8, 5.9, 1.35, { fontSize: 38, bold: true, color: fg, fit: true }),
        text(`${Number(it.pax ?? pax ?? 0)} PAX · ${cur} ${unit.toLocaleString("en-US")} / pax`, 0.55, 2.35, 5.7, 0.5, {
          fontSize: 18,
          color: muted,
          fit: true,
        }),
        shape(0.55, 5.75, 5.85, 0.92, accent),
        text(`SUBTOTAL ${cur} ${subtotal.toLocaleString("en-US")}`, 0.75, 5.98, 5.45, 0.42, { fontSize: 22, bold: true, color: dark, fit: true }),
        ...imageEls,
      ],
    });
  }

  slides.push({
    bg: light,
    elements: [
      shape(0, 0, 13.33, 0.18, accent),
      text("RESUMEN DE INVERSIÓN", 0.7, 0.8, 11.8, 0.75, { fontSize: 34, bold: true, color: dark, align: "center", fit: true }),
      ...items.slice(0, 6).map((it: any, idx: number) => {
        const cur = it.unitCur ?? event.currency ?? "USD";
        const subtotal = Number(it.subtotal ?? 0);
        return text(`${it.servicio} · ${it.pax ?? pax} pax · ${cur} ${subtotal.toLocaleString("en-US")}`, 1.0, 2.0 + idx * 0.55, 11.3, 0.42, {
          fontSize: 18,
          color: dark,
          fit: true,
        });
      }),
        text(`TOTAL ${(event.currency ?? "USD") === "ARS" ? "$" : "USD"} ${total.toLocaleString("en-US")}`, 1.0, 5.55, 11.3, 0.85, {
          fontSize: 38,
          bold: true,
          color: dark,
          align: "center",
          fit: true,
        }),
    ],
  });

  return { version: 2, title, theme: { ...theme, bg, fg, muted, accent }, slides };
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
        total: quoteItems.reduce((sum, it: any) => sum + (typeof it.subtotal === "number" ? it.subtotal : 0), 0),
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
      "- DATOS CANÓNICOS: usá solamente CONTEXT_JSON para pax, fecha, locación, servicios, precios y totales.",
      "- No copies pax/fechas de la guía visual. Si la guía dice otro pax o fecha, ignoralo.",
      `- Para este pedido, el PAX canónico es ${evento.pax ?? "el indicado en CONTEXT_JSON"}.`,
      "- CONTENIDO ESTRICTO: la guía adjunta es SOLO referencia visual (layout, paleta, ritmo, tipografía).",
      "- No copies texto, agenda, servicios, actividades, títulos, disclaimers, condiciones comerciales ni datos de cliente desde la guía visual.",
      "- No agregues servicios, inclusiones, vehículos, excursiones, actividades, cronogramas ni condiciones que no estén en CONTEXT_JSON.",
      "- No infieras inclusiones a partir del nombre del servicio. Ej: si el item se llama 'Servicio de Traslado', NO inventes aeropuerto, hotel, restaurantes, excursiones, vehículos, equipaje ni logística.",
      "- No infieras inclusiones a partir de 'Clase Ski'. NO inventes instructores, niveles, alquiler, medios de elevación, duración ni formatos si no aparecen literalmente en CONTEXT_JSON.",
      "- Las slides de servicio solo pueden usar estos datos del item: servicio, proveedor, pax, unitCur, unit, subtotal y fotos. Si no hay descripción explícita en el item, no agregues descripción ni bullets de inclusiones.",
      "- La slide de introducción/resumen solo puede listar alcance general del evento y nombres de servicios cotizados; no agregues contenido del guide.",
      "- No agregues condiciones comerciales salvo que estén literalmente en CONTEXT_JSON. Evitá frases como 'tarifas netas', 'vigencia', 'propinas', 'gastos bancarios', 'recargos', 'no reembolso'.",
      "",
      "REGLAS DE DISEÑO (estilo \"Pampa\" moderno):",
      "- Portada: logo arriba izq, título grande, subtítulo, y una foto hero a la derecha o abajo.",
      "- Secciones: título + bullets cortos + barra/acento.",
      "- Ítems cotizados: cards con foto (cover), título, proveedor, pax, precio, bullets; máximo 4 por slide.",
      "- Jerarquía tipográfica: título 40-52, subtítulos 18-22, cuerpo 14-18.",
      "- Usá theme oscuro por defecto (bg oscuro, texto claro, accent violeta/azul).",
      "- Si hay una guía visual/de marca cargada, usala solo como inspiración de layout: paleta, ritmo, composición, uso de logos, tipo de portada y estilo de slides.",
      "- No inventes una identidad visual genérica; mantené un look & feel consistente con la agencia, sin copiar contenido de archivos guía.",
      "- ESTRUCTURA: cada item de cotización debe tener su propia diapositiva de servicio; no agrupes dos o más servicios en una misma slide.",
      "- Podés usar una slide adicional de resumen/inversión, pero las slides de servicios deben ser individuales.",
      "- No uses rótulos genéricos como 'ACTIVIDAD 01', 'SERVICIO 02' o similares: el título principal de cada slide de servicio debe ser el nombre real del servicio.",
      "- En slides de servicio, separá claramente título, subtítulo, descripción y bullets. No superpongas cajas de texto: dejá al menos 0.18\" de aire vertical entre bloques.",
      "- La inversión total debe aparecer una sola vez, preferentemente en la slide final de resumen/inversión. No la repitas en la slide de introducción o propuesta.",
      "- La slide de introducción/resumen debe explicar alcance y experiencia, no mostrar el total económico si existe una slide final de inversión.",
      "",
      "IMÁGENES:",
      "- Para elementos image del DECK JSON, preferí SIEMPRE src.kind='url' con blobUrl/url absoluta cuando exista.",
      "- No uses src.kind='anthropic_file' para logos/assets de agencia si hay blobUrl: esos file_id sirven para que vos veas la guía/imagen, pero el renderer no siempre puede descargarlos.",
      "- Solo usá src.kind='anthropic_file' si no existe ninguna URL/blobUrl para ese asset.",
      "- Para fotos: fit='cover' en cajas amplias, evitando deformarlas o forzar ratios raros.",
      "- Para logos: fit='contain', h<=0.7 y ubicarlos sobre una pastilla/fondo claro o zona clara si el asset tiene fondo blanco.",
      "- No pegues logos con fondo blanco directamente encima de un fondo oscuro sin contenedor o margen.",
      "",
      "LIMITES:",
      "- Máximo 14 slides.",
      "- Texto conciso, bullets cortos. Evitá párrafos largos.",
    ].join("\n");

    const attachments: any[] = [];
    // Do not attach the PPTX/PDF guide to generation: Claude can read its text and
    // copy guide-only services/conditions into the quote. Keep the guide as visual
    // inspiration in the prompt, but make CONTEXT_JSON the only content source.
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
          maxTokens: 12000,
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

    // Claude may still infer content from service names. Keep its visual theme, but
    // rebuild slide content from CONTEXT_JSON so the quote stays source-of-truth.
    deck = quoteOnlyDeck({ deck, context });

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

