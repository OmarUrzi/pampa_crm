import { create } from "zustand";

type NoticeVariant = "info" | "warning" | "error";

type NoticeState = {
  message: string | null;
  variant: NoticeVariant;
  show: (message: string, opts?: { variant?: NoticeVariant; ttlMs?: number }) => void;
  clear: () => void;
};

let t: ReturnType<typeof setTimeout> | null = null;

export const useNoticeStore = create<NoticeState>((set) => ({
  message: null,
  variant: "info",
  show: (message, opts) => {
    if (t) clearTimeout(t);
    set({ message, variant: opts?.variant ?? "info" });
    const ttlMs = opts?.ttlMs ?? 4500;
    t = setTimeout(() => set({ message: null }), ttlMs);
  },
  clear: () => {
    if (t) clearTimeout(t);
    t = null;
    set({ message: null });
  },
}));

