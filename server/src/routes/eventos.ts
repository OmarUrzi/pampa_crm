import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { requireWriteAccess } from "../auth/roleGuards.js";
import { auditLog } from "../audit.js";

export async function registerEventoRoutes(app: FastifyInstance) {
  // Minimal API para empezar a reemplazar data fake.

  app.get("/eventos", async () => {
    const eventos = await prisma.evento.findMany({
      orderBy: { createdAt: "desc" },
      where: { deletedAt: null },
      include: { empresa: true },
    });
    return { eventos };
  });

  app.get("/eventos/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const evento = await prisma.evento.findUnique({
      where: { id },
      include: {
        empresa: true,
        cotizaciones: {
          where: { deletedAt: null },
          include: { items: { where: { deletedAt: null } } },
          orderBy: { versionNo: "asc" },
        },
        pagos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        proveedores: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
        comms: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        chat: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!evento || evento.deletedAt) return reply.code(404).send({ error: "not_found" });
    return { evento };
  });

  // Gmail-derived communications for an event, matched by known contact emails.
  app.get("/eventos/:id/gmail-comms", { preHandler: jwtVerifyGuard }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const ev = await prisma.evento.findUnique({ where: { id } });
    if (!ev || ev.deletedAt) return reply.code(404).send({ error: "not_found" });

    const empresaContactos = await prisma.contacto.findMany({
      where: { empresaId: ev.empresaId, deletedAt: null, email: { not: null } },
      select: { email: true },
    });

    const provContactos = await prisma.proveedorContacto.findMany({
      where: {
        deletedAt: null,
        email: { not: null },
        proveedor: { pedidos: { some: { eventoId: ev.id, deletedAt: null } } },
      },
      select: { email: true },
      take: 200,
    });

    const emails = Array.from(
      new Set(
        [...empresaContactos, ...provContactos]
          .map((x) => (x.email ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    // If the event stores a direct contact reference that looks like an email, use it too.
    const evRef = (ev.contactoRef ?? "").trim().toLowerCase();
    if (evRef && evRef.includes("@")) emails.push(evRef);
    if (!emails.length) return { messages: [] };

    const or = [
      { fromEmail: { in: emails } },
      ...emails.map((e) => ({ toEmails: { contains: e } })),
    ] as any[];

    const messages = await prisma.gmailMessage.findMany({
      where: { OR: or },
      orderBy: [{ internalAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: { mailbox: { select: { email: true } } },
    });

    return {
      messages: messages.map((m) => ({
        id: m.id,
        mailbox: m.mailbox.email,
        fromEmail: m.fromEmail,
        toEmails: m.toEmails ? (JSON.parse(m.toEmails) as string[]) : [],
        subject: m.subject,
        snippet: m.snippet,
        at: m.internalAt ?? m.createdAt,
      })),
    };
  });

  app.post("/eventos", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const schema = z.object({
      empresaNombre: z.string().min(1),
      sector: z.string().optional(),
      nombre: z.string().min(1),
      contactoRef: z.string().optional(),
      locacion: z.string().min(1),
      fechaLabel: z.string().min(1),
      pax: z.number().int().positive(),
      status: z.enum(["consulta", "cotizando", "enviada", "negociacion", "confirmado", "perdido"]),
      currency: z.enum(["USD", "ARS"]),
      responsable: z.enum(["Laura", "Melanie"]),
      tipo: z.string().min(1),
    });
    const body = schema.parse(req.body);

    const empresa = await prisma.empresa.upsert({
      where: { nombre: body.empresaNombre },
      update: { sector: body.sector ?? undefined },
      create: { nombre: body.empresaNombre, sector: body.sector ?? null },
    });

    const evento = await prisma.evento.create({
      data: {
        empresaId: empresa.id,
        nombre: body.nombre,
        contactoRef: body.contactoRef ?? null,
        locacion: body.locacion,
        fechaLabel: body.fechaLabel,
        pax: body.pax,
        status: body.status,
        currency: body.currency,
        responsable: body.responsable,
        tipo: body.tipo,
      },
    });

    await auditLog({
      req,
      action: "create",
      entity: "Evento",
      entityId: evento.id,
      summary: `Evento creado: ${evento.nombre}`,
      data: body,
    });

    return reply.code(201).send({ evento });
  });

  app.patch("/eventos/:id", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const existing = await prisma.evento.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });

    const schema = z.object({
      nombre: z.string().min(1).optional(),
      contactoRef: z.string().nullable().optional(),
      locacion: z.string().min(1).optional(),
      fechaLabel: z.string().min(1).optional(),
      pax: z.number().int().nonnegative().optional(),
      status: z.enum(["consulta", "cotizando", "enviada", "negociacion", "confirmado", "perdido"]).optional(),
      currency: z.enum(["USD", "ARS"]).optional(),
      responsable: z.enum(["Laura", "Melanie"]).optional(),
      tipo: z.string().min(1).optional(),
      cotizadoTotal: z.number().int().nonnegative().optional(),
      costoEstimado: z.number().int().nonnegative().optional(),
    });
    const body = schema.parse(req.body);

    const evento = await prisma.evento.update({
      where: { id },
      data: {
        nombre: body.nombre ?? undefined,
        contactoRef: body.contactoRef ?? undefined,
        locacion: body.locacion ?? undefined,
        fechaLabel: body.fechaLabel ?? undefined,
        pax: body.pax ?? undefined,
        status: body.status ?? undefined,
        currency: body.currency ?? undefined,
        responsable: body.responsable ?? undefined,
        tipo: body.tipo ?? undefined,
        cotizadoTotal: body.cotizadoTotal ?? undefined,
        costoEstimado: body.costoEstimado ?? undefined,
      },
    });

    await auditLog({
      req,
      action: "update",
      entity: "Evento",
      entityId: evento.id,
      summary: `Evento actualizado: ${evento.nombre}`,
      data: body,
    });

    return reply.send({ evento });
  });

  app.delete("/eventos/:id", { preHandler: [jwtVerifyGuard, requireWriteAccess()] }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const existing = await prisma.evento.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return reply.code(404).send({ error: "not_found" });

    const evento = await prisma.evento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await auditLog({
      req,
      action: "soft_delete",
      entity: "Evento",
      entityId: evento.id,
      summary: `Evento borrado (soft): ${evento.nombre}`,
    });

    return reply.send({ ok: true });
  });
}

