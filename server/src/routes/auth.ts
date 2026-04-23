import type { FastifyInstance } from "fastify";
import oauthPlugin from "@fastify/oauth2";
import crypto from "node:crypto";
import { allowedEmails, env } from "../config.js";
import { prisma } from "../prisma.js";
import { google } from "googleapis";
import { encryptSecret } from "../google/crypto.js";

const REFRESH_COOKIE = "pampa-crm:refresh";

function cookieOpts() {
  const prod = (env.NODE_ENV ?? "development") === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: prod,
    path: "/auth",
  };
}

function sha256(x: string) {
  return crypto.createHash("sha256").update(x).digest("hex");
}

async function issueRefreshToken(reply: any, userId: string) {
  const raw = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30d
  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  reply.setCookie(REFRESH_COOKIE, raw, cookieOpts());
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/auth/session", async (req) => {
    try {
      await req.jwtVerify();
      const u = req.user as { email?: string; name?: string; role?: string };
      const db = u.email ? await prisma.appUser.findUnique({ where: { email: u.email } }) : null;
      if (u.email && (!db || db.deletedAt)) return { user: null };
      return {
        user: {
          id: db?.id ?? null,
          email: u.email,
          name: u.name ?? db?.name ?? null,
          role: (db as any)?.role ?? u.role ?? "user",
        },
      };
    } catch {
      return { user: null };
    }
  });

  app.post("/auth/refresh", async (req, reply) => {
    const raw = (req.cookies as any)?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) return reply.code(401).send({ error: "no_refresh" });
    const tokenHash = sha256(raw);
    const rt = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!rt || rt.revokedAt || rt.expiresAt.getTime() <= Date.now()) {
      return reply.code(401).send({ error: "refresh_invalid" });
    }
    const user = await prisma.appUser.findUnique({ where: { id: rt.userId } });
    if (!user || user.deletedAt) return reply.code(401).send({ error: "refresh_user_invalid" });

    // rotate
    await prisma.refreshToken.update({
      where: { id: rt.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    await issueRefreshToken(reply, user.id);

    const access = await reply.jwtSign(
      { email: user.email, name: user.name ?? undefined, role: (user as any).role ?? "user" },
      { expiresIn: env.JWT_EXPIRES_IN ?? "15m" },
    );
    return reply.send({ token: access });
  });

  app.post("/auth/logout", async (_req, reply) => {
    // best-effort revoke current refresh token if present
    try {
      const raw = (_req.cookies as any)?.[REFRESH_COOKIE] as string | undefined;
      if (raw) {
        const tokenHash = sha256(raw);
        await prisma.refreshToken.updateMany({
          where: { tokenHash, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // ignore
    }
    reply.clearCookie(REFRESH_COOKIE, cookieOpts());
    return reply.send({ ok: true });
  });

  // Modo dev sin Google configurado: permite "login" por email si está permitido.
  app.post("/auth/dev-login", async (req, reply) => {
    const body = req.body as { email?: string; name?: string; expiresIn?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) return reply.code(400).send({ error: "email_required" });
    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      return reply.code(403).send({ error: "email_not_allowed" });
    }

    const u = await prisma.appUser.upsert({
      where: { email },
      update: { name: body.name ?? null },
      create: { email, name: body.name ?? null },
    });

    const expiresIn =
      (env.NODE_ENV ?? "development") !== "production" && body.expiresIn ? body.expiresIn : env.JWT_EXPIRES_IN ?? "7d";

    const token = await reply.jwtSign(
      { email, name: u.name ?? undefined, role: (u as any).role ?? "user" },
      { expiresIn },
    );
    await issueRefreshToken(reply, u.id);
    return { token };
  });

  // Connect a shared mailbox (info@, support@, etc.) via Gmail read-only scope.
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    app.get("/auth/google-gmail", async (_req, reply) => {
      const redirectUri = env.GOOGLE_GMAIL_CALLBACK_URL ?? "http://localhost:8787/auth/google-gmail/callback";
      const oauth2 = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
      const url = oauth2.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/gmail.readonly", "email"],
      });
      return reply.redirect(url, 302);
    });

    app.get("/auth/google-gmail/callback", async (req, reply) => {
      const code = (req.query as any)?.code as string | undefined;
      if (!code) return reply.code(400).send({ error: "missing_code" });
      const redirectUri = env.GOOGLE_GMAIL_CALLBACK_URL ?? "http://localhost:8787/auth/google-gmail/callback";
      const oauth2 = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
      const { tokens } = await oauth2.getToken(code);
      if (!tokens.refresh_token) return reply.code(400).send({ error: "missing_refresh_token" });

      oauth2.setCredentials(tokens);
      const gmail = google.gmail({ version: "v1", auth: oauth2 });
      const me = await gmail.users.getProfile({ userId: "me" });
      const email = (me.data.emailAddress ?? "").toLowerCase();
      if (!email) return reply.code(400).send({ error: "gmail_no_email" });

      const mailbox = await prisma.googleMailbox.upsert({
        where: { email },
        update: { deletedAt: null },
        create: { email, provider: "google" },
      });
      await prisma.googleMailboxToken.updateMany({
        where: { mailboxId: mailbox.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.googleMailboxToken.create({
        data: {
          mailboxId: mailbox.id,
          refreshTokenEnc: encryptSecret(tokens.refresh_token),
          scope: tokens.scope ?? null,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      });

      const fe = env.FRONTEND_URL ?? "http://localhost:5173";
      return reply.redirect(`${fe.replace(/\/$/, "")}/admin/mailboxes?connected=1`, 302);
    });
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    app.log.warn("Google OAuth not configured; dev-login enabled.");
    app.get("/auth/google", async (_req, reply) => {
      return reply.code(501).send({ error: "oauth_not_configured" });
    });
    return;
  }

  await app.register(oauthPlugin, {
    name: "googleOAuth2",
    scope: ["profile", "email"],
    credentials: {
      client: {
        id: env.GOOGLE_CLIENT_ID,
        secret: env.GOOGLE_CLIENT_SECRET,
      },
      // fastify-oauth2 typings differ by version; keep runtime-compatible fallback.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      auth:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((oauthPlugin as any).GOOGLE_CONFIGURATION as any) ?? {
          authorizeHost: "https://accounts.google.com",
          authorizePath: "/o/oauth2/v2/auth",
          tokenHost: "https://oauth2.googleapis.com",
          tokenPath: "/token",
        },
    },
    startRedirectPath: "/auth/google",
    callbackUri: env.GOOGLE_CALLBACK_URL,
  });

  app.get("/auth/google/callback", async (req, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = await (app as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(req);
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.token.access_token}` },
    });
    const profile = (await res.json()) as { email?: string; name?: string };
    const email = (profile.email ?? "").toLowerCase();
    if (!email) return reply.code(400).send({ error: "google_no_email" });
    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      return reply.code(403).send({ error: "email_not_allowed" });
    }

    await prisma.appUser.upsert({
      where: { email },
      update: { name: profile.name ?? null },
      create: { email, name: profile.name ?? null },
    });

    const u = await prisma.appUser.findUnique({ where: { email } });
    const jwtToken = await reply.jwtSign(
      {
        email,
        name: u?.name ?? profile.name ?? undefined,
        role: (u as any)?.role ?? "user",
      },
      { expiresIn: env.JWT_EXPIRES_IN ?? "7d" },
    );
    if (u?.id) await issueRefreshToken(reply, u.id);
    const fe = env.FRONTEND_URL ?? "http://localhost:5173";
    const redirectUrl = `${fe.replace(/\/$/, "")}/auth/callback#token=${encodeURIComponent(jwtToken)}`;
    return reply.redirect(redirectUrl, 302);
  });
}

