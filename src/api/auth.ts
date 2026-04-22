import { apiFetch } from "./client";
import { withRetry } from "./retry";

export type SessionUser = { id: string | null; email: string; name?: string | null; role: "admin" | "user" | "viewer" };

export async function apiAuthSession() {
  return await withRetry(() => apiFetch<{ user: SessionUser | null }>("/auth/session"), { attempts: 2 });
}

export async function apiDevLogin(input: { email: string; name?: string }) {
  return await apiFetch<{ token: string }>("/auth/dev-login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

