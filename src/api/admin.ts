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

export type AiProvider = "openai" | "anthropic" | "gemini";
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

export type AgencyProfile = {
  id: string;
  name: string;
  tagline: string | null;
  about: string | null;
  contact: string | null;
  website: string | null;
  updatedAt: string;
};

export type AgencyAssetKind = "logo_square" | "logo_wide" | "photo";
export type AgencyAssetRow = {
  id: string;
  kind: AgencyAssetKind;
  label: string | null;
  filename: string | null;
  mime: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export async function apiAdminGetAgencyProfile() {
  return await apiFetch<{ profile: AgencyProfile | null }>("/admin/agencia/profile");
}

export async function apiAdminUpsertAgencyProfile(input: {
  name: string;
  tagline?: string;
  about?: string;
  contact?: string;
  website?: string;
}) {
  return await apiFetch<{ profile: AgencyProfile }>("/admin/agencia/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function apiAdminListAgencyAssets() {
  return await apiFetch<{ assets: AgencyAssetRow[] }>("/admin/agencia/assets");
}

export async function apiAdminUploadAgencyAsset(input: { kind: AgencyAssetKind; file: File; label?: string }) {
  const fd = new FormData();
  fd.append("kind", input.kind);
  if (input.label) fd.append("label", input.label);
  fd.append("file", input.file, input.file.name);
  return await apiFetch<{ asset: AgencyAssetRow }>("/admin/agencia/assets", { method: "POST", body: fd });
}

export async function apiAdminDeleteAgencyAsset(assetId: string) {
  return await apiFetch<{ ok: boolean }>(`/admin/agencia/assets/${assetId}`, { method: "DELETE" });
}

