import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireRole, requireWriteAccess } from "../auth/roleGuards.js";
import { google } from "googleapis";
import { env } from "../config.js";
import { decryptSecret } from "../google/crypto.js";
import { triggerBackfillAllForMailbox, triggerBackfillForEmailAcrossMailboxes } from "../services/gmailBackfill.js";

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

async function loadRelevantEmailsSet() {
  const [cts, pcs, evRefs] = await Promise.all([
    prisma.contacto.findMany({
      where: { deletedAt: null, email: { not: null } },
      select: { email: true },
      take: 10_000,
    }),
    prisma.proveedorContacto.findMany({
      where: { deletedAt: null, email: { not: null } },
      select: { email: true },
      take: 10_000,
    }),
    prisma.evento.findMany({
      where: { deletedAt: null, contactoRef: { contains: "@" } },
      select: { contactoRef: true },
      take: 5000,
    }),
  ]);
  const set = new Set<string>();
  for (const x of cts) {
    const e = String(x.email ?? "").trim().toLowerCase();
    if (e) set.add(e);
  }
  for (const x of pcs) {
    const e = String(x.email ?? "").trim().toLowerCase();
    if (e) set.add(e);
  }
  for (const x of evRefs) {
    const e = String(x.contactoRef ?? "").trim().toLowerCase();
    if (e && e.includes("@")) set.add(e);
  }
  return set;
}

function shouldStoreMessage(relevant: Set<string>, fromEmail: string | null, toEmails: string[]) {
  // If we have no CRM emails at all, store nothing to avoid DB spam.
  if (!relevant.size) return false;
  const from = (fromEmail ?? "").trim().toLowerCase();
  if (from && relevant.has(from)) return true;
  for (const t of toEmails) {
    const e = (t ?? "").trim().toLowerCase();
    if (e && relevant.has(e)) return true;
  }
  return false;
}

async function pruneOldMessages() {
  const days = Number(env.GMAIL_RETENTION_DAYS ?? 10);
  const keepDays = Number.isFinite(days) && days > 0 ? days : 10;
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  await prisma.gmailMessage.deleteMany({
    where: {
      OR: [{ internalAt: { lt: cutoff } }, { internalAt: null, createdAt: { lt: cutoff } }],
    },
  });
}

async function ingestMessage(gmail: any, mailboxId: string, gmailId: string, relevant: Set<string>) {
  const full = await gmail.users.messages.get({
    userId: "me",
    id: gmailId,
    format: "metadata",
    metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
  });
  const headers = new Map<string, string>(
    (full.data.payload?.headers ?? []).map((h: any) => [
      String(h.name ?? "").toLowerCase(),
      String(h.value ?? ""),
    ]),
  );
  const fromRaw = headers.get("from") ?? null;
  const fromEmail = parseAddressList(fromRaw)[0] ?? null;
  const to = [
    ...parseAddressList(headers.get("to") ?? null),
    ...parseAddressList(headers.get("cc") ?? null),
  ];

  if (!shouldStoreMessage(relevant, fromEmail, to)) return false;

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

function decodePubsubMessage(req: any): { emailAddress?: string; historyId?: string } | null {
  const dataB64 = req?.body?.message?.data;
  if (!dataB64 || typeof dataB64 !== "string") return null;
  try {
    const json = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8")) as {
      emailAddress?: string;
      historyId?: number | string;
    };
    return { emailAddress: json.emailAddress, historyId: json.historyId ? String(json.historyId) : undefined };
  } catch {
    return null;
  }
}

function parseAddressList(x: string | null | undefined) {
  if (!x) return [];
  // very simple parsing: split by comma and extract emails inside <>
  return x
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /<([^>]+)>/.exec(s);
      return (m?.[1] ?? s).trim().toLowerCase();
    });
}

export async function registerMailboxRoutes(app: FastifyInstance) {
  app.get("/mailboxes", { preHandler: [jwtVerifyGuard, requireRole(["admin"])] }, async () => {
    const mailboxes = await prisma.googleMailbox.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, lastHistoryId: true, lastSyncAt: true, createdAt: true, updatedAt: true },
    });
    return { mailboxes };
  });

  app.post(
    "/mailboxes/:id/backfill-all",
    { preHandler: [jwtVerifyGuard, requireRole(["admin"])] },
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const mb = await prisma.googleMailbox.findUnique({ where: { id } });
      if (!mb || mb.deletedAt) return reply.code(404).send({ error: "not_found" });
      triggerBackfillAllForMailbox(id, app.log);
      return reply.send({ ok: true, queued: true });
    },
  );

  app.post(
    "/mailboxes/backfill",
    { preHandler: [jwtVerifyGuard, requireRole(["admin"])] },
    async (req, reply) => {
      const email = String((req.body as any)?.email ?? "").trim().toLowerCase();
      if (!email) return reply.code(400).send({ error: "email_required" });
      triggerBackfillForEmailAcrossMailboxes(email, app.log);
      return reply.send({ ok: true, queued: true });
    },
  );

  app.post(
    "/mailboxes/:id/sync",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const c = await gmailClientForMailbox(id);
      if (!c) return reply.code(404).send({ error: "not_found" });

      const list = await c.gmail.users.messages.list({ userId: "me", maxResults: 25, q: "newer_than:30d" });
      const ids = (list.data.messages ?? []).map((m: any) => m.id).filter(Boolean) as string[];

      const relevant = await loadRelevantEmailsSet();
      let upserted = 0;
      for (const gmailId of ids) {
        const stored = await ingestMessage(c.gmail, c.mailbox.id, gmailId, relevant);
        if (stored) upserted++;
      }

      try {
        const prof = await c.gmail.users.getProfile({ userId: "me" });
        const hid = prof.data.historyId ? String(prof.data.historyId) : null;
        await prisma.googleMailbox.update({
          where: { id: c.mailbox.id },
          data: { lastHistoryId: hid, lastSyncAt: new Date() },
        });
      } catch {
        // ignore
      }
      try {
        await pruneOldMessages();
      } catch {
        // ignore
      }
      return { ok: true, upserted, scanned: ids.length };
    },
  );

  // Pub/Sub push endpoint (no auth). We keep it "ok" always to avoid retries storms.
  app.post("/mailboxes/google/push", async (req, reply) => {
    const msg = decodePubsubMessage(req);
    const email = (msg?.emailAddress ?? "").toLowerCase();
    if (!email) return reply.send({ ok: true });
    const mailbox = await prisma.googleMailbox.findUnique({ where: { email } });
    if (!mailbox || mailbox.deletedAt) return reply.send({ ok: true });
    const c = await gmailClientForMailbox(mailbox.id);
    if (!c) return reply.send({ ok: true });

      const startHistoryId = mailbox.lastHistoryId ?? undefined;
    if (!startHistoryId) return reply.send({ ok: true });

    try {
      const relevant = await loadRelevantEmailsSet();
      let h: any;
      try {
        h = await c.gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
          maxResults: 50,
        });
      } catch (e: any) {
        // If history is too old/invalid, fall back to a small recent sync.
        const msg = String(e?.message ?? "");
        const code = Number(e?.code ?? 0);
        const isHistoryInvalid = code === 404 || /startHistoryId/i.test(msg) || /history/i.test(msg);
        if (!isHistoryInvalid) throw e;
        const list = await c.gmail.users.messages.list({ userId: "me", maxResults: 25, q: "newer_than:10d" });
        const ids = (list.data.messages ?? []).map((m: any) => m.id).filter(Boolean) as string[];
        for (const id of ids) {
          await ingestMessage(c.gmail, mailbox.id, id, relevant);
        }
        const prof = await c.gmail.users.getProfile({ userId: "me" });
        const hid = prof.data.historyId ? String(prof.data.historyId) : null;
        await prisma.googleMailbox.update({
          where: { id: mailbox.id },
          data: { lastHistoryId: hid, lastSyncAt: new Date() },
        });
        return reply.send({ ok: true });
      }
      const added = new Set<string>();
      for (const it of h.data.history ?? []) {
        for (const m of it.messagesAdded ?? []) {
          const id = m.message?.id;
          if (id) added.add(id);
        }
      }
      for (const id of Array.from(added)) {
        await ingestMessage(c.gmail, mailbox.id, id, relevant);
      }
      const nextHistoryId =
        (h.data.historyId ? String(h.data.historyId) : null) ?? (msg?.historyId ?? null);
      await prisma.googleMailbox.update({
        where: { id: mailbox.id },
        data: { lastHistoryId: nextHistoryId, lastSyncAt: new Date() },
      });
    } catch {
      // ignore (we don't want Pub/Sub retry storms)
    }

    try {
      await pruneOldMessages();
    } catch {
      // ignore
    }
    return reply.send({ ok: true });
  });

  app.get(
    "/mailboxes/comms",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req) => {
      const email = String((req.query as any)?.email ?? "").trim().toLowerCase();
      if (!email) return { messages: [] };
      const messages = await prisma.gmailMessage.findMany({
        where: { OR: [{ fromEmail: email }, { toEmails: { contains: email } }] },
        orderBy: [{ internalAt: "desc" }, { createdAt: "desc" }],
        take: 50,
        include: { mailbox: { select: { email: true } } },
      });
      return {
        messages: messages.map((m) => ({
          id: m.id,
          mailbox: m.mailbox.email,
          fromEmail: m.fromEmail,
          toEmails: m.toEmails ? (JSON.parse(m.toEmails) as string[]) : [],
          subject: m.subject,
          snippet: m.snippet,
          at: m.internalAt ?? m.createdAt,
        })),
      };
    },
  );
}

