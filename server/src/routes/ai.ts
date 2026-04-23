import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";

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
}

function mockAi(prompt: string) {
  const ql = prompt.toLowerCase();
  if (/margen|ganancia|profit/.test(ql)) return "Margen estimado: 41% (mock).";
  if (/proveedor|respond/.test(ql)) return "Proveedor pendiente: Hotel Llao Llao (mock).";
  if (/pago|saldo|seña/.test(ql)) return "Pendiente: saldo cliente + pago alojamiento (mock).";
  return "Puedo ayudarte con margen, proveedores y pagos (mock).";
}

