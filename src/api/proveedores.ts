import { apiFetch } from "./client";
import type { Proveedor } from "../types";

type ApiProveedor = {
  id: string;
  nombre: string;
  categoria: string | null;
  contactos: Array<{
    id: string;
    nombre: string;
    email: string | null;
    telefono: string | null;
  }>;
};

function mapProveedor(p: ApiProveedor): Proveedor {
  return {
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria ?? "",
    contactos: (p.contactos ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      email: c.email ?? undefined,
      telefono: c.telefono ?? undefined,
    })),
  };
}

export async function apiListProveedores(): Promise<Proveedor[]> {
  const res = await apiFetch<{ proveedores: ApiProveedor[] }>("/proveedores");
  return res.proveedores.map(mapProveedor);
}

export async function apiCreateProveedor(input: {
  nombre: string;
  categoria?: string;
  contactos?: Array<{ nombre: string; email?: string; telefono?: string }>;
}): Promise<Proveedor> {
  const res = await apiFetch<{ proveedor: ApiProveedor }>("/proveedores", {
    method: "POST",
    body: JSON.stringify({
      nombre: input.nombre,
      categoria: input.categoria || undefined,
      contactos: input.contactos?.length ? input.contactos : undefined,
    }),
  });
  return mapProveedor(res.proveedor);
}

export async function apiPatchProveedor(
  id: string,
  patch: Partial<{
    nombre: string;
    categoria: string | null;
    contactos: Array<{ nombre: string; email?: string; telefono?: string }>;
  }>,
): Promise<Proveedor> {
  const res = await apiFetch<{ proveedor: ApiProveedor }>(`/proveedores/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return mapProveedor(res.proveedor);
}

export async function apiDeleteProveedor(id: string): Promise<void> {
  await apiFetch(`/proveedores/${id}`, { method: "DELETE" });
}

