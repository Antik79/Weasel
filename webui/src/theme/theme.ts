export interface Theme {
  colors: {
    // Background colors
    background: {
      primary: string;
      secondary: string;
      tertiary: string;
      panel: string;
      modal: string;
      submenu: string;
    };
    // Text colors
    text: {
      primary: string;
      secondary: string;
      tertiary: string;
      muted: string;
    };
    // Border colors
    border: {
      default: string;
      hover: string;
      active: string;
      muted: string;
    };
    // Accent colors
    accent: {
      primary: string;
      hover: string;
      active: string;
    };
    // State colors
    state: {
      success: string;
      warning: string;
      error: string;
      info: string;
    };
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

export const weaselTheme: Theme = {
  colors: {
    background: {
      primary: '#030712',
      secondary: '#0f172a',
      tertiary: '#1e293b',
      panel: 'rgba(15, 23, 42, 0.8)',
      modal: '#0f172a',
      submenu: 'rgba(15, 23, 42, 0.5)',
    },
    text: {
      primary: '#ffffff',
      secondary: '#e2e8f0',
      tertiary: '#cbd5e1',
      muted: '#94a3b8',
    },
    border: {
      default: 'rgba(148, 163, 184, 0.3)',
      hover: 'rgba(148, 163, 184, 0.4)',
      active: '#38bdf8',
      muted: 'rgba(148, 163, 184, 0.12)',
    },
    accent: {
      primary: '#38bdf8',
      hover: '#0ea5e9',
      active: '#2563eb',
    },
    state: {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  borderRadius: {
    sm: '0.4rem',
    md: '0.5rem',
    lg: '0.75rem',
    full: '999px',
  },
  shadows: {
    sm: '0 15px 30px rgba(2, 6, 23, 0.35)',
    md: '0 20px 45px rgba(2, 6, 23, 0.45)',
    lg: '0 30px 60px rgba(2, 6, 23, 0.7)',
    xl: '0 40px 80px rgba(2, 6, 23, 0.9)',
  },
};

export const darkTheme: Theme = {
  colors: {
    background: {
      primary: '#000000',
      secondary: '#0a0a0a',
      tertiary: '#1a1a1a',
      panel: 'rgba(10, 10, 10, 0.8)',
      modal: '#0a0a0a',
      submenu: 'rgba(10, 10, 10, 0.5)',
    },
    text: {
      primary: '#ffffff',
      secondary: '#e5e5e5',
      tertiary: '#d4d4d4',
      muted: '#a3a3a3',
    },
    border: {
      default: 'rgba(163, 163, 163, 0.3)',
      hover: 'rgba(163, 163, 163, 0.4)',
      active: '#60a5fa',
      muted: 'rgba(163, 163, 163, 0.12)',
    },
    accent: {
      primary: '#60a5fa',
      hover: '#3b82f6',
      active: '#2563eb',
    },
    state: {
      success: '#34d399',
      warning: '#fbbf24',
      error: '#f87171',
      info: '#60a5fa',
    },
  },
  spacing: weaselTheme.spacing,
  borderRadius: weaselTheme.borderRadius,
  shadows: weaselTheme.shadows,
};

export const lightTheme: Theme = {
  colors: {
    background: {
      primary: '#ffffff',
      secondary: '#f8f9fa',
      tertiary: '#e9ecef',
      panel: 'rgba(248, 249, 250, 0.8)',
      modal: '#ffffff',
      submenu: 'rgba(248, 249, 250, 0.5)',
    },
    text: {
      primary: '#1a1a1a',
      secondary: '#4a4a4a',
      tertiary: '#6a6a6a',
      muted: '#9a9a9a',
    },
    border: {
      default: 'rgba(154, 154, 154, 0.3)',
      hover: 'rgba(154, 154, 154, 0.4)',
      active: '#3b82f6',
      muted: 'rgba(154, 154, 154, 0.12)',
    },
    accent: {
      primary: '#3b82f6',
      hover: '#2563eb',
      active: '#1d4ed8',
    },
    state: {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
    },
  },
  spacing: weaselTheme.spacing,
  borderRadius: weaselTheme.borderRadius,
  shadows: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.12)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
  },
};

export const defaultTheme = weaselTheme;

export type ThemeName = 'weasel' | 'dark' | 'light';

export const themes: Record<ThemeName, Theme> = {
  weasel: weaselTheme,
  dark: darkTheme,
  light: lightTheme,
};

