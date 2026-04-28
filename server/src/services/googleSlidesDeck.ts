import { google } from "googleapis";

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

export function hasGoogleSlidesConfig() {
  return !!parseServiceAccount() || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

async function googleAuth() {
  const scopes = [
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
  ];
  const credentials = parseServiceAccount();
  if (credentials) return new google.auth.GoogleAuth({ credentials, scopes });
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return new google.auth.GoogleAuth({ scopes });
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

function solid(color: { red: number; green: number; blue: number }) {
  return { solidFill: { color: { rgbColor: color } } };
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

function slideObjectId(prefix: string, index: number) {
  return `${prefix}_${index}_${Math.random().toString(36).slice(2, 8)}`;
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

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (folderId) {
    await drive.files.update({
      fileId: presentationId,
      addParents: folderId,
      fields: "id,parents",
    });
  }

  return {
    googlePresentationId: presentationId,
    presentationId,
    title,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
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
