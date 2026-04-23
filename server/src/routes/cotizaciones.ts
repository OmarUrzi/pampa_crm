import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { auditLog } from "../audit.js";

function labelForVersionNo(n: number) {
  return `v${n}`;
}

export async function registerCotizacionesRoutes(app: FastifyInstance) {
  const itemSchema = z.object({
    servicio: z.string().optional(),
    proveedor: z.string().optional(),
    pax: z.number().int().nonnegative().optional(),
    unitCur: z.enum(["USD", "ARS"]).optional(),
    unit: z.number().int().nonnegative().optional(),
  });

  async function getCurrentVersionOr404(eventoId: string, reply: any) {
    const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
    if (!evento || evento.deletedAt) {
      reply.code(404).send({ error: "not_found" });
      return null;
    }

    const v = await prisma.cotizacionVersion.findFirst({
      where: { eventoId, deletedAt: null, isCurrent: true },
      include: { items: { where: { deletedAt: null } } },
      orderBy: { versionNo: "desc" },
    });
    if (!v) {
      reply.code(404).send({ error: "not_found" });
      return null;
    }
    return v;
  }

  // Crear nueva versión (clona items de la última versión vigente si existe)
  app.post(
    "/eventos/:eventoId/cotizaciones/version",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const eventoId = (req.params as { eventoId: string }).eventoId;

      const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
      if (!evento || evento.deletedAt) return reply.code(404).send({ error: "not_found" });

      const prev = await prisma.cotizacionVersion.findFirst({
        where: { eventoId, deletedAt: null },
        orderBy: { versionNo: "desc" },
        include: { items: { where: { deletedAt: null } } },
      });

      const nextNo = (prev?.versionNo ?? 0) + 1;

      const next = await prisma.$transaction(async (tx) => {
        await tx.cotizacionVersion.updateMany({
          where: { eventoId, deletedAt: null, isCurrent: true },
          data: { isCurrent: false },
        });

        const v = await tx.cotizacionVersion.create({
          data: {
            eventoId,
            versionNo: nextNo,
            label: labelForVersionNo(nextNo),
            isCurrent: true,
            items: prev
              ? {
                  create: prev.items.map((it) => ({
                    servicio: it.servicio,
                    proveedor: it.proveedor,
                    pax: it.pax,
                    unitCur: it.unitCur,
                    unit: it.unit,
                  })),
                }
              : undefined,
          },
          include: { items: { where: { deletedAt: null } } },
        });
        return v;
      });

      await auditLog({
        req,
        action: "create",
        entity: "CotizacionVersion",
        entityId: next.id,
        summary: `Nueva versión ${next.label} para evento ${eventoId}`,
        data: { eventoId, versionNo: nextNo },
      });

      return reply.code(201).send({ version: next });
    },
  );

  // Back-compat (frontend older build): add item to the current version without specifying versionId.
  app.post(
    "/eventos/:eventoId/cotizaciones/v2/items",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const eventoId = (req.params as { eventoId: string }).eventoId;
      const version = await getCurrentVersionOr404(eventoId, reply);
      if (!version) return;

      const body = itemSchema.parse(req.body);
      const item = await prisma.cotizacionItem.create({
        data: {
          versionId: version.id,
          servicio: body.servicio ?? "",
          proveedor: body.proveedor ?? "",
          pax: body.pax ?? 0,
          unitCur: body.unitCur ?? "USD",
          unit: body.unit ?? 0,
        },
      });

      await auditLog({
        req,
        action: "create",
        entity: "CotizacionItem",
        entityId: item.id,
        summary: `Item agregado a versión actual (${version.id})`,
        data: body,
      });

      return reply.code(201).send({ item, versionId: version.id });
    },
  );

  app.get(
    "/eventos/:eventoId/cotizaciones/v2/items",
    { preHandler: [jwtVerifyGuard] },
    async (req, reply) => {
      const eventoId = (req.params as { eventoId: string }).eventoId;
      const version = await getCurrentVersionOr404(eventoId, reply);
      if (!version) return;
      return reply.send({ version });
    },
  );

  // Agregar item a una versión
  app.post(
    "/eventos/:eventoId/cotizaciones/:versionId/items",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const { eventoId, versionId } = req.params as { eventoId: string; versionId: string };

      const version = await prisma.cotizacionVersion.findUnique({ where: { id: versionId } });
      if (!version || version.deletedAt || version.eventoId !== eventoId) {
        return reply.code(404).send({ error: "not_found" });
      }

      const body = itemSchema.parse(req.body);

      const item = await prisma.cotizacionItem.create({
        data: {
          versionId,
          servicio: body.servicio ?? "",
          proveedor: body.proveedor ?? "",
          pax: body.pax ?? 0,
          unitCur: body.unitCur ?? "USD",
          unit: body.unit ?? 0,
        },
      });

      await auditLog({
        req,
        action: "create",
        entity: "CotizacionItem",
        entityId: item.id,
        summary: `Item agregado a versión ${versionId}`,
        data: body,
      });

      return reply.code(201).send({ item });
    },
  );

  // Actualizar item
  app.patch(
    "/eventos/:eventoId/cotizaciones/:versionId/items/:itemId",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const { eventoId, versionId, itemId } = req.params as {
        eventoId: string;
        versionId: string;
        itemId: string;
      };

      const version = await prisma.cotizacionVersion.findUnique({ where: { id: versionId } });
      if (!version || version.deletedAt || version.eventoId !== eventoId) {
        return reply.code(404).send({ error: "not_found" });
      }

      const existing = await prisma.cotizacionItem.findUnique({ where: { id: itemId } });
      if (!existing || existing.deletedAt || existing.versionId !== versionId) {
        return reply.code(404).send({ error: "not_found" });
      }

      const body = itemSchema.parse(req.body);

      const item = await prisma.cotizacionItem.update({
        where: { id: itemId },
        data: {
          servicio: body.servicio ?? undefined,
          proveedor: body.proveedor ?? undefined,
          pax: body.pax ?? undefined,
          unitCur: body.unitCur ?? undefined,
          unit: body.unit ?? undefined,
        },
      });

      await auditLog({
        req,
        action: "update",
        entity: "CotizacionItem",
        entityId: item.id,
        summary: `Item actualizado (${item.id})`,
        data: body,
      });

      return reply.send({ item });
    },
  );

  // Soft delete item
  app.delete(
    "/eventos/:eventoId/cotizaciones/:versionId/items/:itemId",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const { eventoId, versionId, itemId } = req.params as {
        eventoId: string;
        versionId: string;
        itemId: string;
      };

      const version = await prisma.cotizacionVersion.findUnique({ where: { id: versionId } });
      if (!version || version.deletedAt || version.eventoId !== eventoId) {
        return reply.code(404).send({ error: "not_found" });
      }

      const existing = await prisma.cotizacionItem.findUnique({ where: { id: itemId } });
      if (!existing || existing.deletedAt || existing.versionId !== versionId) {
        return reply.code(404).send({ error: "not_found" });
      }

      await prisma.cotizacionItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });

      await auditLog({
        req,
        action: "soft_delete",
        entity: "CotizacionItem",
        entityId: itemId,
        summary: `Item borrado (soft) (${itemId})`,
      });

      return reply.send({ ok: true });
    },
  );
}

