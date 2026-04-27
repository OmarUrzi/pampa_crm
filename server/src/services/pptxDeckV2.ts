// Deck v2: layout spec that Claude controls (positions/styles).
// Renderer executes the spec using PptxGenJS.
import pptxgen from "pptxgenjs";
import { z } from "zod";

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

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: safeHex(s.bg, COLOR_BG) };

    for (const el of s.elements) {
      if (el.type === "text") {
        slide.addText(el.text, {
          x: el.x,
          y: el.y,
          w: el.w,
          h: el.h,
          fontFace: FONT,
          fontSize: el.fontSize ?? 18,
          bold: el.bold ?? false,
          italic: el.italic ?? false,
          color: safeHex(el.color, COLOR_FG),
          align: el.align ?? "left",
          valign: el.valign ?? "top",
          // PptxGenJS supports shrink-to-fit via `fit` on some versions; keep as any.
          ...(el.fit ? { fit: "shrink" } : {}),
        } as any);
        continue;
      }

      if (el.type === "shape") {
        const shapeType =
          el.shape === "rect"
            ? (pptx.ShapeType.rect as any)
            : el.shape === "roundRect"
              ? (pptx.ShapeType.roundRect as any)
              : (pptx.ShapeType.line as any);
        slide.addShape(shapeType, {
          x: el.x,
          y: el.y,
          w: el.w,
          h: el.h,
          fill: el.fill ? { color: safeHex(el.fill, COLOR_ACCENT) } : undefined,
          line: el.line
            ? {
                color: el.line.color ? safeHex(el.line.color, COLOR_ACCENT) : safeHex(COLOR_ACCENT, COLOR_ACCENT),
                width: el.line.width ?? 1,
              }
            : undefined,
          radius: el.radius,
        } as any);
        continue;
      }

      // image: for now, we don't embed (needs fetching bytes + data URIs).
      // We render a placeholder so layout can be validated end-to-end first.
      slide.addShape(pptx.ShapeType.roundRect as any, {
        x: el.x,
        y: el.y,
        w: el.w,
        h: el.h,
        fill: { color: "111A33" },
        line: { color: "2A355D" },
        radius: 0.2,
      } as any);
      slide.addText("IMG", { x: el.x, y: el.y + el.h / 2 - 0.2, w: el.w, h: 0.4, color: COLOR_MUTED, align: "center" } as any);
    }
  }

  return (await pptx.write({ outputType: "nodebuffer" } as any)) as Buffer;
}

