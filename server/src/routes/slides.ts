import type { FastifyInstance } from "fastify";
import { z } from "zod";

// Placeholder: la fase real usará Google Slides API + template.
export async function registerSlidesRoutes(app: FastifyInstance) {
  app.post("/slides/generate", async (req) => {
    const schema = z.object({
      eventoId: z.string().min(1).optional(),
      prompt: z.string().min(1),
    });
    const body = schema.parse(req.body);

    return {
      ok: true,
      mode: "mock",
      message: "Generación de Google Slides (simulada).",
      input: body,
      url: "https://docs.google.com/presentation/d/FAKE_DECK_ID/edit",
    };
  });
}

