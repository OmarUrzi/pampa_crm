import { apiFetch } from "./client";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user" | "viewer";
  createdAt: string;
  updatedAt: string;
};

export async function apiAdminListUsers() {
  return await apiFetch<{ users: AdminUser[] }>("/admin/users");
}

export async function apiAdminPatchUserRole(id: string, role: AdminUser["role"]) {
  return await apiFetch<{ user: Pick<AdminUser, "id" | "email" | "name" | "role"> }>(`/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export type AiProvider = "openai" | "anthropic";
export type AiProviderRow = {
  provider: AiProvider;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export async function apiAdminListAiProviders() {
  return await apiFetch<{ providers: AiProviderRow[] }>("/admin/ai-providers");
}

export async function apiAdminUpsertAiProvider(provider: AiProvider, apiKey: string) {
  return await apiFetch<{ provider: AiProviderRow }>(`/admin/ai-providers/${provider}`, {
    method: "PUT",
    body: JSON.stringify({ apiKey }),
  });
}

