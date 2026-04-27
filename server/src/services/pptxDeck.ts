// pptxgenjs has CJS-style exports; in ESM/NodeNext the default import typing may be weird.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import pptxgen from "pptxgenjs";

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
    | { kind: "activity"; title: string; description?: string; priceUsd?: number | null; supplier?: string | null; imageUrls?: string[] }
    | { kind: "closing"; title: string; bullets?: string[] }
  >;
};

function safeText(x: unknown) {
  return String(x ?? "").replace(/\s+/g, " ").trim();
}

export async function deckToPptxBuffer(deckJson: unknown) {
  const deck = deckJson as EventoDeck;
  // If this deck is already a V2 layout spec, render with the V2 renderer.
  // This keeps backwards-compat for older decks.
  if ((deck as any)?.version === 2 && Array.isArray((deck as any)?.slides)) {
    const { deckV2ToPptxBuffer } = await import("./pptxDeckV2.js");
    return await deckV2ToPptxBuffer(deckJson as any);
  }

  const PptxGenJS: any = (pptxgen as any)?.default ?? (pptxgen as any);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Pampa CRM";
  pptx.company = "Pampa CRM";
  pptx.subject = "Cotización";
  pptx.title = safeText(deck?.title || "Slides");

  // Theme-ish defaults
  const COLOR_BG = "0B1020";
  const COLOR_FG = "FFFFFF";
  const COLOR_MUTED = "B6C2E2";
  const COLOR_ACCENT = "7C5CFF";

  const addTitleTop = (slide: any, kicker: string, title: string, subtitle?: string) => {
    slide.background = { color: COLOR_BG };
    slide.addText(safeText(kicker), {
      x: 0.6,
      y: 0.45,
      w: 12.0,
      h: 0.3,
      fontSize: 12,
      color: COLOR_MUTED,
      bold: true,
      letterSpacing: 1,
    } as any);
    slide.addText(safeText(title), {
      x: 0.6,
      y: 1.0,
      w: 12.0,
      h: 1.0,
      fontSize: 36,
      color: COLOR_FG,
      bold: true,
    } as any);
    if (subtitle) {
      slide.addText(safeText(subtitle), {
        x: 0.6,
        y: 2.05,
        w: 12.0,
        h: 0.8,
        fontSize: 18,
        color: COLOR_MUTED,
      } as any);
    }
    // subtle accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.6,
      y: 3.0,
      w: 1.6,
      h: 0.12,
      fill: { color: COLOR_ACCENT },
      line: { color: COLOR_ACCENT },
    } as any);
  };

  const addBullets = (slide: any, bullets: string[], opts: { x: number; y: number; w: number; h: number }) => {
    const lines = bullets.map((b) => `• ${safeText(b)}`).join("\n");
    slide.addText(lines, {
      ...opts,
      fontSize: 18,
      color: COLOR_FG,
      valign: "top",
    } as any);
  };

  const slides = Array.isArray(deck?.slides) ? deck.slides : [];
  slides.forEach((s, idx) => {
    const slide = pptx.addSlide();
    const n = idx + 1;

    if (s.kind === "title") {
      addTitleTop(slide, `Pampa CRM · Slide ${n}`, s.title, s.subtitle);
      return;
    }

    if (s.kind === "section") {
      slide.background = { color: COLOR_BG };
      slide.addText(safeText(s.title), { x: 0.6, y: 0.6, w: 12.0, h: 0.8, fontSize: 30, color: COLOR_FG, bold: true } as any);
      if (s.bullets?.length) addBullets(slide, s.bullets, { x: 0.9, y: 1.7, w: 12.0, h: 5.2 });
      return;
    }

    if (s.kind === "quote_item" || s.kind === "activity") {
      slide.background = { color: COLOR_BG };
      slide.addText(safeText(s.title), { x: 0.6, y: 0.6, w: 12.0, h: 0.7, fontSize: 26, color: COLOR_FG, bold: true } as any);
      const meta: string[] = [];
      if ((s as any).supplier) meta.push(safeText((s as any).supplier));
      if ((s as any).priceLabel) meta.push(safeText((s as any).priceLabel));
      if ((s as any).priceUsd != null) meta.push(`U$D ${safeText((s as any).priceUsd)}/pax`);
      if (meta.length) {
        slide.addText(meta.join(" · "), { x: 0.6, y: 1.35, w: 12.0, h: 0.4, fontSize: 14, color: COLOR_MUTED } as any);
      }

      const bullets = (s as any).bullets as string[] | undefined;
      const desc = (s as any).description as string | undefined;
      const bodyLines: string[] = [];
      if (desc) bodyLines.push(safeText(desc));
      if (bullets?.length) bodyLines.push(...bullets.map((b) => `• ${safeText(b)}`));
      if (bodyLines.length) {
        slide.addText(bodyLines.join("\n"), {
          x: 0.6,
          y: 2.0,
          w: 7.0,
          h: 5.0,
          fontSize: 16,
          color: COLOR_FG,
          valign: "top",
        } as any);
      }

      // Images: PptxGenJS needs file paths/data URIs. We skip URLs for now (server would need to fetch and embed).
      // Keeping layout space for future enhancement.
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 8.0,
        y: 2.0,
        w: 4.6,
        h: 3.2,
        fill: { color: "111A33" },
        line: { color: "2A355D" },
        radius: 0.2,
      } as any);
      slide.addText("Imagen", { x: 8.0, y: 3.35, w: 4.6, h: 0.6, fontSize: 14, color: COLOR_MUTED, align: "center" } as any);
      return;
    }

    // closing/default
    slide.background = { color: COLOR_BG };
    slide.addText(safeText((s as any).title ?? "Cierre"), { x: 0.6, y: 0.6, w: 12.0, h: 0.8, fontSize: 30, color: COLOR_FG, bold: true } as any);
    const bullets = ((s as any).bullets ?? []) as string[];
    if (bullets.length) addBullets(slide, bullets, { x: 0.9, y: 1.7, w: 12.0, h: 5.2 });
  });

  // PptxGenJS: write as Buffer for Fastify reply
  const out = (await pptx.write({ outputType: "nodebuffer" } as any)) as Buffer;
  return out;
}

