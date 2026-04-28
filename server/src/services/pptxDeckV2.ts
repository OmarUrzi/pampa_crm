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
            type: z.literal("sectionHeader"),
            title: z.string().min(1),
            subtitle: z.string().optional(),
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
            accent: z.boolean().optional(),
          }),
          z.object({
            type: z.literal("card"),
            x: z.number(),
            y: z.number(),
            w: z.number(),
            h: z.number(),
            radius: z.number().optional(),
            bg: z.string().optional(),
            shadow: z.boolean().optional(),
            image: z
              .object({
                src: z.object({
                  kind: z.enum(["anthropic_file", "url"]),
                  value: z.string().min(1),
                  mime: z.string().optional(),
                }),
                fit: z.enum(["cover", "contain"]).optional(),
              })
              .optional(),
            title: z.string().optional(),
            subtitle: z.string().optional(),
            bullets: z.array(z.string().min(1)).optional(),
            footerRight: z.string().optional(),
          }),
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

type FitMode = "cover" | "contain" | undefined;

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

function imageSize(bytes: Uint8Array, mime: string): { w: number; h: number } | null {
  const b = Buffer.from(bytes as any);
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("png") && b.length >= 24 && b.toString("ascii", 1, 4) === "PNG") {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if ((m.includes("jpeg") || m.includes("jpg")) && b.length > 4) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) break;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

function containPlacement(box: { x: number; y: number; w: number; h: number }, img?: { w: number; h: number } | null) {
  if (!img?.w || !img?.h) return box;
  const scale = Math.min(box.w / img.w, box.h / img.h);
  const w = img.w * scale;
  const h = img.h * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

async function resolveImageDataUri(input: {
  src: { kind: "anthropic_file" | "url"; value: string; mime?: string };
  imageCache: Map<string, { mime: string; data: string; size: { w: number; h: number } | null }>;
}) {
  const cacheKey = `${input.src.kind}:${input.src.value}`;
  const cached = input.imageCache.get(cacheKey);
  if (cached) return cached;

  if (input.src.kind === "anthropic_file") {
    const fileId = input.src.value;
    const hintMime = String(input.src.mime ?? "").trim();
    const downloaded = await downloadFileFromAnthropic({ fileId });
    const mime = hintMime || downloaded.mime || "image/png";
    const bytes = new Uint8Array(downloaded.bytes);
    const data = dataUriFromBytes(bytes, mime);
    const resolved = { mime, data, size: imageSize(bytes, mime) };
    input.imageCache.set(cacheKey, resolved);
    return resolved;
  }

  const res = await fetch(input.src.value);
  if (!res.ok) throw new Error(`image url fetch failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const bytes = new Uint8Array(ab);
  const data = dataUriFromBytes(bytes, mime);
  const resolved = { mime, data, size: imageSize(bytes, mime) };
  input.imageCache.set(cacheKey, resolved);
  return resolved;
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
  const imageCache = new Map<string, { mime: string; data: string; size: { w: number; h: number } | null }>();

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: safeHex(s.bg, COLOR_BG) };

    for (const el of s.elements) {
      if (el.type === "sectionHeader") {
        const box = clampBox(el);
        const padX = 0.25;
        const titleH = Math.min(0.9, Math.max(0.55, box.h * 0.55));
        slide.addText(el.title, {
          x: box.x + padX,
          y: box.y,
          w: Math.max(0.5, box.w - padX * 2),
          h: titleH,
          ...(FONT ? { fontFace: FONT } : {}),
          fontSize: 38,
          bold: true,
          color: COLOR_FG,
          valign: "top",
        } as any);
        if (el.subtitle) {
          slide.addText(el.subtitle, {
            x: box.x + padX,
            y: box.y + titleH + 0.05,
            w: Math.max(0.5, box.w - padX * 2),
            h: Math.max(0.3, box.h - titleH - 0.05),
            ...(FONT ? { fontFace: FONT } : {}),
            fontSize: 18,
            color: COLOR_MUTED,
            valign: "top",
          } as any);
        }
        if (el.accent ?? true) {
          slide.addShape(pptx.ShapeType.line as any, {
            x: box.x + padX,
            y: box.y + box.h - 0.02,
            w: Math.max(0.6, Math.min(4.2, box.w - padX * 2)),
            h: 0,
            line: { color: COLOR_ACCENT, width: 3 },
          } as any);
        }
        continue;
      }

      if (el.type === "card") {
        const box = clampBox(el);
        const radius = el.radius != null ? clamp(el.radius, 0, 1.2) : 0.25;
        const fill = safeHex(el.bg, "111A33");
        const pad = 0.22;

        if (el.shadow ?? true) {
          slide.addShape(pptx.ShapeType.roundRect as any, {
            x: clamp(box.x + 0.06, 0, SLIDE_W_IN),
            y: clamp(box.y + 0.06, 0, SLIDE_H_IN),
            w: box.w,
            h: box.h,
            fill: { color: "000000", transparency: 85 },
            line: { color: "000000", transparency: 100 },
            radius,
          } as any);
        }

        slide.addShape(pptx.ShapeType.roundRect as any, {
          ...box,
          fill: { color: fill },
          line: { color: "2A355D", transparency: 55, width: 1 },
          radius,
        } as any);

        let cursorY = box.y + pad;
        const innerX = box.x + pad;
        const innerW = Math.max(MIN_SIZE_IN, box.w - pad * 2);

        if (el.image) {
          const imgH = Math.min(2.2, Math.max(1.2, box.h * 0.45));
          try {
            const img = await resolveImageDataUri({ src: el.image.src, imageCache });
            const imgBox = containPlacement({ x: innerX, y: cursorY, w: innerW, h: imgH }, img.size);
            slide.addImage({
              data: img.data,
              ...imgBox,
            } as any);
          } catch {
            slide.addShape(pptx.ShapeType.roundRect as any, {
              x: innerX,
              y: cursorY,
              w: innerW,
              h: imgH,
              fill: { color: "0B1020" },
              line: { color: "2A355D" },
              radius: 0.18,
            } as any);
          }
          cursorY += imgH + 0.15;
        }

        if (el.title) {
          slide.addText(el.title, {
            x: innerX,
            y: cursorY,
            w: innerW,
            h: 0.45,
            ...(FONT ? { fontFace: FONT } : {}),
            fontSize: 18,
            bold: true,
            color: COLOR_FG,
            valign: "top",
          } as any);
          cursorY += 0.48;
        }

        if (el.subtitle) {
          slide.addText(el.subtitle, {
            x: innerX,
            y: cursorY,
            w: innerW,
            h: 0.38,
            ...(FONT ? { fontFace: FONT } : {}),
            fontSize: 14,
            color: COLOR_MUTED,
            valign: "top",
          } as any);
          cursorY += 0.42;
        }

        if (el.bullets?.length) {
          const bullets = el.bullets.slice(0, 6).map((b) => `• ${b}`).join("\n");
          const remainingH = Math.max(0.6, box.y + box.h - cursorY - 0.55);
          const fs = estimateFittedFontSize({ text: bullets, wIn: innerW, hIn: remainingH, baseFontSize: 13 });
          slide.addText(bullets, {
            x: innerX,
            y: cursorY,
            w: innerW,
            h: remainingH,
            ...(FONT ? { fontFace: FONT } : {}),
            fontSize: fs,
            color: COLOR_MUTED,
            valign: "top",
            margin: 0.05,
            lineSpacingMultiple: 1.08,
          } as any);
        }

        if (el.footerRight) {
          slide.addText(el.footerRight, {
            x: innerX,
            y: box.y + box.h - 0.42,
            w: innerW,
            h: 0.34,
            ...(FONT ? { fontFace: FONT } : {}),
            fontSize: 14,
            bold: true,
            color: COLOR_ACCENT,
            align: "right",
            valign: "bottom",
          } as any);
        }

        continue;
      }

      if (el.type === "text") {
        const box = clampBox(el);
        const fontSize = estimateFittedFontSize({ text: el.text, wIn: box.w, hIn: box.h, baseFontSize: el.fontSize ?? 18 });
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
        const cached = await resolveImageDataUri({ src: el.src, imageCache });

        const imgBox = containPlacement(box, cached.size);
        if (el.fit === "contain" && box.w <= 2.5 && box.h <= 1.2) {
          slide.addShape(pptx.ShapeType.roundRect as any, {
            x: box.x - 0.08,
            y: box.y - 0.06,
            w: box.w + 0.16,
            h: box.h + 0.12,
            fill: { color: "FFFFFF", transparency: 6 },
            line: { color: "FFFFFF", transparency: 100 },
            radius: 0.12,
          } as any);
        }
        slide.addImage({
          data: cached.data,
          ...imgBox,
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

