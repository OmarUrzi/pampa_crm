import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { jwtVerifyGuard } from "../auth/jwtGuards.js";
import { getAiProviderKey, callOpenAiChat, callAnthropicClaude } from "../services/aiProviders.js";

// Placeholder: la fase real llamará a un modelo (Claude/GPT) con herramientas/datos.
export async function registerAiRoutes(app: FastifyInstance) {
  app.post("/ai/ask", async (req) => {
    const schema = z.object({
      eventoId: z.string().optional(),
      prompt: z.string().min(1),
    });
    const body = schema.parse(req.body);

    const response = mockAi(body.prompt);
    await prisma.aiPromptLog.create({
      data: {
        eventoId: body.eventoId ?? null,
        prompt: body.prompt,
        response,
      },
    });

    return { ok: true, response };
  });

  app.post("/ai/chat", { preHandler: jwtVerifyGuard }, async (req, reply) => {
    const schema = z.object({
      eventoId: z.string().min(1),
      prompt: z.string().min(1),
      provider: z.enum(["openai", "anthropic"]).optional(),
    });
    const body = schema.parse(req.body);

    const ev = await prisma.evento.findUnique({
      where: { id: body.eventoId },
      include: {
        empresa: true,
        cotizaciones: { where: { deletedAt: null }, include: { items: { where: { deletedAt: null } } } },
        pagos: { where: { deletedAt: null } },
        proveedores: { where: { deletedAt: null } },
        comms: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50 },
        chat: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, take: 30 },
      },
    });
    if (!ev || ev.deletedAt) return reply.code(404).send({ error: "not_found" });

    // Gmail messages relevant to this event (already filtered server-side).
    let gmailMsgs: any[] = [];
    try {
      const empresaContactos = await prisma.contacto.findMany({
        where: { empresaId: ev.empresaId, deletedAt: null, email: { not: null } },
        select: { email: true },
      });
      const emails = Array.from(
        new Set(
          [...empresaContactos]
            .map((x) => (x.email ?? "").trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      const evRef = (ev.contactoRef ?? "").trim().toLowerCase();
      if (evRef && evRef.includes("@")) emails.push(evRef);
      if (emails.length) {
        const or = [
          { fromEmail: { in: emails } },
          ...emails.map((e) => ({ toEmails: { contains: e } })),
        ] as any[];
        gmailMsgs = await prisma.gmailMessage.findMany({
          where: { OR: or },
          orderBy: [{ internalAt: "desc" }, { createdAt: "desc" }],
          take: 30,
          include: { mailbox: { select: { email: true } } },
        });
      }
    } catch {
      // ignore
    }

    const context = {
      evento: {
        id: ev.id,
        nombre: ev.nombre,
        empresa: ev.empresa?.nombre ?? null,
        fecha: (ev as any).fechaLabel ?? null,
        pax: ev.pax,
        status: ev.status,
        currency: ev.currency,
        cotizadoTotal: (ev as any).cotizadoTotal ?? null,
        costoEstimado: (ev as any).costoEstimado ?? null,
        contactoRef: ev.contactoRef ?? null,
      },
      cotizaciones: (ev.cotizaciones ?? []).map((v) => ({
        label: v.label,
        versionNo: v.versionNo,
        isCurrent: v.isCurrent,
        items: (v.items ?? []).map((it) => ({
          servicio: it.servicio,
          proveedor: it.proveedor,
          pax: it.pax,
          unitCur: it.unitCur,
          unit: it.unit,
        })),
      })),
      pagos: (ev.pagos ?? []).map((p) => ({ tipo: p.tipo, concepto: p.concepto, monto: p.monto, moneda: p.moneda, ok: p.ok, fecha: p.fechaLabel })),
      proveedoresPedidos: (ev.proveedores ?? []).map((p) => ({ proveedor: p.proveedorTxt, categoria: p.categoria, pedido: p.pedidoLabel, respondio: p.respondioLabel, monto: p.montoLabel, rating: p.rating })),
      comms: (ev.comms ?? []).map((c) => ({ tipo: c.tipo, dir: c.dir, de: c.de, msg: c.msg, hora: c.horaLabel })),
      gmail: gmailMsgs.map((m) => ({
        mailbox: m.mailbox.email,
        from: m.fromEmail,
        to: m.toEmails ? JSON.parse(m.toEmails) : [],
        subject: m.subject,
        snippet: m.snippet,
        at: (m.internalAt ?? m.createdAt).toISOString(),
      })),
    };

    const system = [
      "Sos un asistente para un CRM de eventos.",
      "Respondé en español, conciso y accionable.",
      "Usá el contexto provisto para responder. Si falta info, preguntá 1-2 cosas puntuales.",
    ].join(" ");

    const provider = body.provider ?? "openai";
    let answer = "";
    if (provider === "openai") {
      const apiKey = await getAiProviderKey("openai");
      if (!apiKey) return reply.code(400).send({ error: "openai_not_configured" });
      answer = await callOpenAiChat({
        apiKey,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Contexto JSON:\n${JSON.stringify(context)}\n\nPregunta:\n${body.prompt}` },
        ],
      });
    } else {
      const apiKey = await getAiProviderKey("anthropic");
      if (!apiKey) return reply.code(400).send({ error: "anthropic_not_configured" });
      answer = await callAnthropicClaude({
        apiKey,
        system,
        messages: [{ role: "user", content: `Contexto JSON:\n${JSON.stringify(context)}\n\nPregunta:\n${body.prompt}` }],
      });
    }

    await prisma.aiPromptLog.create({
      data: {
        eventoId: body.eventoId,
        prompt: body.prompt,
        response: answer,
      },
    });

    return reply.send({ ok: true, provider, response: answer });
  });
}

function mockAi(prompt: string) {
  const ql = prompt.toLowerCase();
  if (/margen|ganancia|profit/.test(ql)) return "Margen estimado: 41% (mock).";
  if (/proveedor|respond/.test(ql)) return "Proveedor pendiente: Hotel Llao Llao (mock).";
  if (/pago|saldo|seña/.test(ql)) return "Pendiente: saldo cliente + pago alojamiento (mock).";
  return "Puedo ayudarte con margen, proveedores y pagos (mock).";
}

