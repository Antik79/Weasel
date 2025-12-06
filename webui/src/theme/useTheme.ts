import { useState, useEffect, useCallback } from 'react';
import { getUiPreferences, saveUiPreferences } from '../api/client';
import { defaultTheme, Theme, ThemeName, themes } from './theme';

// Apply theme CSS variables to document root
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  
  // Background colors
  root.style.setProperty('--color-bg-primary', theme.colors.background.primary);
  root.style.setProperty('--color-bg-secondary', theme.colors.background.secondary);
  root.style.setProperty('--color-bg-tertiary', theme.colors.background.tertiary);
  root.style.setProperty('--color-bg-panel', theme.colors.background.panel);
  root.style.setProperty('--color-bg-modal', theme.colors.background.modal);
  root.style.setProperty('--color-bg-submenu', theme.colors.background.submenu);
  
  // Text colors
  root.style.setProperty('--color-text-primary', theme.colors.text.primary);
  root.style.setProperty('--color-text-secondary', theme.colors.text.secondary);
  root.style.setProperty('--color-text-tertiary', theme.colors.text.tertiary);
  root.style.setProperty('--color-text-muted', theme.colors.text.muted);
  
  // Border colors
  root.style.setProperty('--color-border-default', theme.colors.border.default);
  root.style.setProperty('--color-border-hover', theme.colors.border.hover);
  root.style.setProperty('--color-border-active', theme.colors.border.active);
  root.style.setProperty('--color-border-muted', theme.colors.border.muted);
  
  // Accent colors
  root.style.setProperty('--color-accent-primary', theme.colors.accent.primary);
  root.style.setProperty('--color-accent-hover', theme.colors.accent.hover);
  root.style.setProperty('--color-accent-active', theme.colors.accent.active);
  
  // State colors
  root.style.setProperty('--color-success', theme.colors.state.success);
  root.style.setProperty('--color-warning', theme.colors.state.warning);
  root.style.setProperty('--color-error', theme.colors.state.error);
  root.style.setProperty('--color-info', theme.colors.state.info);
}

export function useTheme() {
  const [themeName, setThemeNameState] = useState<ThemeName>('weasel');
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Load theme from backend on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const prefs = await getUiPreferences();
        if (prefs.theme && (prefs.theme === 'weasel' || prefs.theme === 'dark' || prefs.theme === 'light')) {
          setThemeNameState(prefs.theme);
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      } finally {
        setInitialLoadComplete(true);
      }
    };
    loadTheme();
  }, []);

  // Apply theme when it changes
  useEffect(() => {
    const theme = themes[themeName];
    applyTheme(theme);
  }, [themeName]);

  // Set theme and persist to backend
  const setTheme = useCallback(async (newTheme: ThemeName) => {
    setThemeNameState(newTheme);

    if (initialLoadComplete) {
      try {
        const prefs = await getUiPreferences();
        await saveUiPreferences({
          ...prefs,
          theme: newTheme
        });
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    }
  }, [initialLoadComplete]);

  return {
    theme: themes[themeName],
    themeName,
    setTheme,
    availableThemes: Object.keys(themes) as ThemeName[]
  };
}

// Helper function to get CSS variable name
export function getThemeVar(category: keyof Theme['colors'], key: string): string {
  return `--color-${category}-${key}`;
}

