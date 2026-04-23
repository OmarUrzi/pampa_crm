import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireRole } from "../auth/roleGuards.js";
import { auditLog } from "../audit.js";
import { encryptSecret } from "../google/crypto.js";

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/admin/users", { preHandler: [jwtVerifyGuard, requireRole(["admin"])] }, async () => {
    const users = await prisma.appUser.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    });
    return { users };
  });

  app.patch(
    "/admin/users/:id",
    { preHandler: [jwtVerifyGuard, requireRole(["admin"])] },
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const schema = z.object({
        role: z.enum(["admin", "user", "viewer"]),
      });
      const body = schema.parse(req.body);
      const existing = await prisma.appUser.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });

      if ((existing as any).role === "admin" && body.role !== "admin") {
        const admins = await prisma.appUser.count({
          where: { deletedAt: null, role: "admin" as any },
        });
        if (admins <= 1) return reply.code(400).send({ error: "last_admin" });
      }

      const user = await prisma.appUser.update({ where: { id }, data: { role: body.role as any } });
      await auditLog({
        req,
        action: "update",
        entity: "AppUser",
        entityId: user.id,
        summary: `User role updated: ${user.email} -> ${body.role}`,
        data: body,
      });
      return reply.send({ user: { id: user.id, email: user.email, name: user.name, role: (user as any).role } });
    },
  );

  app.get("/admin/ai-providers", { preHandler: [jwtVerifyGuard, requireRole(["admin"])] }, async () => {
    const rows = await prisma.aiProviderKey.findMany({
      where: { revokedAt: null },
      select: { provider: true, createdAt: true, updatedAt: true, revokedAt: true },
      orderBy: { provider: "asc" },
    });
    return { providers: rows };
  });

  app.put(
    "/admin/ai-providers/:provider",
    { preHandler: [jwtVerifyGuard, requireRole(["admin"])] },
    async (req, reply) => {
      const provider = String((req.params as any)?.provider ?? "").toLowerCase();
      if (provider !== "openai" && provider !== "anthropic" && provider !== "gemini") {
        return reply.code(400).send({ error: "invalid_provider" });
      }
      const schema = z.object({ apiKey: z.string().min(10) });
      const body = schema.parse(req.body);
      const enc = encryptSecret(body.apiKey);

      // Una sola fila por `provider` (@unique): rotar clave = actualizar cifrado, no crear otra fila.
      const row = await prisma.aiProviderKey.upsert({
        where: { provider: provider as "openai" | "anthropic" | "gemini" },
        create: { provider: provider as any, apiKeyEnc: enc },
        update: { apiKeyEnc: enc, revokedAt: null },
        select: { provider: true, createdAt: true, updatedAt: true, revokedAt: true },
      });
      return reply.send({ provider: row });
    },
  );
}

