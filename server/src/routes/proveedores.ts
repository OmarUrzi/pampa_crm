import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { auditLog } from "../audit.js";

export async function registerProveedoresRoutes(app: FastifyInstance) {
  app.get("/proveedores", async () => {
    const proveedoresRaw = await prisma.proveedor.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    const ids = proveedoresRaw.map((p) => p.id);
    const contactos = ids.length
      ? await prisma.proveedorContacto.findMany({
          where: { proveedorId: { in: ids }, deletedAt: null },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const byPid = new Map<string, typeof contactos>();
    for (const c of contactos) {
      const prev = byPid.get(c.proveedorId) ?? [];
      prev.push(c);
      byPid.set(c.proveedorId, prev);
    }
    const proveedores = proveedoresRaw.map((p) => ({ ...p, contactos: byPid.get(p.id) ?? [] }));
    return { proveedores };
  });

  app.post("/proveedores", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const schema = z.object({
      nombre: z.string().min(1),
      categoria: z.string().optional(),
      contactos: z
        .array(
          z.object({
            nombre: z.string().min(1),
            email: z.string().optional(),
            telefono: z.string().optional(),
          }),
        )
        .optional(),
    });
    const body = schema.parse(req.body);

    const proveedor = await prisma.$transaction(async (tx) => {
      const p = await tx.proveedor.create({
        data: {
          nombre: body.nombre,
          categoria: body.categoria ?? null,
        },
      });
      if (body.contactos?.length) {
        await tx.proveedorContacto.createMany({
          data: body.contactos.map((c) => ({
            proveedorId: p.id,
            nombre: c.nombre,
            email: c.email ?? null,
            telefono: c.telefono ?? null,
          })),
        });
      }
      const cs = await tx.proveedorContacto.findMany({
        where: { proveedorId: p.id, deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
      return { ...p, contactos: cs };
    });

    await auditLog({
      req,
      action: "create",
      entity: "Proveedor",
      entityId: proveedor.id,
      summary: `Proveedor creado: ${proveedor.nombre}`,
      data: body,
    });

    return reply.code(201).send({ proveedor });
  });

  app.patch("/proveedores/:id", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const existing = await prisma.proveedor.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });

    const schema = z.object({
      nombre: z.string().min(1).optional(),
      categoria: z.string().nullable().optional(),
      contactos: z
        .array(
          z.object({
            nombre: z.string().min(1),
            email: z.string().optional(),
            telefono: z.string().optional(),
          }),
        )
        .optional(),
    });
    const body = schema.parse(req.body);

    const proveedor = await prisma.$transaction(async (tx) => {
      const p = await tx.proveedor.update({
        where: { id },
        data: {
          nombre: body.nombre ?? undefined,
          categoria: body.categoria ?? undefined,
        },
      });

      if (body.contactos) {
        await tx.proveedorContacto.updateMany({
          where: { proveedorId: id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        if (body.contactos.length) {
          await tx.proveedorContacto.createMany({
            data: body.contactos.map((c) => ({
              proveedorId: id,
              nombre: c.nombre,
              email: c.email ?? null,
              telefono: c.telefono ?? null,
            })),
          });
        }
      }

      return await tx.proveedor.findUniqueOrThrow({
        where: { id },
      });
    });
    const contactos = await prisma.proveedorContacto.findMany({
      where: { proveedorId: id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const proveedorWithContactos = { ...proveedor, contactos };

    await auditLog({
      req,
      action: "update",
      entity: "Proveedor",
      entityId: proveedorWithContactos.id,
      summary: `Proveedor actualizado: ${proveedorWithContactos.nombre}`,
      data: body,
    });

    return reply.send({ proveedor: proveedorWithContactos });
  });

  app.delete("/proveedores/:id", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const existing = await prisma.proveedor.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });

    await prisma.proveedor.update({ where: { id }, data: { deletedAt: new Date() } });

    await auditLog({
      req,
      action: "soft_delete",
      entity: "Proveedor",
      entityId: id,
      summary: `Proveedor borrado (soft): ${existing.nombre}`,
    });

    return reply.send({ ok: true });
  });

  // Pedidos por evento (creación/actualización) — para que el front deje de simular.
  app.post(
    "/eventos/:eventoId/proveedores/pedidos",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const eventoId = (req.params as { eventoId: string }).eventoId;
      const evento = await prisma.evento.findUnique({ where: { id: eventoId } });
      if (!evento || evento.deletedAt) return reply.code(404).send({ error: "not_found" });

      const schema = z.object({
        proveedorId: z.string().optional(),
        proveedorTxt: z.string().min(1),
        categoria: z.string().min(1),
        pedidoLabel: z.string().optional(),
        pedidoAt: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const pedido = await prisma.proveedorPedido.create({
        data: {
          eventoId,
          proveedorId: body.proveedorId ?? null,
          proveedorTxt: body.proveedorTxt,
          categoria: body.categoria,
          pedidoLabel: body.pedidoLabel ?? "Hoy",
          pedidoAt: body.pedidoAt ? new Date(body.pedidoAt) : new Date(),
          respondioLabel: null,
          respondioAt: null,
          montoLabel: null,
        },
      });

      await auditLog({
        req,
        action: "create",
        entity: "ProveedorPedido",
        entityId: pedido.id,
        summary: `Pedido proveedor creado (${pedido.proveedorTxt})`,
        data: body,
      });

      return reply.code(201).send({ pedido });
    },
  );

  app.patch(
    "/eventos/:eventoId/proveedores/pedidos/:pedidoId",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const { eventoId, pedidoId } = req.params as { eventoId: string; pedidoId: string };
      const existing = await prisma.proveedorPedido.findUnique({ where: { id: pedidoId } });
      if (!existing || existing.deletedAt || existing.eventoId !== eventoId) {
        return reply.code(404).send({ error: "not_found" });
      }

      const schema = z.object({
        respondioLabel: z.string().nullable().optional(),
        respondioAt: z.string().nullable().optional(),
        montoLabel: z.string().nullable().optional(),
        rating: z.number().int().min(1).max(5).nullable().optional(),
        pedidoLabel: z.string().optional(),
        pedidoAt: z.string().nullable().optional(),
      });
      const body = schema.parse(req.body);

      const pedido = await prisma.proveedorPedido.update({
        where: { id: pedidoId },
        data: {
          respondioLabel: body.respondioLabel ?? undefined,
          respondioAt: body.respondioAt ? new Date(body.respondioAt) : body.respondioAt === null ? null : undefined,
          montoLabel: body.montoLabel ?? undefined,
          rating: body.rating ?? undefined,
          pedidoLabel: body.pedidoLabel ?? undefined,
          pedidoAt: body.pedidoAt ? new Date(body.pedidoAt) : body.pedidoAt === null ? null : undefined,
        },
      });

      await auditLog({
        req,
        action: "update",
        entity: "ProveedorPedido",
        entityId: pedido.id,
        summary: `Pedido proveedor actualizado (${pedido.proveedorTxt})`,
        data: body,
      });

      return reply.send({ pedido });
    },
  );

  app.delete(
    "/eventos/:eventoId/proveedores/pedidos/:pedidoId",
    { preHandler: [jwtVerifyGuard, requireWriteAccess()] },
    async (req, reply) => {
      const { eventoId, pedidoId } = req.params as { eventoId: string; pedidoId: string };
      const existing = await prisma.proveedorPedido.findUnique({ where: { id: pedidoId } });
      if (!existing || existing.deletedAt || existing.eventoId !== eventoId) {
        return reply.code(404).send({ error: "not_found" });
      }

      await prisma.proveedorPedido.update({ where: { id: pedidoId }, data: { deletedAt: new Date() } });

      await auditLog({
        req,
        action: "soft_delete",
        entity: "ProveedorPedido",
        entityId: pedidoId,
        summary: `Pedido proveedor borrado (soft) (${existing.proveedorTxt})`,
      });

      return reply.send({ ok: true });
    },
  );
}

