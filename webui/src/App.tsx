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
import { api } from "./api/client";
import { SystemStatus } from "./types";

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
  const [tab, setTab] = useState<Tab>("system");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const content = useMemo(() => tabConfig[tab].component, [tab]);

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
    <div className="app-shell space-y-6">
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

      <main className="space-y-4">
        {content}
        {tab === "system" && <PowerControls />}
      </main>
    </div>
  );
}

