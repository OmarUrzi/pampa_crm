import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { getAiProviderKey, callAnthropicClaude, AiUpstreamError } from "../services/aiProviders.js";

type Deck = {
  title: string;
  slides: Array<
    | { kind: "title"; title: string; subtitle?: string }
    | { kind: "section"; title: string; bullets?: string[] }
    | { kind: "activity"; title: string; description?: string; priceUsd?: number | null; supplier?: string | null; imageUrls?: string[] }
    | { kind: "closing"; title: string; bullets?: string[] }
  >;
};

function escapeHtml(x: string) {
  return x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderDeckHtml(deck: Deck) {
  const title = escapeHtml(deck.title ?? "Slides");
  const slides = (deck.slides ?? []).map((s, idx) => {
    const n = idx + 1;
    if (s.kind === "title") {
      return `<section class="slide title"><div class="kicker">Slide ${n}</div><h1>${escapeHtml(s.title)}</h1>${s.subtitle ? `<p class="sub">${escapeHtml(s.subtitle)}</p>` : ""}</section>`;
    }
    if (s.kind === "section") {
      const bullets = (s.bullets ?? []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
      return `<section class="slide"><div class="kicker">Slide ${n}</div><h2>${escapeHtml(s.title)}</h2>${bullets ? `<ul>${bullets}</ul>` : ""}</section>`;
    }
    if (s.kind === "activity") {
      const imgs = (s.imageUrls ?? []).slice(0, 2).map((u) => `<img src="${escapeHtml(u)}" alt="">`).join("");
      return `<section class="slide"><div class="kicker">Slide ${n} · Actividad</div><h2>${escapeHtml(s.title)}</h2>${s.description ? `<p>${escapeHtml(s.description)}</p>` : ""}<div class="meta">${s.priceUsd != null ? `<span>U$D ${escapeHtml(String(s.priceUsd))}/pax</span>` : ""}${s.supplier ? `<span>${escapeHtml(String(s.supplier))}</span>` : ""}</div>${imgs ? `<div class="imgs">${imgs}</div>` : ""}</section>`;
    }
    const bullets = (s.bullets ?? []).map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    return `<section class="slide"><div class="kicker">Slide ${n}</div><h2>${escapeHtml(s.title)}</h2>${bullets ? `<ul>${bullets}</ul>` : ""}</section>`;
  });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: #f6f6f7; color: #111827; }
    header { padding: 16px 18px; background: white; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; z-index: 5; }
    header h1 { margin: 0; font-size: 14px; letter-spacing: .02em; text-transform: uppercase; color: #6b7280; }
    main { padding: 16px; display: grid; gap: 14px; max-width: 1100px; margin: 0 auto; }
    .slide { background: white; border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px; box-shadow: 0 2px 10px rgba(0,0,0,.03); }
    .kicker { font-size: 11px; color: #6b7280; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 10px; }
    .title h1 { font-size: 34px; margin: 0 0 6px; }
    h2 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 10px; color: #374151; line-height: 1.5; }
    ul { margin: 8px 0 0 18px; color: #374151; }
    .meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; color: #6b7280; font-size: 12px; font-weight: 700; }
    .imgs { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .imgs img { width: 100%; height: 220px; object-fit: cover; border-radius: 12px; border: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <header><h1>${title}</h1></header>
  <main>${slides.join("")}</main>
</body>
</html>`;
}

async function generateDeckWithClaude(input: { prompt: string; actividades: any[] }) {
  const apiKey = await getAiProviderKey("anthropic");
  if (!apiKey) {
    return { error: "anthropic_not_configured", message: "No hay API key de Anthropic (Claude). Configurala en Admin → IA." } as const;
  }

  const system = [
    "Sos un asistente que arma presentaciones tipo Google Slides.",
    "Respondé SOLO JSON válido, sin markdown, sin texto extra.",
    "Estructura requerida:",
    '{"title": string, "slides": [ { "kind": "title"|"section"|"activity"|"closing", ... } ] }',
    "Usá máximo 12 slides.",
    "Para slides kind=activity, elegí actividades del catálogo provisto.",
  ].join("\n");

  const actividades = input.actividades.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    categoria: a.categoria,
    descripcion: a.descripcion ?? null,
    precioUsd: a.precioUsd ?? null,
    proveedorTxt: a.proveedorTxt ?? null,
    fotos: (a.fotos ?? []).map((f: any) => ({
      url: f.url ?? null,
      hasBytes: !!f.bytes,
      blobUrl: f.bytes ? `/catalogo/fotos/${f.id}/blob` : null,
    })),
  }));

  const user = `CATALOGO_JSON:\n${JSON.stringify({ actividades })}\n\nINSTRUCCION:\n${input.prompt}`;
  const txt = await callAnthropicClaude({
    apiKey,
    system,
    messages: [{ role: "user", content: user }],
    model: process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-latest",
  });

  let json: any;
  try {
    json = JSON.parse(txt);
  } catch {
    throw new AiUpstreamError("anthropic", 502, txt.slice(0, 800));
  }
  return json as Deck;
}

export async function registerSlidesRoutes(app: FastifyInstance) {
  // Generate a deck for the catalog using Claude; store JSON and return a URL to view it.
  app.post("/slides/generate", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const schema = z.object({
      eventoId: z.string().min(1).optional(),
      prompt: z.string().min(1),
    });
    const body = schema.parse(req.body);

    const acts = await prisma.actividadCatalogo.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { fotos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
      take: 80,
    });

    try {
      const deckOrErr = await generateDeckWithClaude({ prompt: body.prompt, actividades: acts });
      if ((deckOrErr as any)?.error) return reply.code(400).send(deckOrErr);
      const deck = deckOrErr as Deck;

      const row = await prisma.slideDeck.create({
        data: {
          eventoId: body.eventoId ?? null,
          prompt: body.prompt,
          provider: "anthropic",
          deckJson: deck as any,
        },
      });

      return reply.send({
        ok: true,
        provider: "anthropic",
        deckId: row.id,
        url: `/slides/decks/${row.id}`,
      });
    } catch (e) {
      if (e instanceof AiUpstreamError) {
        return reply.code(502).send({ error: "ai_upstream_error", message: "Error generando slides con Claude." });
      }
      throw e;
    }
  });

  // View stored deck as HTML (simple renderer).
  app.get("/slides/decks/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = await prisma.slideDeck.findUnique({ where: { id }, select: { deckJson: true, deletedAt: true } });
    if (!row || row.deletedAt) return reply.code(404).send({ error: "not_found" });
    const html = renderDeckHtml(row.deckJson as any);
    reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(html);
  });
}

