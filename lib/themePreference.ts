import { Storage } from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

/** 'system' follows the device's light/dark setting; the other two override it. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'themePreference';

let preference: ThemePreference = 'system';
const listeners = new Set<() => void>();

// Overriding the app-wide color scheme (rather than keeping our own) means
// useColorScheme, and so lib/theme's useColors, picks the change up as is.
function apply(next: ThemePreference) {
  preference = next;
  Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
  listeners.forEach((listener) => listener());
}

/** Restores the saved preference. Synchronous, so it can run before the first render. */
export function loadThemePreference() {
  try {
    const stored = Storage.getItemSync(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') apply(stored);
  } catch {
    // Unreadable storage just means following the device setting.
  }
}

export function setThemePreference(next: ThemePreference) {
  apply(next);
  try {
    Storage.setItemSync(STORAGE_KEY, next);
  } catch {
    // The choice still applies for this session.
  }
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preference
  );
}
