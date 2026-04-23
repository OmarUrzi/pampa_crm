import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { auditLog } from "../audit.js";

export async function registerChatRoutes(app: FastifyInstance) {
  app.post("/eventos/:eventoId/chat", { preHandler: jwtVerifyGuard }, async (req, reply) => {
    const eventoId = (req.params as { eventoId: string }).eventoId;
    const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
    if (!evento || evento.deletedAt) return reply.code(404).send({ error: "not_found" });

    const schema = z.object({
      role: z.enum(["ai", "user"]),
      msg: z.string().min(1),
    });
    const body = schema.parse(req.body);

    const chat = await prisma.eventoChatMsg.create({
      data: {
        eventoId,
        role: body.role,
        msg: body.msg,
      },
    });

    await auditLog({
      req,
      action: "create",
      entity: "EventoChatMsg",
      entityId: chat.id,
      summary: `Chat msg (${body.role})`,
      data: body,
    });

    return reply.code(201).send({ chat });
  });

  app.delete("/eventos/:eventoId/chat/:chatId", { preHandler: jwtVerifyGuard }, async (req, reply) => {
    const { eventoId, chatId } = req.params as { eventoId: string; chatId: string };
    const existing = await prisma.eventoChatMsg.findUnique({ where: { id: chatId } });
    if (!existing || existing.deletedAt || existing.eventoId !== eventoId) {
      return reply.code(404).send({ error: "not_found" });
    }

    await prisma.eventoChatMsg.update({ where: { id: chatId }, data: { deletedAt: new Date() } });

    await auditLog({
      req,
      action: "soft_delete",
      entity: "EventoChatMsg",
      entityId: chatId,
      summary: `Chat msg borrado (soft)`,
    });

    return reply.send({ ok: true });
  });
}

