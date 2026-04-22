import { useAuthStore } from "../state/useAuthStore";

export function useCanEdit() {
  return useAuthStore((s) => s.status === "authed" && (s.user?.role ?? "user") !== "viewer");
}

