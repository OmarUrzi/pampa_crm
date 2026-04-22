import { apiFetch } from "./client";

export type ApiActividadFoto = {
  id: string;
  url: string;
  caption: string | null;
};

export type ApiActividad = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  duracion: string | null;
  capacidad: string | null;
  precioUsd: number | null;
  proveedorTxt: string | null;
  fotos: ApiActividadFoto[];
};

export async function apiListCatalogo() {
  return await apiFetch<{ actividades: ApiActividad[] }>("/catalogo");
}

export async function apiCreateActividad(input: {
  nombre: string;
  descripcion?: string;
  categoria: string;
  precioUsd?: number;
  proveedorTxt?: string;
  fotos?: Array<{ url: string; caption?: string }>;
}) {
  return await apiFetch<{ actividad: ApiActividad }>("/catalogo", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiPatchActividad(
  id: string,
  patch: Partial<{
    nombre: string;
    descripcion: string;
    categoria: string;
    precioUsd: number | null;
    proveedorTxt: string | null;
  }>,
) {
  return await apiFetch<{ actividad: ApiActividad }>(`/catalogo/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function apiDeleteActividad(id: string) {
  return await apiFetch<{ ok: boolean }>(`/catalogo/${id}`, { method: "DELETE" });
}

