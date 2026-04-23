import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).or(z.string().min(1)),
  JWT_EXPIRES_IN: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  GOOGLE_GMAIL_CALLBACK_URL: z.string().optional(),
  GOOGLE_PUBSUB_TOPIC: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  FRONTEND_URLS: z.string().optional(),
  ALLOWED_EMAILS: z.string().optional(),
  PORT: z.coerce.number().optional(),
});

export const env = envSchema.parse(process.env);

export const allowedEmails = (env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

