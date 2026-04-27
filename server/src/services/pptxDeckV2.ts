// Deck v2: layout spec that Claude controls (positions/styles).
// Renderer executes the spec using PptxGenJS.
import pptxgen from "pptxgenjs";
import { z } from "zod";
import { downloadFileFromAnthropic } from "./anthropicFiles.js";

export const DeckV2Schema = z.object({
  version: z.literal(2),
  title: z.string().min(1),
  theme: z
    .object({
      bg: z.string().optional(), // hex without # (e.g. "0B1020")
      fg: z.string().optional(),
      muted: z.string().optional(),
      accent: z.string().optional(),
      font: z.string().optional(),
    })
    .optional(),
  assets: z
    .object({
      // Optional: provide resolved assets for convenience; renderer can still use element.src directly.
      logoWideFileId: z.string().optional(),
      logoSquareFileId: z.string().optional(),
    })
    .optional(),
  slides: z.array(
    z.object({
      id: z.string().optional(),
      // Declarative hint for layout intent. Renderer can ignore this and still render elements 1:1.
      preset: z
        .discriminatedUnion("kind", [
          z.object({ kind: z.literal("cover"), variant: z.enum(["hero-right", "hero-bottom"]).optional() }),
          z.object({ kind: z.literal("section") }),
          z.object({ kind: z.literal("cards"), columns: z.union([z.literal(2), z.literal(3)]), maxCards: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
          z.object({ kind: z.literal("grid"), rows: z.union([z.literal(2), z.literal(3)]), cols: z.union([z.literal(2), z.literal(3)]) }),
        ])
        .optional(),
      bg: z.string().optional(),
      elements: z.array(
        z.discriminatedUnion("type", [
          z.object({
            type: z.literal("text"),
            text: z.string(),
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
            fontSize: z.number().optional(),
            bold: z.boolean().optional(),
            italic: z.boolean().optional(),
            color: z.string().optional(),
            align: z.enum(["left", "center", "right"]).optional(),
            valign: z.enum(["top", "middle", "bottom"]).optional(),
            // If true, renderer will attempt to fit text within the box.
            fit: z.boolean().optional(),
          }),
          z.object({
            type: z.literal("shape"),
            shape: z.enum(["rect", "roundRect", "line"]),
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
            fill: z.string().optional(),
            line: z
              .object({
                color: z.string().optional(),
                width: z.number().optional(),
              })
              .optional(),
            radius: z.number().optional(),
          }),
          z.object({
            type: z.literal("image"),
            // Source can be an Anthropic file_id (preferred) or a URL (fallback).
            src: z.object({
              kind: z.enum(["anthropic_file", "url"]),
              value: z.string().min(1),
              // Optional mime hint (useful for Anthropic file downloads later)
              mime: z.string().optional(),
            }),
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
            fit: z.enum(["cover", "contain"]).optional(),
          }),
        ]),
      ),
    }),
  ),
});

export type DeckV2 = z.infer<typeof DeckV2Schema>;

function safeHex(x: string | undefined, fallback: string) {
  const s = String(x ?? "").trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

const SLIDE_W_IN = 13.333; // PptxGenJS LAYOUT_WIDE width (inches)
const SLIDE_H_IN = 7.5; // PptxGenJS LAYOUT_WIDE height (inches)
const MIN_SIZE_IN = 0.05;

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function clampBox(box: { x: number; y: number; w: number; h: number }) {
  const x = clamp(box.x, 0, SLIDE_W_IN);
  const y = clamp(box.y, 0, SLIDE_H_IN);
  const maxW = Math.max(MIN_SIZE_IN, SLIDE_W_IN - x);
  const maxH = Math.max(MIN_SIZE_IN, SLIDE_H_IN - y);
  const w = clamp(box.w, MIN_SIZE_IN, maxW);
  const h = clamp(box.h, MIN_SIZE_IN, maxH);
  return { x, y, w, h };
}

function extFromMime(mime: string | undefined) {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "png";
}

function dataUriFromBytes(bytes: Uint8Array, mime: string) {
  const b64 = Buffer.from(bytes as any).toString("base64");
  return `data:${mime};base64,${b64}`;
}

function estimateFittedFontSize(input: { text: string; wIn: number; hIn: number; baseFontSize: number }): number {
  const text = String(input.text ?? "");
  const base = Math.max(10, Math.min(72, Number(input.baseFontSize ?? 18)));
  const wPts = Math.max(1, input.wIn * 72);
  const hPts = Math.max(1, input.hIn * 72);
  // Simple heuristic: average character width ~0.55*fontSize; line-height ~1.22*fontSize.
  // Treat newlines as hard breaks.
  const paras = text.split("\n");
  const maxLineCharsAt = (fs: number) => Math.max(1, Math.floor(wPts / (0.55 * fs)));
  const maxLinesAt = (fs: number) => Math.max(1, Math.floor(hPts / (1.22 * fs)));

  let fs = base;
  for (let i = 0; i < 18; i++) {
    const cpl = maxLineCharsAt(fs);
    const needed = paras.reduce((sum, p) => sum + Math.max(1, Math.ceil(p.length / cpl)), 0);
    const max = maxLinesAt(fs);
    if (needed <= max) break;
    // shrink a bit faster when far off
    const ratio = Math.min(0.92, Math.max(0.7, max / needed));
    fs = Math.max(10, Math.floor(fs * ratio));
  }
  return fs;
}

export async function deckV2ToPptxBuffer(deckJson: unknown) {
  const deck = DeckV2Schema.parse(deckJson);

  const PptxGenJS: any = (pptxgen as any)?.default ?? (pptxgen as any);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Pampa CRM";
  pptx.company = "Pampa CRM";
  pptx.subject = "Cotización";
  pptx.title = deck.title;

  const theme = deck.theme ?? {};
  const COLOR_BG = safeHex(theme.bg, "0B1020");
  const COLOR_FG = safeHex(theme.fg, "FFFFFF");
  const COLOR_MUTED = safeHex(theme.muted, "B6C2E2");
  const COLOR_ACCENT = safeHex(theme.accent, "7C5CFF");
  const FONT = (theme.font ?? "").trim() || undefined;

  // Cache external image bytes so repeated references don't re-download.
  const imageCache = new Map<string, { mime: string; data: string }>();

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: safeHex(s.bg, COLOR_BG) };

    for (const el of s.elements) {
      if (el.type === "text") {
        const box = clampBox(el);
        const fontSize = el.fit
          ? estimateFittedFontSize({ text: el.text, wIn: box.w, hIn: box.h, baseFontSize: el.fontSize ?? 18 })
          : (el.fontSize ?? 18);
        slide.addText(el.text, {
          ...box,
          ...(FONT ? { fontFace: FONT } : {}),
          fontSize,
          bold: el.bold ?? false,
          italic: el.italic ?? false,
          color: safeHex(el.color, COLOR_FG),
          align: el.align ?? "left",
          valign: el.valign ?? "top",
          // Improve readability defaults.
          margin: 0.12,
          lineSpacingMultiple: 1.12,
          // Some PptxGenJS versions support shrink-to-fit via `fit`; keep as any.
          ...(el.fit ? { fit: "shrink" } : {}),
        } as any);
        continue;
      }

      if (el.type === "shape") {
        const box = clampBox(el);
        const shapeType =
          el.shape === "rect"
            ? (pptx.ShapeType.rect as any)
            : el.shape === "roundRect"
              ? (pptx.ShapeType.roundRect as any)
              : (pptx.ShapeType.line as any);
        slide.addShape(shapeType, {
          ...box,
          fill: el.fill ? { color: safeHex(el.fill, COLOR_ACCENT) } : undefined,
          line: el.line
            ? {
                color: el.line.color ? safeHex(el.line.color, COLOR_ACCENT) : safeHex(COLOR_ACCENT, COLOR_ACCENT),
                width: clamp(el.line.width ?? 1, 0.25, 10),
              }
            : undefined,
          radius: el.radius != null ? clamp(el.radius, 0, 2) : undefined,
        } as any);
        continue;
      }

      // image: embed from Anthropic file_id or URL.
      try {
        const box = clampBox(el);
        let cacheKey = `${el.src.kind}:${el.src.value}`;
        let cached = imageCache.get(cacheKey);
        if (!cached) {
          if (el.src.kind === "anthropic_file") {
            const fileId = el.src.value;
            const hintMime = String(el.src.mime ?? "").trim();
            const downloaded = await downloadFileFromAnthropic({ fileId });
            const mime = hintMime || downloaded.mime || "image/png";
            const data = dataUriFromBytes(new Uint8Array(downloaded.bytes), mime);
            cached = { mime, data };
          } else {
            // URL fetch
            const res = await fetch(el.src.value);
            if (!res.ok) throw new Error(`image url fetch failed: ${res.status}`);
            const ab = await res.arrayBuffer();
            const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
            const data = dataUriFromBytes(new Uint8Array(ab), mime);
            cached = { mime, data };
          }
          imageCache.set(cacheKey, cached);
        }

        slide.addImage({
          data: cached.data,
          ...box,
          sizing:
            el.fit === "contain" ? { type: "contain", w: box.w, h: box.h } : { type: "crop", w: box.w, h: box.h },
        } as any);
      } catch {
        // Fallback placeholder
        const box = clampBox(el);
        slide.addShape(pptx.ShapeType.roundRect as any, {
          ...box,
          fill: { color: "111A33" },
          line: { color: "2A355D" },
          radius: 0.2,
        } as any);
        slide.addText(
          `IMG (${extFromMime(el.src.mime)})`,
          { x: box.x, y: box.y + box.h / 2 - 0.2, w: box.w, h: 0.4, color: COLOR_MUTED, align: "center" } as any,
        );
      }
    }
  }

  return (await pptx.write({ outputType: "nodebuffer" } as any)) as Buffer;
}

