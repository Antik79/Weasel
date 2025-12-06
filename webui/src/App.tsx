import { useMemo, useState, useEffect, Suspense, lazy } from "react";
import useSWR from "swr";
import { GaugeCircle, FolderTree, Package, Settings as SettingsIcon, Wrench, FileText } from "lucide-react";
import logo from "./assets/weasel-logo.png";
import SystemDashboard from "./sections/SystemDashboard";
import PowerControls from "./sections/PowerControls";
import Login, { getAuthToken, clearAuthToken } from "./components/Login";
import { api, getSystemVersion } from "./api/client";
import { SystemStatus } from "./types";
import ToastContainer, { useToast } from "./components/Toast";
import { useTheme } from "./theme/useTheme";
// Import i18n directly to ensure it's in the main bundle (it uses React hooks)
import "./i18n/i18n";

// Lazy load section components
const FileExplorer = lazy(() => import("./sections/FileExplorer"));
const PackageManager = lazy(() => import("./sections/PackageManager"));
const Settings = lazy(() => import("./sections/Settings"));
const Tools = lazy(() => import("./sections/Tools"));
const Logs = lazy(() => import("./sections/Logs"));
const VncViewerPage = lazy(() => import("./pages/VncViewer"));
const TerminalPopupPage = lazy(() => import("./pages/TerminalPopup"));

// Global toast context
let globalToast: ((message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void) | null = null;

export function showToast(message: string, type: "success" | "error" | "info" | "warning" = "info", duration?: number) {
  if (globalToast) {
    globalToast(message, type, duration);
  }
}

type Tab = "files" | "packages" | "system" | "tools" | "logs" | "settings";

const tabOrder: Tab[] = ["system", "files", "packages", "tools", "logs", "settings"];

// Loading fallback component
const SectionLoadingFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
      <p className="text-sm text-slate-400">Loading...</p>
    </div>
  </div>
);

const tabConfig: Record<
  Tab,
  { label: string; icon: React.ReactNode; component: React.ComponentType }
> = {
  system: {
    label: "System",
    icon: <GaugeCircle size={16} />,
    component: SystemDashboard
  },
  files: {
    label: "Files",
    icon: <FolderTree size={16} />,
    component: FileExplorer
  },
  packages: {
    label: "Packages",
    icon: <Package size={16} />,
    component: PackageManager
  },
  tools: {
    label: "Tools",
    icon: <Wrench size={16} />,
    component: Tools
  },
  logs: {
    label: "Logs",
    icon: <FileText size={16} />,
    component: Logs
  },
  settings: {
    label: "Settings",
    icon: <SettingsIcon size={16} />,
    component: Settings
  }
};

export default function App() {
  // Initialize theme (loads from backend and applies CSS variables)
  useTheme();
  
  // Check if we're on the VNC viewer page
  const isVncViewer = window.location.pathname === "/vnc-viewer" || window.location.pathname.endsWith("/vnc-viewer");

  if (isVncViewer) {
    return (
      <Suspense fallback={
        <div className="w-screen h-screen bg-black flex items-center justify-center text-white">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p>Loading VNC viewer...</p>
          </div>
        </div>
      }>
        <VncViewerPage />
      </Suspense>
    );
  }

  // Check if we're on the Terminal popup page
  const isTerminalPopup = window.location.pathname === "/terminal-popup" || window.location.pathname.endsWith("/terminal-popup");

  if (isTerminalPopup) {
    return (
      <Suspense fallback={
        <div className="w-screen h-screen bg-slate-950 flex items-center justify-center text-white">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p>Loading terminal...</p>
          </div>
        </div>
      }>
        <TerminalPopupPage />
      </Suspense>
    );
  }

  const [tab, setTab] = useState<Tab>("system");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const ActiveComponent = tabConfig[tab].component;

  // Hash routing support - read hash on mount and when hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      if (!hash) return;

      // Parse hash format: /tab or /tab/subtab
      const parts = hash.split('/').filter(Boolean);
      const mainTab = parts[0] as Tab;

      // Validate and set main tab
      if (mainTab && tabConfig[mainTab]) {
        setTab(mainTab);
      }
    };

    // Handle initial hash on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update hash when tab changes
  useEffect(() => {
    // Don't update hash if it already matches the current tab
    const currentHash = window.location.hash.slice(1);
    const currentMainTab = currentHash.split('/').filter(Boolean)[0];

    if (currentMainTab !== tab) {
      // Only update the main tab part, preserve subtab if present
      const parts = currentHash.split('/').filter(Boolean);
      if (parts.length > 1) {
        // Has subtab, update main tab but keep subtab
        window.location.hash = `/${tab}/${parts.slice(1).join('/')}`;
      } else {
        // No subtab, just set main tab
        window.location.hash = `/${tab}`;
      }
    }
  }, [tab]);
  const content = useMemo(() => {
    // SystemDashboard is not lazy-loaded, render it directly
    if (tab === "system") {
      return <SystemDashboard />;
    }
    // Other components are lazy-loaded, wrap in Suspense
    return (
      <Suspense fallback={<SectionLoadingFallback />}>
        <ActiveComponent />
      </Suspense>
    );
  }, [tab, ActiveComponent]);
  const { toasts, showToast: showToastInternal, dismissToast } = useToast();

  useEffect(() => {
    globalToast = showToastInternal;
    return () => {
      globalToast = null;
    };
  }, [showToastInternal]);

  const { data: systemStatus, error: systemError } = useSWR<SystemStatus>(
    authenticated ? "/api/system/status" : null,
    () => api<SystemStatus>("/api/system/status"),
    { 
      refreshInterval: 5000,
      onError: (error) => {
        console.error("Failed to fetch system status:", error);
      }
    }
  );

  const { data: versionInfo } = useSWR<{ version: string; buildDate?: string }>(
    authenticated ? "/api/system/version" : null,
    () => getSystemVersion(),
    { revalidateOnFocus: false }
  );

  // Update browser title with hostname
  useEffect(() => {
    if (systemStatus?.hostname) {
      document.title = `Weasel @${systemStatus.hostname}`;
    }
  }, [systemStatus?.hostname]);

  useEffect(() => {
    // Check if authentication is required and if we have a token
    const checkAuth = async () => {
      const token = getAuthToken();
      
      // Make a test request to check if auth is required
      // We'll check the response status directly
      try {
        const csrfToken = localStorage.getItem("weasel.csrf") || "check";
        const response = await fetch("/api/system/status", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Weasel-Csrf": csrfToken,
            ...(token ? { "X-Weasel-Token": token } : {})
          }
        });

        if (response.status === 401) {
          // Authentication is required but we don't have a valid token
          if (token) {
            clearAuthToken(); // Clear invalid token
          }
          setAuthenticated(false);
          return;
        }
        
        if (response.ok) {
          // Request succeeded - either auth not required or we have valid token
          setAuthenticated(true);
        } else {
          // Other error - try to parse response to see if it's an auth error
          const text = await response.text();
          if (text.includes("Authentication required") || response.status === 401) {
            if (token) {
              clearAuthToken();
            }
            setAuthenticated(false);
          } else {
            // Other error - assume auth not required for now
            setAuthenticated(true);
          }
        }
      } catch (err: any) {
        console.error("Auth check error:", err);
        // On network error, if we have a token, assume we're authenticated
        // Otherwise, show login screen
        if (token) {
          setAuthenticated(true);
        } else {
          // Network error - assume auth not required (could be server down)
          setAuthenticated(true);
        }
      }
    };

    checkAuth();
  }, []);

  const handleLogin = () => {
    setAuthenticated(true);
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  // Show error if system status fails to load
  if (systemError && authenticated) {
    console.error("System status error:", systemError);
  }

  if (!authenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell space-y-4">
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img
            src={logo}
            alt="Weasel"
            className="h-12 w-12 rounded-lg border border-slate-800 shadow-lg object-cover"
          />
          <div>
            <p className="text-slate-400 uppercase tracking-[0.3em] text-xs">
              Weasel {versionInfo && <span className="text-slate-500">v{versionInfo.version}</span>}
            </p>
            <h1 className="text-3xl font-semibold text-white">
              {systemStatus ? systemStatus.hostname : "Connecting..."}
            </h1>
          </div>
        </div>
      </header>

      <nav className="flex gap-2">
        {tabOrder.map((key) => (
          <button
            key={key}
            className={`btn-outline ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {tabConfig[key].icon}
            {tabConfig[key].label}
          </button>
        ))}
      </nav>

      <main className="space-y-3">
        {content}
        {tab === "system" && <PowerControls />}
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

