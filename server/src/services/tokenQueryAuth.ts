import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Verifies a JWT either from Authorization header (normal) or from `?token=` query param
 * (useful for images fetched by third parties that cannot send headers).
 *
 * When successful, it sets `req.user` like `req.jwtVerify()` would.
 */
export async function jwtVerifyHeaderOrQueryToken(req: FastifyRequest, reply: FastifyReply) {
  try {
    // Try standard auth header first.
    await req.jwtVerify();
    return;
  } catch {
    // fall through to query token
  }

  try {
    const q = (req.query ?? {}) as any;
    const token = typeof q?.token === "string" ? q.token : "";
    const raw = token.trim().replace(/^Bearer\s+/i, "");
    if (!raw) return reply.code(401).send({ error: "unauthorized" });
    (req as any).user = (req.server as any).jwt.verify(raw);
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
}

/**
 * Back-compat alias used by image/blob routes.
 * If `required=false`, this will never 401; it just tries to populate `req.user` if possible.
 */
export async function acceptJwtFromQuery(
  req: FastifyRequest,
  reply: FastifyReply,
  opts?: { required?: boolean },
) {
  const required = opts?.required ?? true;
  try {
    await jwtVerifyHeaderOrQueryToken(req, reply);
    return true;
  } catch {
    // ignore
  }
  // jwtVerifyHeaderOrQueryToken already replied 401 when required.
  if (!required) return true;
  return false;
}


