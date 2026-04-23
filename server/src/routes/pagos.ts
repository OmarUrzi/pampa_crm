import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { auditLog } from "../audit.js";

export async function registerPagosRoutes(app: FastifyInstance) {
  app.post("/eventos/:eventoId/pagos", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const eventoId = (req.params as { eventoId: string }).eventoId;
    const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
    if (!evento || evento.deletedAt) return reply.code(404).send({ error: "not_found" });

    const schema = z.object({
      concepto: z.string().min(1),
      tipo: z.enum(["cobro_cliente", "pago_proveedor"]),
      monto: z.number().int().nonnegative(),
      moneda: z.enum(["USD", "ARS"]),
      fechaLabel: z.string().min(1),
      ok: z.boolean().optional(),
    });
    const body = schema.parse(req.body);

    const pago = await prisma.pago.create({
      data: {
        eventoId,
        concepto: body.concepto,
        tipo: body.tipo,
        monto: body.monto,
        moneda: body.moneda,
        fechaLabel: body.fechaLabel,
        ok: body.ok ?? false,
      },
    });

    await auditLog({
      req,
      action: "create",
      entity: "Pago",
      entityId: pago.id,
      summary: `Pago creado (${pago.tipo})`,
      data: body,
    });

    return reply.code(201).send({ pago });
  });

  app.patch(
    "/eventos/:eventoId/pagos/:pagoId",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
    const { eventoId, pagoId } = req.params as { eventoId: string; pagoId: string };
    const existing = await prisma.pago.findUnique({ where: { id: pagoId } });
    if (!existing || existing.deletedAt || existing.eventoId !== eventoId) {
      return reply.code(404).send({ error: "not_found" });
    }

    const schema = z.object({
      concepto: z.string().min(1).optional(),
      monto: z.number().int().nonnegative().optional(),
      moneda: z.enum(["USD", "ARS"]).optional(),
      fechaLabel: z.string().min(1).optional(),
      ok: z.boolean().optional(),
    });
    const body = schema.parse(req.body);

    const pago = await prisma.pago.update({
      where: { id: pagoId },
      data: {
        concepto: body.concepto ?? undefined,
        monto: body.monto ?? undefined,
        moneda: body.moneda ?? undefined,
        fechaLabel: body.fechaLabel ?? undefined,
        ok: body.ok ?? undefined,
      },
    });

    await auditLog({
      req,
      action: "update",
      entity: "Pago",
      entityId: pago.id,
      summary: `Pago actualizado (${pago.tipo})`,
      data: body,
    });

    return reply.send({ pago });
  });

  app.delete(
    "/eventos/:eventoId/pagos/:pagoId",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
    const { eventoId, pagoId } = req.params as { eventoId: string; pagoId: string };
    const existing = await prisma.pago.findUnique({ where: { id: pagoId } });
    if (!existing || existing.deletedAt || existing.eventoId !== eventoId) {
      return reply.code(404).send({ error: "not_found" });
    }

    await prisma.pago.update({ where: { id: pagoId }, data: { deletedAt: new Date() } });

    await auditLog({
      req,
      action: "soft_delete",
      entity: "Pago",
      entityId: pagoId,
      summary: `Pago borrado (soft) (${existing.concepto})`,
    });

    return reply.send({ ok: true });
  });
}

