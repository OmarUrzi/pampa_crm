import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { auditLog } from "../audit.js";
import { triggerBackfillForEmailAcrossMailboxes } from "../services/gmailBackfill.js";

const contactoSchema = z.object({
  id: z.string().optional(),
  nombre: z.string().min(1),
  cargo: z.string().optional(),
  email: z.string().email().optional(),
  telefono: z.string().optional(),
});

export async function registerClienteRoutes(app: FastifyInstance) {
  app.get("/clientes", { preHandler: [jwtVerifyGuard] }, async () => {
    const empresas = await prisma.empresa.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { contactos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
    });
    return { clientes: empresas };
  });

  app.get("/clientes/:id", { preHandler: [jwtVerifyGuard] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const empresa = await prisma.empresa.findUnique({
      where: { id },
      include: { contactos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
    });
    if (!empresa || empresa.deletedAt) return reply.code(404).send({ error: "not_found" });
    return { cliente: empresa };
  });

  app.post("/clientes", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const schema = z.object({
      nombre: z.string().min(1),
      sector: z.string().optional(),
      contactos: z.array(contactoSchema).optional(),
    });
    const body = schema.parse(req.body);

    const cliente = await prisma.empresa.create({
      data: {
        nombre: body.nombre,
        sector: body.sector ?? null,
        contactos: body.contactos?.length
          ? {
              create: body.contactos.map((c) => ({
                nombre: c.nombre,
                cargo: c.cargo ?? null,
                email: c.email ?? null,
                telefono: c.telefono ?? null,
              })),
            }
          : undefined,
      },
      include: { contactos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
    });

    await auditLog({
      req,
      action: "create",
      entity: "Empresa",
      entityId: cliente.id,
      summary: `Cliente creado: ${cliente.nombre}`,
      data: body,
    });

    // Best-effort: if new emails were added, backfill Gmail for them.
    for (const c of body.contactos ?? []) {
      if (c.email) triggerBackfillForEmailAcrossMailboxes(c.email, app.log);
    }

    return reply.code(201).send({ cliente });
  });

  app.patch("/clientes/:id", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const schema = z.object({
      nombre: z.string().min(1).optional(),
      sector: z.string().nullable().optional(),
      contactos: z.array(contactoSchema).optional(),
    });
    const body = schema.parse(req.body);

    const existing = await prisma.empresa.findUnique({
      where: { id },
      include: { contactos: { where: { deletedAt: null } } },
    });
    if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });

    const cliente = await prisma.$transaction(async (tx) => {
      const updated = await tx.empresa.update({
        where: { id },
        data: {
          nombre: body.nombre ?? undefined,
          sector: body.sector ?? undefined,
        },
      });

      if (body.contactos) {
        const keepIds = new Set(body.contactos.map((c) => c.id).filter(Boolean) as string[]);
        await tx.contacto.updateMany({
          where: { empresaId: id, deletedAt: null, id: { notIn: Array.from(keepIds) } },
          data: { deletedAt: new Date() },
        });

        for (const c of body.contactos) {
          if (c.id && existing.contactos.some((x) => x.id === c.id)) {
            await tx.contacto.update({
              where: { id: c.id },
              data: {
                nombre: c.nombre,
                cargo: c.cargo ?? null,
                email: c.email ?? null,
                telefono: c.telefono ?? null,
                deletedAt: null,
              },
            });
          } else {
            await tx.contacto.create({
              data: {
                empresaId: id,
                nombre: c.nombre,
                cargo: c.cargo ?? null,
                email: c.email ?? null,
                telefono: c.telefono ?? null,
              },
            });
          }
        }
      }

      return await tx.empresa.findUniqueOrThrow({
        where: { id },
        include: { contactos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
      });
    });

    await auditLog({
      req,
      action: "update",
      entity: "Empresa",
      entityId: cliente.id,
      summary: `Cliente actualizado: ${cliente.nombre}`,
      data: body,
    });

    // Best-effort: if emails were provided/updated, backfill Gmail for them.
    for (const c of body.contactos ?? []) {
      if (c.email) triggerBackfillForEmailAcrossMailboxes(c.email, app.log);
    }

    return reply.send({ cliente });
  });
}

