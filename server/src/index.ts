import "dotenv/config";

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "./config";
import { registerAuthRoutes } from "./routes/auth";
import { registerEventoRoutes } from "./routes/eventos";
import { registerCatalogoRoutes } from "./routes/catalogo";
import { registerCotizacionesRoutes } from "./routes/cotizaciones";
import { registerProveedoresRoutes } from "./routes/proveedores";
import { registerPagosRoutes } from "./routes/pagos";
import { registerCommsRoutes } from "./routes/comms";
import { registerChatRoutes } from "./routes/chat";
import { registerAuditRoutes } from "./routes/audit";
import { registerSlidesRoutes } from "./routes/slides";
import { registerAiRoutes } from "./routes/ai";
import { registerAdminRoutes } from "./routes/admin";
import { registerMailboxRoutes } from "./routes/mailboxes";

const app = Fastify({
  logger: true,
});

app.addHook("onRequest", async (req) => {
  // eslint-disable-next-line no-console
  console.info("[req]", { id: req.id, method: req.method, url: req.url });
});

app.addHook("onSend", async (req, reply, payload) => {
  // Make request correlation available to the client for debugging.
  try {
    reply.header("x-request-id", req.id);
  } catch {
    // ignore
  }
  return payload;
});

await app.register(cors, {
  origin: (origin, cb) => {
    // allow non-browser tools (no Origin header)
    if (!origin) return cb(null, true);
    const allow = new Set<string>();
    if (env.FRONTEND_URL) allow.add(env.FRONTEND_URL.replace(/\/$/, ""));
    for (const u of (env.FRONTEND_URLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      allow.add(u.replace(/\/$/, ""));
    }
    // dev defaults
    const devOk = (env.NODE_ENV ?? "development") !== "production"
      ? /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
      : false;
    const envOk = allow.has(origin.replace(/\/$/, ""));
    if (devOk || envOk) return cb(null, origin); // reflect exact origin
    return cb(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["content-type", "authorization"],
});

await app.register(cookie);

await app.register(jwt, {
  secret: env.JWT_SECRET,
});

await app.register(swagger, {
  openapi: {
    info: {
      title: "Pampa CRM API",
      version: "0.0.0",
    },
  },
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
});

await registerAuthRoutes(app);
await registerEventoRoutes(app);
await registerCatalogoRoutes(app);
await registerCotizacionesRoutes(app);
await registerProveedoresRoutes(app);
await registerPagosRoutes(app);
await registerCommsRoutes(app);
await registerChatRoutes(app);
await registerAuditRoutes(app);
await registerSlidesRoutes(app);
await registerAiRoutes(app);
await registerAdminRoutes(app);
await registerMailboxRoutes(app);

app.get("/health", async () => ({ ok: true }));

const port = env.PORT ?? 8787;
await app.listen({ port, host: "0.0.0.0" });

