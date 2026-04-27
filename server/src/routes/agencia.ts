import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireRole } from "../auth/roleGuards.js";
import { auditLog } from "../audit.js";
import { jwtVerifyHeaderOrQueryToken } from "../services/tokenQueryAuth.js";
import { uploadFileToAnthropic } from "../services/anthropicFiles.js";
import { getAiProviderKey } from "../services/aiProviders.js";

export async function registerAgenciaRoutes(app: FastifyInstance) {
  // Public-ish: allow token via query so upstream tools (Claude) can fetch assets.
  app.get("/agencia/assets/:assetId/blob", async (req, reply) => {
    const assetId = (req.params as { assetId: string }).assetId;
    // Require auth either via Authorization header (normal) or ?token= for external fetchers.
    await jwtVerifyHeaderOrQueryToken(req, reply);
    if (reply.sent) return;

    const asset = await prisma.agencyAsset.findUnique({
      where: { id: assetId },
      select: { bytes: true, mime: true, filename: true, deletedAt: true },
    });
    if (!asset || asset.deletedAt) return reply.code(404).send({ error: "not_found" });
    if (!asset.bytes) return reply.code(404).send({ error: "no_bytes" });
    const mime = (asset.mime ?? "application/octet-stream").trim() || "application/octet-stream";
    reply.header("content-type", mime);
    reply.header("cache-control", "public, max-age=3600");
    if (asset.filename) reply.header("content-disposition", `inline; filename="${asset.filename.replace(/"/g, "")}"`);
    return reply.send(Buffer.from(asset.bytes));
  });

  app.get("/admin/agencia/profile", { preHandler: [jwtVerifyGuard, requireRole(["admin"])] }, async () => {
    const row = await prisma.agencyProfile.findFirst({ where: { deletedAt: null } });
    return { profile: row };
  });

  app.put("/admin/agencia/profile", { preHandler: [jwtVerifyGuard, requireRole(["admin"])] }, async (req, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      tagline: z.string().optional(),
      about: z.string().optional(),
      contact: z.string().optional(),
      website: z.string().optional(),
    });
    const body = schema.parse(req.body);
    const existing = await prisma.agencyProfile.findFirst({ where: { deletedAt: null } });
    const profile = existing
      ? await prisma.agencyProfile.update({
          where: { id: existing.id },
          data: {
            name: body.name,
            tagline: body.tagline ?? null,
            about: body.about ?? null,
            contact: body.contact ?? null,
            website: body.website ?? null,
          },
        })
      : await prisma.agencyProfile.create({
          data: {
            name: body.name,
            tagline: body.tagline ?? null,
            about: body.about ?? null,
            contact: body.contact ?? null,
            website: body.website ?? null,
          },
        });

    await auditLog({
      req,
      action: "update",
      entity: "AgencyProfile",
      entityId: profile.id,
      summary: "Agencia: perfil actualizado",
      data: body,
    });

    return reply.send({ profile });
  });

  app.get("/admin/agencia/assets", { preHandler: [jwtVerifyGuard, requireRole(["admin"])] }, async () => {
    const assets = await prisma.agencyAsset.findMany({
      where: { deletedAt: null },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
      select: { id: true, kind: true, label: true, filename: true, mime: true, sizeBytes: true, createdAt: true, anthropicFileId: true },
    });
    return { assets };
  });

  // Multipart upload: file + kind + optional name
  app.post("/admin/agencia/assets", { preHandler: [jwtVerifyGuard, requireRole(["admin"])] }, async (req, reply) => {
    const ct = String((req.headers as any)?.["content-type"] ?? "");
    const isMultipart = ct.toLowerCase().includes("multipart/form-data");
    if (!isMultipart) return reply.code(400).send({ error: "multipart_required" });
    const parts = (req as any).parts?.();
    if (!parts) return reply.code(400).send({ error: "multipart_not_enabled" });

    let kind: string | null = null;
    let label: string | null = null;
    let filename: string | null = null;
    let mime: string | null = null;
    let bytes: Buffer | null = null;

    for await (const p of parts) {
      if (p.type === "file") {
        filename = p.filename ?? null;
        mime = p.mimetype ?? null;
        bytes = await p.toBuffer();
      } else {
        if (p.fieldname === "kind") kind = String(p.value ?? "").trim() || null;
        if (p.fieldname === "label") label = String(p.value ?? "").trim() || null;
      }
    }

    if (!bytes) return reply.code(400).send({ error: "file_required" });
    if (!kind) return reply.code(400).send({ error: "kind_required" });
    if (kind !== "logo_square" && kind !== "logo_wide" && kind !== "photo" && kind !== "pptx_guide") {
      return reply.code(400).send({ error: "invalid_kind" });
    }

    // Ensure an agency profile exists (assets require `agencyId`).
    const agency =
      (await prisma.agencyProfile.findFirst({ where: { deletedAt: null }, select: { id: true } })) ??
      (await prisma.agencyProfile.create({ data: { name: "Agencia" }, select: { id: true } }));

    const asset = await prisma.agencyAsset.create({
      data: {
        agencyId: agency.id,
        kind,
        label,
        filename,
        mime,
        bytes: new Uint8Array(bytes),
        sizeBytes: bytes.length,
      } as any,
      select: { id: true, kind: true, label: true, filename: true, mime: true, sizeBytes: true, createdAt: true },
    });

    await auditLog({
      req,
      action: "create",
      entity: "AgencyAsset",
      entityId: asset.id,
      summary: `Agencia: asset subido (${asset.kind})`,
      data: { kind: asset.kind, label: (asset as any).label ?? null, filename: asset.filename, sizeBytes: asset.sizeBytes },
    });

    return reply.code(201).send({ asset });
  });

  // Sync an agency asset to Anthropic Files API (store returned file_id for reuse).
  app.post(
    "/admin/agencia/assets/:assetId/sync-claude",
    { preHandler: [jwtVerifyGuard, requireRole(["admin"])] },
    async (req, reply) => {
      const assetId = (req.params as { assetId: string }).assetId;
      const asset = await prisma.agencyAsset.findUnique({
        where: { id: assetId },
        select: { id: true, kind: true, bytes: true, mime: true, filename: true, sizeBytes: true, deletedAt: true, anthropicFileId: true },
      });
      if (!asset || asset.deletedAt) return reply.code(404).send({ error: "not_found" });
      if (!asset.bytes) return reply.code(400).send({ error: "no_bytes" });
      if (asset.anthropicFileId) return reply.send({ ok: true, fileId: asset.anthropicFileId, already: true });

      const apiKey = await getAiProviderKey("anthropic");
      if (!apiKey) return reply.code(400).send({ error: "anthropic_not_configured" });

      const uploaded = await uploadFileToAnthropic({
        apiKey,
        bytes: Buffer.from(asset.bytes as any),
        filename: asset.filename ?? `${asset.kind}-${asset.id}`,
        mime: asset.mime ?? "application/octet-stream",
      });

      const updated = await prisma.agencyAsset.update({
        where: { id: assetId },
        data: { anthropicFileId: uploaded.id },
        select: { id: true, kind: true, label: true, filename: true, mime: true, sizeBytes: true, createdAt: true, anthropicFileId: true },
      });

      await auditLog({
        req,
        action: "update",
        entity: "AgencyAsset",
        entityId: assetId,
        summary: "Agencia: asset sincronizado a Anthropic Files",
        data: { anthropicFileId: uploaded.id },
      });
      return reply.send({ ok: true, fileId: uploaded.id, asset: updated });
    },
  );

  app.delete(
    "/admin/agencia/assets/:assetId",
    { preHandler: [jwtVerifyGuard, requireRole(["admin"])] },
    async (req, reply) => {
      const assetId = (req.params as { assetId: string }).assetId;
      const existing = await prisma.agencyAsset.findUnique({ where: { id: assetId } });
      if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });
      await prisma.agencyAsset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
      await auditLog({
        req,
        action: "soft_delete",
        entity: "AgencyAsset",
        entityId: assetId,
        summary: "Agencia: asset borrado (soft)",
      });
      return reply.send({ ok: true });
    },
  );
}

