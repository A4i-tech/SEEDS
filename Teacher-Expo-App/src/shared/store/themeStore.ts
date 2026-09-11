import { secureStorage } from '@shared/services/secureStorage';
import { Appearance } from 'react-native';
import { create } from 'zustand';

const THEME_KEY = 'themeMode';

interface ThemeState {
  mode: 'light' | 'dark';
  hydrate: () => Promise<void>;
  toggle: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',

  hydrate: async () => {
    const stored = await secureStorage.getItemAsync(THEME_KEY);
    if (stored === 'light' || stored === 'dark') set({ mode: stored });
  },

  toggle: async () => {
    const mode = get().mode === 'dark' ? 'light' : 'dark';
    set({ mode });
    await secureStorage.setItemAsync(THEME_KEY, mode);
  },
}));
