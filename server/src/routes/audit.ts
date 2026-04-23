import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";

export async function registerAuditRoutes(app: FastifyInstance) {
  // Solo autenticado: es información sensible.
  app.get("/audit", { preHandler: jwtVerifyGuard }, async (req) => {
    const schema = z.object({
      take: z.coerce.number().int().min(1).max(200).optional(),
    });
    const q = schema.parse((req.query ?? {}) as Record<string, unknown>);
    const take = q.take ?? 100;

    const items = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });
    return { items };
  });
}

