import { create } from 'zustand';

interface ContentDrawerState {
  isOpen: boolean;
  confId: string | null;
  open: (confId?: string) => void;
  close: () => void;
}

export const useContentDrawerStore = create<ContentDrawerState>((set) => ({
  isOpen: false,
  confId: null,
  open: (confId) => set({ isOpen: true, confId: confId ?? null }),
  close: () => set({ isOpen: false }),
}));
