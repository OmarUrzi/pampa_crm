import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma";
import { jwtVerifyGuard } from "../auth/jwtGuards";
import { requireWriteAccess } from "../auth/roleGuards";
import { auditLog } from "../audit";

export async function registerCommsRoutes(app: FastifyInstance) {
  app.post(
    "/eventos/:eventoId/comms",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
    const eventoId = (req.params as { eventoId: string }).eventoId;
    const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
    if (!evento || evento.deletedAt) return reply.code(404).send({ error: "not_found" });

    const schema = z.object({
      de: z.string().min(1),
      msg: z.string().min(1),
      horaLabel: z.string().min(1),
      dir: z.enum(["in", "out"]),
      tipo: z.enum(["Mail", "WhatsApp"]),
    });
    const body = schema.parse(req.body);

    const comm = await prisma.eventoComm.create({
      data: {
        eventoId,
        de: body.de,
        msg: body.msg,
        horaLabel: body.horaLabel,
        dir: body.dir,
        tipo: body.tipo,
      },
    });

    await auditLog({
      req,
      action: "create",
      entity: "EventoComm",
      entityId: comm.id,
      summary: `Comm creada (${comm.tipo})`,
      data: body,
    });

    return reply.code(201).send({ comm });
  });

  app.delete(
    "/eventos/:eventoId/comms/:commId",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
    const { eventoId, commId } = req.params as { eventoId: string; commId: string };
    const existing = await prisma.eventoComm.findUnique({ where: { id: commId } });
    if (!existing || existing.deletedAt || existing.eventoId !== eventoId) {
      return reply.code(404).send({ error: "not_found" });
    }

    await prisma.eventoComm.update({ where: { id: commId }, data: { deletedAt: new Date() } });

    await auditLog({
      req,
      action: "soft_delete",
      entity: "EventoComm",
      entityId: commId,
      summary: `Comm borrada (soft)`,
    });

    return reply.send({ ok: true });
  });
}

