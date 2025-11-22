import { useMemo, useState, useCallback } from "react";
import useSWR from "swr";
import { XCircle, Monitor } from "lucide-react";
import { api } from "../api/client";
import { ProcessInfo, ApplicationMonitorConfig } from "../types";
import { formatBytes, formatDate } from "../utils/format";
import Table, { TableColumn } from "../components/Table";
import { showToast } from "../App";
import ConfirmDialog from "../components/ConfirmDialog";

const fetcher = () => api<ProcessInfo[]>("/api/processes");

export default function TaskManager() {
  const [query, setQuery] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    variant: "info"
  });
  const [processToKill, setProcessToKill] = useState<number | null>(null);
  const { data, isLoading, mutate } = useSWR("processes", fetcher, {
    refreshInterval: 5000
  });

  const processes = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    if (!query) return data;
    return data.filter((proc) =>
      proc.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [data, query]);

  const kill = async (pid: number) => {
    setProcessToKill(pid);
    setConfirmDialog({
      isOpen: true,
      title: "Terminate Process",
      message: `Are you sure you want to terminate process ${pid}? This cannot be undone.`,
      onConfirm: async () => {
        if (processToKill === null) return;
        try {
          await api(`/api/processes/${processToKill}`, { method: "DELETE" });
          await mutate();
          showToast(`Process ${processToKill} terminated successfully`, "success");
          setProcessToKill(null);
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        } catch (error) {
          showToast(`Failed to terminate process: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        }
      },
      variant: "danger"
    });
  };

  const addToApplicationMonitor = useCallback(async (process: ProcessInfo) => {
    if (!process.executablePath) {
      showToast(`Cannot add process "${process.name}" to Application Monitor: executable path is not available.`, "error");
      return;
    }

    try {
      // Fetch current config
      const currentConfig = await api<ApplicationMonitorConfig>("/api/application-monitor/config");
      
      // Check if already exists
      const existingApp = currentConfig.applications?.find(
        app => app.executablePath?.toLowerCase() === process.executablePath?.toLowerCase()
      );
      
      if (existingApp) {
        showToast(`Process "${process.name}" is already in Application Monitor.`, "error");
        return;
      }

      // Add new application
      const newApp = {
        id: crypto.randomUUID(),
        name: process.name,
        executablePath: process.executablePath,
        arguments: null,
        workingDirectory: null,
        enabled: true,
        checkIntervalSeconds: 60,
        restartDelaySeconds: 5,
        logPath: null,
        eventLogSource: null
      };

      const updatedConfig: ApplicationMonitorConfig = {
        ...currentConfig,
        applications: [...(currentConfig.applications || []), newApp]
      };

      // Save config
      await api("/api/application-monitor/config", {
        method: "PUT",
        body: JSON.stringify(updatedConfig)
      });

      showToast(`Process "${process.name}" has been added to Application Monitor. You can configure it in Tools → Application Monitor.`, "success");
    } catch (err) {
      console.error("Failed to add process to Application Monitor:", err);
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Failed to add process to Application Monitor: ${message}`, "error");
    }
  }, []);

  const columns: TableColumn<ProcessInfo>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      sortFn: (a, b) => a.name.localeCompare(b.name),
      render: (p) => <span className="text-white">{p.name}</span>
    },
    {
      key: "id",
      label: "PID",
      sortable: true,
      sortFn: (a, b) => a.id - b.id,
      render: (p) => <span>{p.id}</span>
    },
    {
      key: "workingSetBytes",
      label: "Memory",
      sortable: true,
      sortFn: (a, b) => a.workingSetBytes - b.workingSetBytes,
      render: (p) => <span>{formatBytes(p.workingSetBytes)}</span>
    },
    {
      key: "startTime",
      label: "Started",
      sortable: true,
      sortFn: (a, b) => {
        if (!a.startTime && !b.startTime) return 0;
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      },
      render: (p) => <span>{p.startTime ? formatDate(p.startTime) : "N/A"}</span>
    },
    {
      key: "responding",
      label: "Status",
      sortable: true,
      sortFn: (a, b) => (a.responding ? 1 : 0) - (b.responding ? 1 : 0),
      render: (p) => <span>{p.responding ? "Responding" : "Not responding"}</span>
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (p) => (
        <div className="text-right flex items-center gap-2 justify-end">
          {p.executablePath && (
            <button
              className="icon-btn"
              onClick={() => addToApplicationMonitor(p)}
              title="Add to Application Monitor"
            >
              <Monitor size={16} />
            </button>
          )}
          <button className="icon-btn" onClick={() => kill(p.id)} title="Terminate">
            <XCircle size={16} />
          </button>
        </div>
      )
    }
  ];

  return (
    <section className="panel space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="panel-title mb-0">Task Manager</h3>
        <input
          className="bg-slate-900 border border-slate-800 rounded px-3 py-1 text-sm text-white"
          placeholder="Filter by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Table
        data={processes}
        columns={columns}
        keyExtractor={(p) => p.id}
        isLoading={isLoading}
        emptyMessage="No processes match your filter."
        maxHeight="max-h-80"
      />
    </section>
  );
}

