import { google } from "googleapis";

const SLIDES_SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/drive",
];

type QuoteItem = {
  servicio: string;
  proveedor?: string | null;
  descripcion?: string | null;
  pax?: number | null;
  unitCur?: string | null;
  unit?: number | null;
  subtotal?: number | null;
  fotos?: string[];
};

type SlidesContext = {
  agencia?: {
    name?: string | null;
    assets?: Array<{ kind: string; blobUrl?: string | null; url?: string | null; mime?: string | null }>;
  } | null;
  evento: {
    nombre?: string | null;
    empresa?: string | null;
    locacion?: string | null;
    fecha?: string | null;
    pax?: number | null;
    currency?: string | null;
  };
  cotizacion: {
    items: QuoteItem[];
    total: number;
  };
};

type CatalogDeck = {
  title?: string | null;
  slides?: Array<{
    kind?: string;
    title?: string;
    subtitle?: string;
    bullets?: string[];
    description?: string;
    priceUsd?: number | null;
    supplier?: string | null;
    imageUrls?: string[];
  }>;
};

export class GoogleSlidesConfigError extends Error {
  constructor(message = "google_slides_not_configured") {
    super(message);
    this.name = "GoogleSlidesConfigError";
  }
}

function parseServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(json);
  }
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return { client_email: clientEmail, private_key: privateKey };
  }
  return null;
}

function oauthEnv(name: string, fallback?: string) {
  return process.env[name]?.trim() || (fallback ? process.env[fallback]?.trim() : undefined) || "";
}

function parseOAuthCredentials() {
  const clientId = oauthEnv("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID");
  const clientSecret = oauthEnv("GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET");
  const refreshToken = oauthEnv("GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export function hasGoogleSlidesConfig() {
  return !!parseOAuthCredentials() || !!parseServiceAccount() || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

async function googleAuth() {
  const oauthCredentials = parseOAuthCredentials();
  if (oauthCredentials) {
    const oauth2 = new google.auth.OAuth2(oauthCredentials.clientId, oauthCredentials.clientSecret);
    oauth2.setCredentials({ refresh_token: oauthCredentials.refreshToken });
    return oauth2;
  }
  const credentials = parseServiceAccount();
  if (credentials) return new google.auth.GoogleAuth({ credentials, scopes: SLIDES_SCOPES });
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return new google.auth.GoogleAuth({ scopes: SLIDES_SCOPES });
  throw new GoogleSlidesConfigError();
}

function usd(cur: string | null | undefined, value: number) {
  const prefix = cur === "ARS" ? "$" : "USD";
  return `${prefix} ${Number(value ?? 0).toLocaleString("en-US")}`;
}

function publicImageUrl(url?: string | null) {
  const s = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(s)) return null;
  return s;
}

function logoUrl(ctx: SlidesContext) {
  const assets = ctx.agencia?.assets ?? [];
  const preferred =
    assets.find((a) => a.kind === "logo_wide" && (a.blobUrl || a.url)) ??
    assets.find((a) => a.kind === "logo_square" && (a.blobUrl || a.url));
  return publicImageUrl(preferred?.blobUrl) ?? publicImageUrl(preferred?.url);
}

function firstPublicPhoto(item: QuoteItem) {
  return (item.fotos ?? []).map(publicImageUrl).find(Boolean) ?? null;
}

function pt(n: number) {
  return { magnitude: n, unit: "PT" };
}

function emu(n: number) {
  return { magnitude: n, unit: "EMU" };
}

const W = 12192000;
const H = 6858000;
const GREEN = { red: 0.10, green: 0.23, blue: 0.10 };
const GOLD = { red: 0.78, green: 0.62, blue: 0.08 };
const CREAM = { red: 0.96, green: 0.94, blue: 0.90 };
const WHITE = { red: 1, green: 1, blue: 1 };
const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;

function solid(color: { red: number; green: number; blue: number }) {
  return { solidFill: { color: { rgbColor: color } } };
}

function rgb(hex: unknown, fallback: { red: number; green: number; blue: number }) {
  const s = String(hex ?? "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return fallback;
  return {
    red: parseInt(s.slice(0, 2), 16) / 255,
    green: parseInt(s.slice(2, 4), 16) / 255,
    blue: parseInt(s.slice(4, 6), 16) / 255,
  };
}

function inToEmu(value: unknown) {
  const n = Number(value);
  return emu((Number.isFinite(n) ? n : 0) * 914400);
}

function clamp(n: unknown, min: number, max: number) {
  const value = Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function box(el: any) {
  const x = clamp(el?.x, 0, SLIDE_W_IN);
  const y = clamp(el?.y, 0, SLIDE_H_IN);
  const w = clamp(el?.w, 0.05, SLIDE_W_IN - x);
  const h = clamp(el?.h, 0.05, SLIDE_H_IN - y);
  return { x, y, w, h };
}

function createText(objectId: string, pageObjectId: string, text: string, x: number, y: number, w: number, h: number, opts: { size?: number; bold?: boolean; color?: any; font?: string; align?: "START" | "CENTER" | "END" } = {}) {
  const font = opts.font ?? "Georgia";
  const size = opts.size ?? 18;
  const color = opts.color ?? WHITE;
  return [
    {
      createShape: {
        objectId,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId,
          size: { width: emu(w), height: emu(h) },
          transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" },
        },
      },
    },
    { insertText: { objectId, text } },
    {
      updateTextStyle: {
        objectId,
        textRange: { type: "ALL" },
        style: {
          fontFamily: font,
          fontSize: pt(size),
          bold: opts.bold ?? false,
          foregroundColor: { opaqueColor: { rgbColor: color } },
        },
        fields: "fontFamily,fontSize,bold,foregroundColor",
      },
    },
    {
      updateParagraphStyle: {
        objectId,
        textRange: { type: "ALL" },
        style: { alignment: opts.align ?? "START" },
        fields: "alignment",
      },
    },
  ];
}

function createRect(objectId: string, pageObjectId: string, x: number, y: number, w: number, h: number, color: any) {
  return [
    {
      createShape: {
        objectId,
        shapeType: "RECTANGLE",
        elementProperties: {
          pageObjectId,
          size: { width: emu(w), height: emu(h) },
          transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" },
        },
      },
    },
    {
      updateShapeProperties: {
        objectId,
        shapeProperties: { shapeBackgroundFill: solid(color), outline: { propertyState: "NOT_RENDERED" } },
        fields: "shapeBackgroundFill,outline",
      },
    },
  ];
}

function createImage(objectId: string, pageObjectId: string, url: string, x: number, y: number, w: number, h: number) {
  return {
    createImage: {
      objectId,
      url,
      elementProperties: {
        pageObjectId,
        size: { width: emu(w), height: emu(h) },
        transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: "EMU" },
      },
    },
  };
}

function safeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function multiline(lines: Array<unknown>) {
  return lines.map(safeText).filter(Boolean).join("\n");
}

function slideObjectId(prefix: string, index: number) {
  return `${prefix}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

async function movePresentationToConfiguredFolder(auth: Awaited<ReturnType<typeof googleAuth>>, presentationId: string) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) return;
  const drive = google.drive({ version: "v3", auth });
  await drive.files.update({
    fileId: presentationId,
    addParents: folderId,
    fields: "id,parents",
  });
}

export async function createGoogleSlidesQuoteDeck(input: { context: SlidesContext; claudeDeck?: unknown }) {
  const ctx = input.context;
  const auth = await googleAuth();
  const slides = google.slides({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });
  const title = `${ctx.evento.nombre ?? "Cotizacion"} - ${ctx.evento.empresa ?? ""}`.trim();
  const created = await slides.presentations.create({ requestBody: { title } });
  const presentationId = created.data.presentationId;
  if (!presentationId) throw new Error("google_slides_create_failed");

  const presentation = await slides.presentations.get({ presentationId });
  const defaultSlideId = presentation.data.slides?.[0]?.objectId;
  const requests: any[] = [];
  if (defaultSlideId) requests.push({ deleteObject: { objectId: defaultSlideId } });

  const items = ctx.cotizacion.items ?? [];
  const cur = ctx.evento.currency ?? "USD";
  const logo = logoUrl(ctx);
  const firstPhoto = items.map(firstPublicPhoto).find(Boolean);
  const addSlide = (id: string, bg: any) => {
    requests.push({ createSlide: { objectId: id, slideLayoutReference: { predefinedLayout: "BLANK" } } });
    requests.push({
      updatePageProperties: {
        objectId: id,
        pageProperties: { pageBackgroundFill: solid(bg) },
        fields: "pageBackgroundFill",
      },
    });
  };

  const cover = slideObjectId("cover", 1);
  addSlide(cover, GREEN);
  requests.push(...createRect(`${cover}_top`, cover, 0, 0, W, 120000, GOLD));
  if (logo) requests.push(createImage(`${cover}_logo`, cover, logo, 360000, 260000, 1900000, 620000));
  if (firstPhoto) requests.push(createImage(`${cover}_photo`, cover, firstPhoto, 6800000, 650000, 5000000, 4300000));
  requests.push(...createText(`${cover}_title`, cover, String(ctx.evento.locacion ?? "Cotización").toUpperCase(), 650000, 1750000, firstPhoto ? 5600000 : 11000000, 1000000, { size: 44, bold: true, color: GOLD }));
  requests.push(...createText(`${cover}_sub`, cover, `${ctx.evento.empresa ?? ""} · ${ctx.evento.pax ?? "—"} PAX`, 680000, 3000000, 5200000, 420000, { size: 17, color: WHITE }));

  const overview = slideObjectId("overview", 2);
  addSlide(overview, CREAM);
  requests.push(...createRect(`${overview}_side`, overview, 0, 0, 3800000, H, GREEN));
  requests.push(...createText(`${overview}_title`, overview, "SERVICIOS\nCOTIZADOS", 340000, 1200000, 3000000, 1450000, { size: 34, bold: true, color: WHITE }));
  requests.push(...items.flatMap((it, idx) => {
    const y = 900000 + idx * 1050000;
    const subtotal = Number(it.subtotal ?? 0);
    return [
      ...createRect(`${overview}_card_${idx}`, overview, 4300000, y - 120000, 7200000, 800000, WHITE),
      ...createText(`${overview}_svc_${idx}`, overview, it.servicio, 4550000, y, 4600000, 300000, { size: 17, bold: true, color: GREEN }),
      ...createText(`${overview}_meta_${idx}`, overview, `${it.pax ?? ctx.evento.pax ?? "—"} pax · ${usd(it.unitCur ?? cur, subtotal)}`, 4550000, y + 390000, 4600000, 250000, { size: 11, color: GREEN }),
    ];
  }));

  items.forEach((it, idx) => {
    const slide = slideObjectId("service", idx + 3);
    addSlide(slide, GREEN);
    requests.push(...createRect(`${slide}_top`, slide, 0, 0, W, 120000, GOLD));
    const photo = firstPublicPhoto(it);
    if (photo) requests.push(createImage(`${slide}_photo`, slide, photo, 6650000, 830000, 5150000, 4200000));
    requests.push(...createText(`${slide}_title`, slide, it.servicio, 520000, 780000, 5500000, 1100000, { size: 36, bold: true, color: WHITE }));
    requests.push(...createText(`${slide}_meta`, slide, `${it.pax ?? ctx.evento.pax ?? "—"} PAX · ${it.unitCur ?? cur} ${Number(it.unit ?? 0).toLocaleString("en-US")} / pax`, 540000, 2200000, 5300000, 400000, { size: 16, color: { red: 0.78, green: 0.72, blue: 0.48 } }));
    if (it.descripcion) requests.push(...createText(`${slide}_desc`, slide, it.descripcion, 540000, 2900000, 5700000, 1400000, { size: 13, color: WHITE }));
    requests.push(...createRect(`${slide}_subtotal_box`, slide, 540000, 5250000, 5600000, 760000, GOLD));
    requests.push(...createText(`${slide}_subtotal`, slide, `SUBTOTAL ${usd(it.unitCur ?? cur, Number(it.subtotal ?? 0))}`, 720000, 5450000, 5200000, 330000, { size: 21, bold: true, color: GREEN }));
  });

  const summary = slideObjectId("summary", items.length + 3);
  addSlide(summary, CREAM);
  requests.push(...createText(`${summary}_title`, summary, "RESUMEN DE INVERSIÓN", 800000, 760000, 10600000, 720000, { size: 34, bold: true, color: GREEN, align: "CENTER" }));
  requests.push(...items.flatMap((it, idx) => createText(`${summary}_line_${idx}`, summary, `${it.servicio} · ${it.pax ?? ctx.evento.pax ?? "—"} pax · ${usd(it.unitCur ?? cur, Number(it.subtotal ?? 0))}`, 1100000, 2000000 + idx * 520000, 10200000, 320000, { size: 17, color: GREEN })));
  requests.push(...createText(`${summary}_total`, summary, `TOTAL ${usd(cur, ctx.cotizacion.total)}`, 1100000, 5100000, 10200000, 780000, { size: 38, bold: true, color: GREEN, align: "CENTER" }));

  await slides.presentations.batchUpdate({ presentationId, requestBody: { requests } });

  await movePresentationToConfiguredFolder(auth, presentationId);

  return {
    googlePresentationId: presentationId,
    presentationId,
    title,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

export async function createGoogleSlidesCatalogDeck(input: { deck: CatalogDeck }) {
  const auth = await googleAuth();
  const slidesApi = google.slides({ version: "v1", auth });
  const title = safeText(input.deck?.title) || "Slides";
  const created = await slidesApi.presentations.create({ requestBody: { title } });
  const presentationId = created.data.presentationId;
  if (!presentationId) throw new Error("google_slides_create_failed");

  const presentation = await slidesApi.presentations.get({ presentationId });
  const defaultSlideId = presentation.data.slides?.[0]?.objectId;
  const requests: any[] = [];
  if (defaultSlideId) requests.push({ deleteObject: { objectId: defaultSlideId } });

  const deckSlides = Array.isArray(input.deck?.slides) ? input.deck.slides : [];
  const sourceSlides = deckSlides.length ? deckSlides : [{ kind: "title", title }];
  sourceSlides.slice(0, 14).forEach((slide, idx) => {
    const pageId = slideObjectId("catalog", idx + 1);
    const isTitle = slide.kind === "title" || idx === 0;
    requests.push({ createSlide: { objectId: pageId, slideLayoutReference: { predefinedLayout: "BLANK" } } });
    requests.push({
      updatePageProperties: {
        objectId: pageId,
        pageProperties: { pageBackgroundFill: solid(isTitle ? GREEN : CREAM) },
        fields: "pageBackgroundFill",
      },
    });

    const fg = isTitle ? WHITE : GREEN;
    const accent = isTitle ? GOLD : GREEN;
    requests.push(...createText(`${pageId}_kicker`, pageId, `Pampa CRM · Slide ${idx + 1}`, 650000, 480000, 10600000, 300000, { size: 11, bold: true, color: accent }));
    requests.push(...createText(`${pageId}_title`, pageId, safeText(slide.title) || title, 650000, 980000, 11000000, isTitle ? 1150000 : 820000, { size: isTitle ? 42 : 31, bold: true, color: fg }));

    const meta = multiline([
      slide.subtitle,
      slide.supplier,
      slide.priceUsd != null ? `U$D ${slide.priceUsd}/pax` : "",
    ]);
    if (meta) requests.push(...createText(`${pageId}_meta`, pageId, meta, 680000, isTitle ? 2220000 : 1800000, 10300000, 520000, { size: 15, color: fg }));

    const body = multiline([
      slide.description,
      ...(slide.bullets ?? []).map((b) => `• ${b}`),
    ]);
    if (body) requests.push(...createText(`${pageId}_body`, pageId, body, 780000, isTitle ? 3100000 : 2520000, 6500000, 2850000, { size: 17, color: fg }));

    const photo = (slide.imageUrls ?? []).map(publicImageUrl).find(Boolean);
    if (photo) {
      requests.push(createImage(`${pageId}_image`, pageId, photo, 7800000, 2500000, 3800000, 2800000));
    } else if (!isTitle) {
      requests.push(...createRect(`${pageId}_bar`, pageId, 0, 0, 180000, H, GOLD));
    }
  });

  await slidesApi.presentations.batchUpdate({ presentationId, requestBody: { requests } });

  await movePresentationToConfiguredFolder(auth, presentationId);

  return {
    googlePresentationId: presentationId,
    presentationId,
    title,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

export async function createGoogleSlidesDeckV2(input: { deck: any }) {
  const auth = await googleAuth();
  const slidesApi = google.slides({ version: "v1", auth });
  const deck = input.deck ?? {};
  const title = safeText(deck.title) || "Slides";
  const created = await slidesApi.presentations.create({ requestBody: { title } });
  const presentationId = created.data.presentationId;
  if (!presentationId) throw new Error("google_slides_create_failed");

  const presentation = await slidesApi.presentations.get({ presentationId });
  const defaultSlideId = presentation.data.slides?.[0]?.objectId;
  const requests: any[] = [];
  if (defaultSlideId) requests.push({ deleteObject: { objectId: defaultSlideId } });

  const theme = deck.theme ?? {};
  const slides = Array.isArray(deck.slides) ? deck.slides.slice(0, 14) : [];
  slides.forEach((slide: any, idx: number) => {
    const pageId = slideObjectId("deckv2", idx + 1);
    requests.push({ createSlide: { objectId: pageId, slideLayoutReference: { predefinedLayout: "BLANK" } } });
    requests.push({
      updatePageProperties: {
        objectId: pageId,
        pageProperties: { pageBackgroundFill: solid(rgb(slide?.bg ?? theme.bg, GREEN)) },
        fields: "pageBackgroundFill",
      },
    });

    for (const el of Array.isArray(slide?.elements) ? slide.elements : []) {
      const id = slideObjectId(`${pageId}_${safeText(el?.type) || "el"}`, idx + 1);
      const b = box(el);
      if (el?.type === "text") {
        requests.push(...createText(id, pageId, safeText(el.text), b.x * 914400, b.y * 914400, b.w * 914400, b.h * 914400, {
          size: Number(el.fontSize ?? 18),
          bold: !!el.bold,
          color: rgb(el.color ?? theme.fg, WHITE),
          font: safeText(theme.font) || "Georgia",
          align: el.align === "center" ? "CENTER" : el.align === "right" ? "END" : "START",
        }));
      } else if (el?.type === "sectionHeader") {
        requests.push(...createText(id, pageId, multiline([el.title, el.subtitle]), b.x * 914400, b.y * 914400, b.w * 914400, b.h * 914400, {
          size: 32,
          bold: true,
          color: rgb(theme.fg, WHITE),
          font: safeText(theme.font) || "Georgia",
        }));
      } else if (el?.type === "shape") {
        const fill = rgb(el.fill ?? theme.accent, GOLD);
        requests.push({
          createShape: {
            objectId: id,
            shapeType: el.shape === "roundRect" ? "ROUND_RECTANGLE" : "RECTANGLE",
            elementProperties: {
              pageObjectId: pageId,
              size: { width: inToEmu(b.w), height: inToEmu(el.shape === "line" ? Math.max(Number(el.line?.width ?? 0.02), 0.02) : b.h) },
              transform: { scaleX: 1, scaleY: 1, translateX: b.x * 914400, translateY: b.y * 914400, unit: "EMU" },
            },
          },
        });
        requests.push({
          updateShapeProperties: {
            objectId: id,
            shapeProperties: { shapeBackgroundFill: solid(fill), outline: { propertyState: "NOT_RENDERED" } },
            fields: "shapeBackgroundFill,outline",
          },
        });
      } else if (el?.type === "image") {
        const url = el?.src?.kind === "url" ? publicImageUrl(el.src.value) : null;
        if (url) requests.push(createImage(id, pageId, url, b.x * 914400, b.y * 914400, b.w * 914400, b.h * 914400));
      } else if (el?.type === "card") {
        requests.push(...createRect(`${id}_bg`, pageId, b.x * 914400, b.y * 914400, b.w * 914400, b.h * 914400, rgb(el.bg ?? "FFFFFF", WHITE)));
        const cardText = multiline([el.title, el.subtitle, ...(el.bullets ?? []).map((bullet: string) => `• ${bullet}`), el.footerRight]);
        if (cardText) {
          requests.push(...createText(`${id}_text`, pageId, cardText, (b.x + 0.16) * 914400, (b.y + 0.16) * 914400, Math.max(b.w - 0.32, 0.1) * 914400, Math.max(b.h - 0.32, 0.1) * 914400, {
            size: 14,
            bold: true,
            color: rgb(theme.bg, GREEN),
            font: safeText(theme.font) || "Georgia",
          }));
        }
      }
    }
  });

  await slidesApi.presentations.batchUpdate({ presentationId, requestBody: { requests } });
  await movePresentationToConfiguredFolder(auth, presentationId);

  return {
    googlePresentationId: presentationId,
    presentationId,
    title,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

export async function createGoogleSlidesFromStoredDeck(input: { deck: any }) {
  if (input.deck?.version === 2 && Array.isArray(input.deck?.slides)) {
    return await createGoogleSlidesDeckV2(input);
  }
  return await createGoogleSlidesCatalogDeck({ deck: input.deck as CatalogDeck });
}

export async function exportGoogleSlidesPptx(presentationId: string) {
  const auth = await googleAuth();
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.export(
    { fileId: presentationId, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}
