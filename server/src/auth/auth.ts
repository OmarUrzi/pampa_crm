import type { FastifyInstance } from "fastify";

export type JwtUser = {
  email: string;
  name?: string;
  role?: "user" | "viewer" | "admin";
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

export async function requireAuth(app: FastifyInstance) {
  await app.addHook("preHandler", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
}

