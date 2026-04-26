import { apiFetch } from "./client";

export type AgenciaProfile = {
  id: string;
  name: string;
  tagline: string | null;
  about: string | null;
  contact: string | null;
  website: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgenciaAsset = {
  id: string;
  kind: string;
  label: string | null;
  filename: string | null;
  mime: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export async function apiAdminAgenciaGetProfile() {
  return await apiFetch<{ profile: AgenciaProfile | null }>("/admin/agencia/profile");
}

export async function apiAdminAgenciaPutProfile(input: {
  name: string;
  tagline?: string;
  about?: string;
  contact?: string;
  website?: string;
}) {
  return await apiFetch<{ profile: AgenciaProfile }>("/admin/agencia/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function apiAdminAgenciaGetAssets() {
  return await apiFetch<{ assets: AgenciaAsset[] }>("/admin/agencia/assets");
}

export async function apiAdminAgenciaUploadAsset(input: { kind: string; label?: string; file: File }) {
  const fd = new FormData();
  fd.append("kind", input.kind);
  if (input.label) fd.append("label", input.label);
  fd.append("file", input.file, input.file.name);
  return await apiFetch<{ asset: AgenciaAsset }>("/admin/agencia/assets", { method: "POST", body: fd });
}

export async function apiAdminAgenciaDeleteAsset(assetId: string) {
  return await apiFetch<{ ok: boolean }>(`/admin/agencia/assets/${assetId}`, { method: "DELETE" });
}

