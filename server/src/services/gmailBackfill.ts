import { prisma } from "../prisma.js";
import { google } from "googleapis";
import { env } from "../config.js";
import { decryptSecret } from "../google/crypto.js";

type Logger = { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void };

function parseAddressList(x: string | null | undefined) {
  if (!x) return [];
  return x
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /<([^>]+)>/.exec(s);
      return (m?.[1] ?? s).trim().toLowerCase();
    });
}

function looksLikeEmail(x: string) {
  const s = (x ?? "").trim().toLowerCase();
  return !!s && s.includes("@") && !s.includes(" ");
}

async function gmailClientForMailbox(mailboxId: string) {
  const mb = await prisma.googleMailbox.findUnique({ where: { id: mailboxId } });
  if (!mb || mb.deletedAt) return null;
  const tok = await prisma.googleMailboxToken.findFirst({
    where: { mailboxId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!tok) return null;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const redirectUri = env.GOOGLE_GMAIL_CALLBACK_URL ?? "http://localhost:8787/auth/google-gmail/callback";
  const oauth2 = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
  oauth2.setCredentials({ refresh_token: decryptSecret(tok.refreshTokenEnc) });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  return { gmail, mailbox: mb };
}

export async function listAllKnownCrmEmails(): Promise<string[]> {
  const [cts, pcs, evs] = await Promise.all([
    prisma.contacto.findMany({
      where: { deletedAt: null, email: { not: null } },
      select: { email: true },
      take: 20_000,
    }),
    prisma.proveedorContacto.findMany({
      where: { deletedAt: null, email: { not: null } },
      select: { email: true },
      take: 20_000,
    }),
    prisma.evento.findMany({
      where: { deletedAt: null, contactoRef: { not: null } },
      select: { contactoRef: true },
      take: 20_000,
    }),
  ]);

  const set = new Set<string>();
  for (const x of cts) {
    const e = String(x.email ?? "").trim().toLowerCase();
    if (looksLikeEmail(e)) set.add(e);
  }
  for (const x of pcs) {
    const e = String(x.email ?? "").trim().toLowerCase();
    if (looksLikeEmail(e)) set.add(e);
  }
  for (const x of evs) {
    const e = String(x.contactoRef ?? "").trim().toLowerCase();
    if (looksLikeEmail(e)) set.add(e);
  }
  return Array.from(set);
}

async function ingestMessageIfMatchesEmail(gmail: any, mailboxId: string, gmailId: string, targetEmail: string) {
  const full = await gmail.users.messages.get({
    userId: "me",
    id: gmailId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
  });

  const headers = new Map<string, string>(
    (full.data.payload?.headers ?? []).map((h: any) => [String(h.name ?? "").toLowerCase(), String(h.value ?? "")]),
  );
  const fromEmail = parseAddressList(headers.get("from") ?? null)[0] ?? null;
  const to = [...parseAddressList(headers.get("to") ?? null), ...parseAddressList(headers.get("cc") ?? null)];

  const target = targetEmail.trim().toLowerCase();
  const fromOk = fromEmail ? fromEmail.trim().toLowerCase() === target : false;
  const toOk = to.some((x) => x.trim().toLowerCase() === target);
  if (!fromOk && !toOk) return false;

  await prisma.gmailMessage.upsert({
    where: { mailboxId_gmailId: { mailboxId, gmailId } },
    update: {
      threadId: full.data.threadId ?? null,
      fromEmail,
      toEmails: to.length ? JSON.stringify(to) : null,
      subject: headers.get("subject") ?? null,
      snippet: full.data.snippet ?? null,
      internalAt: full.data.internalDate ? new Date(Number(full.data.internalDate)) : null,
    },
    create: {
      mailboxId,
      gmailId,
      threadId: full.data.threadId ?? null,
      fromEmail,
      toEmails: to.length ? JSON.stringify(to) : null,
      subject: headers.get("subject") ?? null,
      snippet: full.data.snippet ?? null,
      internalAt: full.data.internalDate ? new Date(Number(full.data.internalDate)) : null,
    },
  });
  return true;
}

async function backfillMailboxForEmail(
  mailboxId: string,
  email: string,
  opts: { days?: number; maxScanned?: number; maxStored?: number } = {},
  log?: Logger,
) {
  const c = await gmailClientForMailbox(mailboxId);
  if (!c) return { ok: false, scanned: 0, stored: 0 };

  const days = Number(opts.days ?? 365);
  const maxScanned = Number(opts.maxScanned ?? 400);
  const maxStored = Number(opts.maxStored ?? 120);

  const target = email.trim().toLowerCase();
  const q = `newer_than:${days}d (from:${target} OR to:${target} OR cc:${target})`;

  let scanned = 0;
  let stored = 0;
  let pageToken: string | undefined = undefined;

  while (scanned < maxScanned && stored < maxStored) {
    const list = await c.gmail.users.messages.list({
      userId: "me",
      maxResults: Math.min(100, maxScanned - scanned),
      q,
      pageToken,
    });
    const ids = (list.data.messages ?? []).map((m: any) => m.id).filter(Boolean) as string[];
    scanned += ids.length;

    for (const id of ids) {
      const ok = await ingestMessageIfMatchesEmail(c.gmail, c.mailbox.id, id, target);
      if (ok) stored++;
      if (stored >= maxStored) break;
    }

    pageToken = list.data.nextPageToken ?? undefined;
    if (!pageToken || ids.length === 0) break;
  }

  try {
    await prisma.googleMailbox.update({
      where: { id: mailboxId },
      data: { lastSyncAt: new Date() },
    });
  } catch {
    // ignore
  }

  try {
    log?.info?.({ mailboxId, scanned, stored, emailDomain: target.split("@")[1] ?? null }, "gmail backfill finished");
  } catch {
    // ignore
  }

  return { ok: true, scanned, stored };
}

export function triggerBackfillAllForMailbox(mailboxId: string, log?: Logger) {
  void (async () => {
    try {
      const emails = await listAllKnownCrmEmails();
      const maxEmails = 250;
      const slice = emails.slice(0, maxEmails);
      for (const e of slice) {
        await backfillMailboxForEmail(mailboxId, e, { days: 365, maxScanned: 200, maxStored: 50 }, log);
      }
    } catch (e) {
      try {
        log?.warn?.({ err: e, mailboxId }, "gmail backfill-all failed");
      } catch {
        // ignore
      }
    }
  })();
}

export function triggerBackfillForEmailAcrossMailboxes(email: string, log?: Logger) {
  const target = (email ?? "").trim().toLowerCase();
  if (!looksLikeEmail(target)) return;

  void (async () => {
    try {
      const mailboxes = await prisma.googleMailbox.findMany({
        where: { deletedAt: null },
        select: { id: true },
        take: 50,
      });
      for (const mb of mailboxes) {
        await backfillMailboxForEmail(mb.id, target, { days: 365, maxScanned: 400, maxStored: 120 }, log);
      }
    } catch (e) {
      try {
        log?.warn?.({ err: e, emailDomain: target.split("@")[1] ?? null }, "gmail backfill-by-email failed");
      } catch {
        // ignore
      }
    }
  })();
}

