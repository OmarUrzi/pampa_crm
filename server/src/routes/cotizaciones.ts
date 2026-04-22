import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma";
import { jwtVerifyGuard } from "../auth/jwtGuards";
import { requireWriteAccess } from "../auth/roleGuards";
import { auditLog } from "../audit";

function labelForVersionNo(n: number) {
  return `v${n}`;
}

export async function registerCotizacionesRoutes(app: FastifyInstance) {
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

      const schema = z.object({
        servicio: z.string().optional(),
        proveedor: z.string().optional(),
        pax: z.number().int().nonnegative().optional(),
        unitCur: z.enum(["USD", "ARS"]).optional(),
        unit: z.number().int().nonnegative().optional(),
      });
      const body = schema.parse(req.body);

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

      const schema = z.object({
        servicio: z.string().optional(),
        proveedor: z.string().optional(),
        pax: z.number().int().nonnegative().optional(),
        unitCur: z.enum(["USD", "ARS"]).optional(),
        unit: z.number().int().nonnegative().optional(),
      });
      const body = schema.parse(req.body);

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

