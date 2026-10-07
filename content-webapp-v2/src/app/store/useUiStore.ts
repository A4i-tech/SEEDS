import { create } from 'zustand';

interface UiState {
  railCollapsed: boolean;
  toggleRail: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  railCollapsed: false,
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
}));
