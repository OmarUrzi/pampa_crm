import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { auditLog } from "../audit.js";
import { acceptJwtFromQuery } from "../services/tokenQueryAuth.js";
import { uploadFileToAnthropic } from "../services/anthropicFiles.js";
import { getAiProviderKey } from "../services/aiProviders.js";

export async function registerCatalogoRoutes(app: FastifyInstance) {
  function mapFoto(f: any) {
    const blobUrl = f?.bytes ? `/catalogo/fotos/${f.id}/blob` : null;
    return {
      id: f.id,
      url: f.url ?? null,
      caption: f.caption ?? null,
      anthropicFileId: f.anthropicFileId ?? null,
      hasBytes: !!f.bytes,
      blobUrl,
    };
  }

  app.post(
    "/catalogo/fotos/:fotoId/sync-anthropic",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const fotoId = (req.params as { fotoId: string }).fotoId;
      const foto = await prisma.actividadFoto.findUnique({
        where: { id: fotoId },
        select: { id: true, bytes: true, mime: true, filename: true, deletedAt: true, anthropicFileId: true },
      });
      if (!foto || foto.deletedAt) return reply.code(404).send({ error: "not_found" });
      if (foto.anthropicFileId) return reply.send({ ok: true, fileId: foto.anthropicFileId, reused: true });
      if (!foto.bytes) return reply.code(400).send({ error: "no_bytes" });

      const apiKey = await getAiProviderKey("anthropic");
      if (!apiKey) return reply.code(400).send({ error: "anthropic_not_configured" });

      const file = await uploadFileToAnthropic({
        apiKey,
        filename: foto.filename ?? `catalogo-foto-${foto.id}.bin`,
        mime: foto.mime ?? "application/octet-stream",
        bytes: Buffer.from(foto.bytes),
      });

      await prisma.actividadFoto.update({ where: { id: foto.id }, data: { anthropicFileId: file.id } });
      return reply.send({ ok: true, fileId: file.id });
    },
  );

  // Batch sync catalog photos missing `anthropicFileId`.
  // Note: kept write-access gated (same as catalog editing) to avoid exposing a bulk upstream upload to any viewer.
  app.post(
    "/catalogo/fotos/sync-anthropic",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const schema = z.object({
        limit: z.number().int().min(1).max(50).optional(),
      });
      const body = schema.parse((req.body ?? {}) as any);
      const limit = body.limit ?? 25;

      const apiKey = await getAiProviderKey("anthropic");
      if (!apiKey) return reply.code(400).send({ error: "anthropic_not_configured" });

      const fotos = await prisma.actividadFoto.findMany({
        where: { deletedAt: null, bytes: { not: null }, anthropicFileId: null },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: { id: true, bytes: true, mime: true, filename: true },
      });

      let synced = 0;
      for (const f of fotos) {
        try {
          const file = await uploadFileToAnthropic({
            apiKey,
            filename: f.filename ?? `catalogo-foto-${f.id}.bin`,
            mime: f.mime ?? "application/octet-stream",
            bytes: Buffer.from(f.bytes as any),
          });
          await prisma.actividadFoto.update({ where: { id: f.id }, data: { anthropicFileId: file.id } });
          synced++;
        } catch (e: any) {
          // Stop on first upstream error so caller can retry later.
          return reply.code(502).send({
            error: "anthropic_upload_failed",
            message: String(e?.message ?? "upload_failed"),
            synced,
            failedId: f.id,
          });
        }
      }

      return reply.send({ ok: true, attempted: fotos.length, synced, remaining: Math.max(0, fotos.length - synced) });
    },
  );

  app.get("/catalogo/fotos/:fotoId/blob", async (req, reply) => {
    // Allow passing JWT in query for tools/LLMs that can't send headers.
    // If token is missing/invalid we still allow public access to the blob (current behavior),
    // but this keeps the door open for tightening later without breaking clients.
    await acceptJwtFromQuery(req, reply, { required: false });
    const fotoId = (req.params as { fotoId: string }).fotoId;
    const foto = await prisma.actividadFoto.findUnique({
      where: { id: fotoId },
      select: { id: true, bytes: true, mime: true, filename: true, deletedAt: true },
    });
    if (!foto || foto.deletedAt) return reply.code(404).send({ error: "not_found" });
    if (!foto.bytes) return reply.code(404).send({ error: "no_bytes" });

    const mime = (foto.mime ?? "application/octet-stream").trim() || "application/octet-stream";
    reply.header("content-type", mime);
    // Cache lightly; catalog images rarely change.
    reply.header("cache-control", "public, max-age=3600");
    if (foto.filename) reply.header("content-disposition", `inline; filename="${foto.filename.replace(/"/g, "")}"`);
    return reply.send(Buffer.from(foto.bytes));
  });

  app.get("/catalogo", async () => {
    const actividades = await prisma.actividadCatalogo.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        fotos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        temporadas: { where: { deletedAt: null }, orderBy: { temporada: "asc" } },
      },
    });
    return {
      actividades: actividades.map((a) => ({
        ...a,
        fotos: (a.fotos ?? []).map(mapFoto),
      })),
    };
  });

  app.get("/catalogo/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const actividad = await prisma.actividadCatalogo.findUnique({
      where: { id },
      include: {
        fotos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        temporadas: { where: { deletedAt: null }, orderBy: { temporada: "asc" } },
      },
    });
    if (!actividad || actividad.deletedAt) return reply.code(404).send({ error: "not_found" });
    return { actividad: { ...actividad, fotos: (actividad.fotos ?? []).map(mapFoto) } };
  });

  app.post("/catalogo", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const schema = z.object({
      nombre: z.string().min(1),
      descripcion: z.string().optional(),
      categoria: z.string().min(1),
      duracion: z.string().optional(),
      capacidad: z.string().optional(),
      precioUsd: z.number().int().nonnegative().optional(),
      proveedorTxt: z.string().optional(),
      temporadas: z.array(z.string().min(1)).optional(),
      fotos: z.array(z.object({ url: z.string().min(1), caption: z.string().optional() })).optional(),
    });
    const body = schema.parse(req.body);

    const actividad = await prisma.actividadCatalogo.create({
      data: {
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        categoria: body.categoria,
        duracion: body.duracion ?? null,
        capacidad: body.capacidad ?? null,
        precioUsd: body.precioUsd ?? null,
        proveedorTxt: body.proveedorTxt ?? null,
        temporadas: body.temporadas ? { create: body.temporadas.map((t) => ({ temporada: t })) } : undefined,
        fotos: body.fotos
          ? { create: body.fotos.map((f) => ({ url: f.url, caption: f.caption ?? null })) }
          : undefined,
      },
      include: {
        fotos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        temporadas: { where: { deletedAt: null }, orderBy: { temporada: "asc" } },
      },
    });

    await auditLog({
      req,
      action: "create",
      entity: "ActividadCatalogo",
      entityId: actividad.id,
      summary: `Actividad creada: ${actividad.nombre}`,
      data: body,
    });

    return reply.code(201).send({ actividad: { ...actividad, fotos: (actividad.fotos ?? []).map(mapFoto) } });
  });

  app.patch("/catalogo/:id", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const schema = z.object({
      nombre: z.string().min(1).optional(),
      descripcion: z.string().optional(),
      categoria: z.string().min(1).optional(),
      duracion: z.string().optional(),
      capacidad: z.string().optional(),
      precioUsd: z.number().int().nonnegative().nullable().optional(),
      proveedorTxt: z.string().nullable().optional(),
    });
    const body = schema.parse(req.body);

    const existing = await prisma.actividadCatalogo.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });

    const actividad = await prisma.actividadCatalogo.update({
      where: { id },
      data: {
        nombre: body.nombre ?? undefined,
        descripcion: body.descripcion ?? undefined,
        categoria: body.categoria ?? undefined,
        duracion: body.duracion ?? undefined,
        capacidad: body.capacidad ?? undefined,
        precioUsd: body.precioUsd ?? undefined,
        proveedorTxt: body.proveedorTxt ?? undefined,
      },
      include: {
        fotos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        temporadas: { where: { deletedAt: null }, orderBy: { temporada: "asc" } },
      },
    });

    await auditLog({
      req,
      action: "update",
      entity: "ActividadCatalogo",
      entityId: actividad.id,
      summary: `Actividad actualizada: ${actividad.nombre}`,
      data: body,
    });

    return reply.send({ actividad: { ...actividad, fotos: (actividad.fotos ?? []).map(mapFoto) } });
  });

  app.delete("/catalogo/:id", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const existing = await prisma.actividadCatalogo.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });

    const actividad = await prisma.actividadCatalogo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await auditLog({
      req,
      action: "soft_delete",
      entity: "ActividadCatalogo",
      entityId: actividad.id,
      summary: `Actividad borrada (soft): ${actividad.nombre}`,
    });

    return reply.send({ ok: true });
  });

  // Fotos
  app.post("/catalogo/:id/fotos", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const actividadId = (req.params as { id: string }).id;
    // Supports JSON (url/caption) and multipart upload (file + caption).
    const ct = String((req.headers as any)?.["content-type"] ?? "");
    const isMultipart = ct.toLowerCase().includes("multipart/form-data");

    const act = await prisma.actividadCatalogo.findUnique({ where: { id: actividadId } });
    if (!act || act.deletedAt) return reply.code(404).send({ error: "not_found" });

    if (isMultipart) {
      const parts = (req as any).parts?.();
      if (!parts) return reply.code(400).send({ error: "multipart_not_enabled" });

      let caption: string | null = null;
      let fileName: string | null = null;
      let mime: string | null = null;
      let bytes: Buffer | null = null;

      for await (const p of parts) {
        if (p.type === "file") {
          fileName = p.filename ?? null;
          mime = p.mimetype ?? null;
          bytes = await p.toBuffer();
        } else {
          if (p.fieldname === "caption") caption = String(p.value ?? "").trim() || null;
        }
      }
      if (!bytes) return reply.code(400).send({ error: "file_required" });

      const foto = await prisma.actividadFoto.create({
        data: {
          actividadId,
          url: null,
          caption,
          bytes: new Uint8Array(bytes),
          mime,
          filename: fileName,
          sizeBytes: bytes.length,
        },
      });

      await auditLog({
        req,
        action: "create",
        entity: "ActividadFoto",
        entityId: foto.id,
        summary: `Foto subida a actividad: ${act.nombre}`,
        data: { caption, fileName, mime, size: bytes.length },
      });

      return reply.code(201).send({ foto: mapFoto(foto) });
    }

    const schema = z.object({ url: z.string().min(1), caption: z.string().optional() });
    const body = schema.parse(req.body);

    const foto = await prisma.actividadFoto.create({
      data: { actividadId, url: body.url, caption: body.caption ?? null },
    });

    await auditLog({
      req,
      action: "create",
      entity: "ActividadFoto",
      entityId: foto.id,
      summary: `Foto agregada a actividad: ${act.nombre}`,
      data: body,
    });

    return reply.code(201).send({ foto: mapFoto(foto) });
  });

  app.patch("/catalogo/:id/fotos/:fotoId", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const { id: actividadId, fotoId } = req.params as { id: string; fotoId: string };
    const schema = z.object({ url: z.string().min(1).nullable().optional(), caption: z.string().nullable().optional() });
    const body = schema.parse(req.body);

    const act = await prisma.actividadCatalogo.findUnique({ where: { id: actividadId } });
    if (!act || act.deletedAt) return reply.code(404).send({ error: "not_found" });

    const existing = await prisma.actividadFoto.findUnique({ where: { id: fotoId } });
    if (!existing || existing.deletedAt || existing.actividadId !== actividadId) {
      return reply.code(404).send({ error: "not_found" });
    }

    const foto = await prisma.actividadFoto.update({
      where: { id: fotoId },
      data: { url: body.url ?? undefined, caption: body.caption ?? undefined },
    });

    await auditLog({
      req,
      action: "update",
      entity: "ActividadFoto",
      entityId: foto.id,
      summary: `Foto actualizada (${foto.id}) en actividad: ${act.nombre}`,
      data: body,
    });

    return reply.send({ foto });
  });

  app.delete("/catalogo/:id/fotos/:fotoId", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const { id: actividadId, fotoId } = req.params as { id: string; fotoId: string };

    const act = await prisma.actividadCatalogo.findUnique({ where: { id: actividadId } });
    if (!act || act.deletedAt) return reply.code(404).send({ error: "not_found" });

    const existing = await prisma.actividadFoto.findUnique({ where: { id: fotoId } });
    if (!existing || existing.deletedAt || existing.actividadId !== actividadId) {
      return reply.code(404).send({ error: "not_found" });
    }

    await prisma.actividadFoto.update({ where: { id: fotoId }, data: { deletedAt: new Date() } });

    await auditLog({
      req,
      action: "soft_delete",
      entity: "ActividadFoto",
      entityId: fotoId,
      summary: `Foto borrada (soft) en actividad: ${act.nombre}`,
    });

    return reply.send({ ok: true });
  });
}

