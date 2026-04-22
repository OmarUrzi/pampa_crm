import type { FastifyReply, FastifyRequest } from "fastify";

export function requireRole(roles: Array<"admin" | "user" | "viewer">) {
  return async function roleGuard(req: FastifyRequest, reply: FastifyReply) {
    const role = (req.user as { role?: string } | undefined)?.role ?? "user";
    if (!roles.includes(role as any)) return reply.code(403).send({ error: "forbidden" });
  };
}

export function requireWriteAccess() {
  return requireRole(["admin", "user"]);
}

