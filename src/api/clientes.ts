import { apiFetch } from "./client";

export type ApiContacto = {
  id: string;
  nombre: string;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
};

export type ApiCliente = {
  id: string;
  nombre: string;
  sector: string | null;
  contactos: ApiContacto[];
  createdAt: string;
  updatedAt: string;
};

export async function apiListClientes() {
  return await apiFetch<{ clientes: ApiCliente[] }>("/clientes");
}

export async function apiCreateCliente(input: {
  nombre: string;
  sector?: string;
  contactos?: Array<{ id?: string; nombre: string; cargo?: string; email?: string; telefono?: string }>;
}) {
  return await apiFetch<{ cliente: ApiCliente }>("/clientes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiPatchCliente(
  id: string,
  patch: Partial<{
    nombre: string;
    sector: string | null;
    contactos: Array<{ id?: string; nombre: string; cargo?: string; email?: string; telefono?: string }>;
  }>,
) {
  return await apiFetch<{ cliente: ApiCliente }>(`/clientes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

