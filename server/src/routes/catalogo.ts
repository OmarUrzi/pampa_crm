import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma";
import { jwtVerifyGuard } from "../auth/jwtGuards";
import { requireWriteAccess } from "../auth/roleGuards";
import { auditLog } from "../audit";

export async function registerCatalogoRoutes(app: FastifyInstance) {
  app.get("/catalogo", async () => {
    const actividades = await prisma.actividadCatalogo.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        fotos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        temporadas: { where: { deletedAt: null }, orderBy: { temporada: "asc" } },
      },
    });
    return { actividades };
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
    return { actividad };
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

    return reply.code(201).send({ actividad });
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

    return reply.send({ actividad });
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
    const schema = z.object({ url: z.string().min(1), caption: z.string().optional() });
    const body = schema.parse(req.body);

    const act = await prisma.actividadCatalogo.findUnique({ where: { id: actividadId } });
    if (!act || act.deletedAt) return reply.code(404).send({ error: "not_found" });

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

    return reply.code(201).send({ foto });
  });

  app.patch("/catalogo/:id/fotos/:fotoId", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const { id: actividadId, fotoId } = req.params as { id: string; fotoId: string };
    const schema = z.object({ url: z.string().min(1).optional(), caption: z.string().nullable().optional() });
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

