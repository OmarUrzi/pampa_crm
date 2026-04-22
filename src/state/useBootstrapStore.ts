import { create } from "zustand";

type BootstrapState = {
  isBootstrapping: boolean;
  setBootstrapping: (v: boolean) => void;
};

export const useBootstrapStore = create<BootstrapState>((set) => ({
  isBootstrapping: false,
  setBootstrapping: (v) => set({ isBootstrapping: v }),
}));

