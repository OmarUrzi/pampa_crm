import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma";

export type AuditAction =
  | "create"
  | "update"
  | "soft_delete"
  | "restore";

export async function auditLog(params: {
  req: FastifyRequest;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary?: string | null;
  data?: unknown;
}) {
  const userEmail = (params.req.user as { email?: string } | undefined)?.email ?? null;
  const ip = params.req.ip ?? null;
  const userAgent = params.req.headers["user-agent"] ?? null;

  await prisma.auditLog.create({
    data: {
      userEmail,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      summary: params.summary ?? null,
      data: params.data ? (params.data as object) : null,
      ip,
      userAgent,
    },
  });
}

