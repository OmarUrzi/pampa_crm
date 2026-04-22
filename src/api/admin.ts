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

