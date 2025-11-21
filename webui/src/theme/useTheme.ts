import { defaultTheme, Theme } from './theme';

export function useTheme(): Theme {
  // Could be extended to support theme switching in the future
  return defaultTheme;
}

// Helper function to get CSS variable name
export function getThemeVar(category: keyof Theme['colors'], key: string): string {
  return `--color-${category}-${key}`;
}

