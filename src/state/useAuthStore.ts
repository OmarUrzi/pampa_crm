import { create } from "zustand";
import { apiAuthSession, apiDevLogin, type SessionUser } from "../api/auth";
import { getToken, setToken } from "../api/client";
import { clearPersisted } from "./persist";

type AuthStatus = "unknown" | "authed" | "anon";

type AuthState = {
  status: AuthStatus;
  user: SessionUser | null;
  bootstrap: () => Promise<void>;
  loginDev: (input: { email: string; name?: string }) => Promise<void>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "unknown",
  user: null,
  bootstrap: async () => {
    if ((useAuthStore as any)._bootPromise) return (useAuthStore as any)._bootPromise as Promise<void>;
    const p = (async () => {
    const token = getToken();
    if (!token) {
      set({ status: "anon", user: null });
      return;
    }
    try {
      const { user } = await apiAuthSession();
      if (!user) {
        setToken(null);
        set({ status: "anon", user: null });
        return;
      }
      set({ status: "authed", user });
    } catch {
      // Si falla la sesión, dejamos anon. (token se limpia en apiFetch si fuese 401)
      set({ status: "anon", user: null });
    }
    })().finally(() => {
      (useAuthStore as any)._bootPromise = null;
    });
    (useAuthStore as any)._bootPromise = p;
    return p;
  },
  loginDev: async (input) => {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new Error("email_required");
    const { token } = await apiDevLogin({ email, name: input.name?.trim() || undefined });
    setToken(token);
    await useAuthStore.getState().bootstrap();
  },
  logout: () => {
    setToken(null);
    clearPersisted();
    set({ status: "anon", user: null });
  },
}));

