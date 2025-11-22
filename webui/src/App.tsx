import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import { GaugeCircle, FolderTree, Package, Settings as SettingsIcon, Wrench } from "lucide-react";
import logo from "./assets/weasel-logo.png";
import FileExplorer from "./sections/FileExplorer";
import PackageManager from "./sections/PackageManager";
import SystemDashboard from "./sections/SystemDashboard";
import PowerControls from "./sections/PowerControls";
import Settings from "./sections/Settings";
import Tools from "./sections/Tools";
import Login, { getAuthToken, clearAuthToken } from "./components/Login";
import VncViewerPage from "./pages/VncViewer";
import { api, getSystemVersion } from "./api/client";
import { SystemStatus } from "./types";
import ToastContainer, { useToast } from "./components/Toast";

// Global toast context
let globalToast: ((message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void) | null = null;

export function showToast(message: string, type: "success" | "error" | "info" | "warning" = "info", duration?: number) {
  if (globalToast) {
    globalToast(message, type, duration);
  }
}

type Tab = "files" | "packages" | "system" | "tools" | "settings";

const tabOrder: Tab[] = ["system", "files", "packages", "tools", "settings"];

const tabConfig: Record<
  Tab,
  { label: string; icon: React.ReactNode; component: JSX.Element }
> = {
  system: {
    label: "System",
    icon: <GaugeCircle size={16} />,
    component: <SystemDashboard />
  },
  files: {
    label: "Files",
    icon: <FolderTree size={16} />,
    component: <FileExplorer />
  },
  packages: {
    label: "Packages",
    icon: <Package size={16} />,
    component: <PackageManager />
  },
  tools: {
    label: "Tools",
    icon: <Wrench size={16} />,
    component: <Tools />
  },
  settings: {
    label: "Settings",
    icon: <SettingsIcon size={16} />,
    component: <Settings />
  }
};

export default function App() {
  // Check if we're on the VNC viewer page
  const isVncViewer = window.location.pathname === "/vnc-viewer" || window.location.pathname.endsWith("/vnc-viewer");
  
  if (isVncViewer) {
    return <VncViewerPage />;
  }

  const [tab, setTab] = useState<Tab>("system");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const content = useMemo(() => tabConfig[tab].component, [tab]);
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

  useEffect(() => {
    // Check if authentication is required and if we have a token
    const checkAuth = async () => {
      const token = getAuthToken();
      if (!token) {
        // Try to check if auth is required by making a request
        try {
          await api("/api/system/status");
          setAuthenticated(true);
        } catch (err: any) {
          console.error("Auth check error:", err);
          if (err.message?.includes("Authentication required") || err.message?.includes("401")) {
            setAuthenticated(false);
          } else {
            // Auth not required or other error - still show UI
            setAuthenticated(true);
          }
        }
      } else {
        // We have a token, verify it works
        try {
          await api("/api/system/status");
          setAuthenticated(true);
        } catch (err: any) {
          console.error("Token verification error:", err);
          if (err.message?.includes("Authentication required") || err.message?.includes("401")) {
            clearAuthToken();
            setAuthenticated(false);
          } else {
            setAuthenticated(true);
          }
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
              Weasel
            </p>
            <h1 className="text-3xl font-semibold text-white">
              Remote Device Console
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-mono">
              {systemStatus ? (
                <>@{systemStatus.hostname} ({systemStatus.ipAddress})</>
              ) : (
                "Connecting..."
              )}
            </p>
            {versionInfo && (
              <p className="text-xs text-slate-500 mt-0.5">
                v{versionInfo.version}
              </p>
            )}
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

