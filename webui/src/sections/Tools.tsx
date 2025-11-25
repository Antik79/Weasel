import { useEffect, useMemo, useState, useCallback, useRef, Suspense, lazy } from "react";
import useSWR from "swr";
import { Camera, Image as ImageIcon, Trash2, RefreshCw, FileText, HardDrive, AlertTriangle, Save, XCircle, Folder, FolderOpen, Monitor, Wrench, Clock, Eye, Download, CheckSquare, Square, Monitor as MonitorIcon, Eye as EyeIcon, Shield, ChevronDown, ChevronUp, ChevronRight, Edit2, ArrowUp, ArrowDown, Search as SearchIcon, Archive, Terminal, X, ExternalLink } from "lucide-react";
import { api, download, createTerminal, closeTerminal } from "../api/client";

// Lazy load TerminalViewer - only loads when Terminal tab is active
const TerminalViewer = lazy(() => import("../components/TerminalViewer"));
import { FileSystemItem, CaptureSettings, DiskMonitoringConfig, DiskMonitoringStatus, DriveAlertStatus, DriveMonitorConfig, FolderMonitorOptions, ProcessInfo, ApplicationMonitorConfig, MonitoredApplication, VncConfig, VncStatus, TerminalSession, LogsResponse, LogFileInfo } from "../types";
import { formatBytes, formatDate, formatPath } from "../utils/format";
import FilePicker from "../components/FilePicker";
import FolderPicker from "../components/FolderPicker";
import Table, { TableColumn } from "../components/Table";
import { LogPanel } from "../components/LogPanel";
import { useTranslation } from "../i18n/i18n";
import { useTheme, type Theme } from "../theme";
import { showToast } from "../App";
import ConfirmDialog from "../components/ConfirmDialog";

// UUID generator with polyfill for environments without crypto.randomUUID
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

type ToolsTab = "application-monitor" | "storage-monitor" | "terminal" | "vnc" | "screenshots";

type TranslateFn = (key: string, replacements?: Record<string, string | number>) => string;

const captureFetcher = () => api<CaptureSettings>("/api/settings/capture");

const buildRawUrl = (path: string) => {
  const url = new URL("/api/fs/raw", window.location.origin);
  url.searchParams.set("path", path);
  return url.toString();
};

export default function Tools() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [tab, setTab] = useState<ToolsTab>("screenshots");
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null);
  const [isSavingCapture, setIsSavingCapture] = useState(false);
  const [selectedScreenshots, setSelectedScreenshots] = useState<Set<string>>(new Set());

  // Hash routing support for subtabs
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      if (!hash) return;

      // Parse hash format: /tools/subtab
      const parts = hash.split('/').filter(Boolean);
      if (parts[0] === 'tools' && parts[1]) {
        const subtab = parts[1] as ToolsTab;
        // Validate subtab exists
        const validSubtabs: ToolsTab[] = ["application-monitor", "storage-monitor", "terminal", "vnc", "screenshots"];
        if (validSubtabs.includes(subtab)) {
          setTab(subtab);
        }
      }
    };

    // Handle initial hash on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update hash when subtab changes
  useEffect(() => {
    const currentHash = window.location.hash.slice(1);
    const parts = currentHash.split('/').filter(Boolean);

    // Only update if we're on the tools tab and the subtab is different
    if (parts[0] === 'tools' && parts[1] !== tab) {
      window.location.hash = `/tools/${tab}`;
    }
  }, [tab]);
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
    onConfirm: () => { },
    variant: "info"
  });

  const { data: captureSettings, mutate: mutateCapture } = useSWR("capture-settings", captureFetcher);
  const folder = captureSettings?.folder ?? "";

  const [timedScreenshotSettings, setTimedScreenshotSettings] = useState({
    enableIntervalCapture: false,
    intervalSeconds: 60
  });

  useEffect(() => {
    if (captureSettings) {
      setTimedScreenshotSettings({
        enableIntervalCapture: captureSettings.enableIntervalCapture ?? false,
        intervalSeconds: captureSettings.intervalSeconds ?? 60
      });
    }
  }, [captureSettings]);

  const {
    data: files,
    isLoading,
    mutate
  } = useSWR<FileSystemItem[]>(folder ? ["screenshots", folder] : null, ([, path]: [string, string]) => {
    const url = new URL("/api/fs", window.location.origin);
    url.searchParams.set("path", path);
    return api<FileSystemItem[]>(url.toString());
  }, { revalidateOnFocus: false });

  const images = useMemo(() => {
    if (!files || !Array.isArray(files)) return [];
    return files.filter((f) => f.name.toLowerCase().endsWith(".png"));
  }, [files]);


  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const openPreview = (file: FileSystemItem) => {
    setPreview({ path: file.fullPath, url: buildRawUrl(file.fullPath) });
  };

  const [screenshotToDelete, setScreenshotToDelete] = useState<FileSystemItem | null>(null);

  const deleteScreenshot = async (file: FileSystemItem) => {
    setScreenshotToDelete(file);
    setConfirmDialog({
      isOpen: true,
      title: "Delete Screenshot",
      message: t("tools.screenshots.deleteConfirm", { name: file.name }),
      onConfirm: async () => {
        if (!screenshotToDelete) return;
        try {
          const url = new URL("/api/fs", window.location.origin);
          url.searchParams.set("path", screenshotToDelete.fullPath);
          await api(url.toString(), { method: "DELETE" });
          if (preview?.path === screenshotToDelete.fullPath) {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }
          setSelectedScreenshots(prev => {
            const next = new Set(prev);
            next.delete(screenshotToDelete.fullPath);
            return next;
          });
          await mutate?.();
          showToast("Screenshot deleted successfully", "success");
          setScreenshotToDelete(null);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          showToast(`Failed to delete screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
      },
      variant: "danger"
    });
  };

  const toggleScreenshotSelection = (fullPath: string) => {
    setSelectedScreenshots(prev => {
      const next = new Set(prev);
      if (next.has(fullPath)) {
        next.delete(fullPath);
      } else {
        next.add(fullPath);
      }
      return next;
    });
  };

  const selectAllScreenshots = () => {
    setSelectedScreenshots(new Set(images.map(img => img.fullPath)));
  };

  const clearScreenshotSelection = () => {
    setSelectedScreenshots(new Set());
  };

  const downloadSelectedScreenshots = async () => {
    if (selectedScreenshots.size === 0) return;

    try {
      const paths = Array.from(selectedScreenshots);
      const csrfToken = localStorage.getItem("weasel.csrf") || "local";
      const authToken = localStorage.getItem("weasel.auth.token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Weasel-Csrf": csrfToken
      };
      if (authToken) {
        headers["X-Weasel-Token"] = authToken;
      }

      const response = await fetch("/api/fs/download/bulk", {
        method: "POST",
        headers,
        body: JSON.stringify({ paths })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screenshots_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setSelectedScreenshots(new Set());
    } catch (err) {
      showToast(`Failed to download screenshots: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const deleteSelectedScreenshots = async () => {
    if (selectedScreenshots.size === 0) return;

    const count = selectedScreenshots.size;
    setConfirmDialog({
      isOpen: true,
      title: "Delete Screenshots",
      message: `Delete ${count} screenshot${count > 1 ? 's' : ''}?`,
      onConfirm: async () => {

        try {
          const paths = Array.from(selectedScreenshots);
          for (const path of paths) {
            const url = new URL("/api/fs", window.location.origin);
            url.searchParams.set("path", path);
            await api(url.toString(), { method: "DELETE" });
            if (preview?.path === path) {
              URL.revokeObjectURL(preview.url);
              setPreview(null);
            }
          }
          setSelectedScreenshots(new Set());
          await mutate?.();
          showToast(`Deleted ${count} screenshot${count > 1 ? 's' : ''} successfully`, "success");
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          showToast(`Failed to delete screenshots: ${err instanceof Error ? err.message : String(err)}`, "error");
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      },
      variant: "danger"
    });
  };

  const takeScreenshot = async () => {
    await api("/api/system/screenshot", { method: "POST" });
    await mutate?.();
  };

  const saveTimedScreenshotSettings = async () => {
    setIsSavingCapture(true);
    try {
      // Only save timed screenshot settings, preserve folder and filenamePattern from existing settings
      await api("/api/settings/capture", {
        method: "PUT",
        body: JSON.stringify({
          folder: captureSettings?.folder || "",
          filenamePattern: captureSettings?.filenamePattern || "",
          enableIntervalCapture: timedScreenshotSettings.enableIntervalCapture,
          intervalSeconds: timedScreenshotSettings.intervalSeconds
        })
      });
      await mutateCapture();
      showToast(t("tools.screenshots.saveSuccess"), "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(t("tools.screenshots.saveFailure", { message }), "error");
    } finally {
      setIsSavingCapture(false);
    }
  };

  const toolsTabs: { key: ToolsTab; label: string; icon: React.ReactNode }[] = [
    { key: "application-monitor", label: t("tools.tabs.appMonitor"), icon: <Monitor size={16} /> },
    { key: "storage-monitor", label: "Storage Monitor", icon: <HardDrive size={16} /> },
    { key: "terminal", label: "Terminal", icon: <Terminal size={16} /> },
    { key: "vnc", label: "VNC", icon: <MonitorIcon size={16} /> },
    { key: "screenshots", label: t("tools.tabs.screenshots"), icon: <Camera size={16} /> }
  ];

  return (
    <section className="space-y-4">
      <div className="submenu-container">
        {toolsTabs.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`submenu-tab ${tab === key ? "active" : ""}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === "screenshots" && (
        <div className="space-y-4">
          {/* Timed Screenshots Configuration */}
          <div className="panel space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="panel-title mb-0 flex items-center gap-2">
                <Clock size={18} /> {t("tools.screenshots.timedTitle")}
              </h3>
              <button className="btn-primary" onClick={saveTimedScreenshotSettings} disabled={isSavingCapture}>
                <Save size={16} /> {isSavingCapture ? t("tools.screenshots.saving") : t("tools.screenshots.save")}
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="interval-enable"
                    className="checkbox"
                    checked={timedScreenshotSettings.enableIntervalCapture}
                    onChange={(e) => setTimedScreenshotSettings({ ...timedScreenshotSettings, enableIntervalCapture: e.target.checked })}
                  />
                  <label htmlFor="interval-enable" className="text-sm text-slate-300">
                    {t("tools.screenshots.enableAuto")}
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">{t("tools.screenshots.intervalLabel")}</label>
                  <input
                    type="number"
                    min={1}
                    className="input-text w-24"
                    value={timedScreenshotSettings.intervalSeconds}
                    onChange={(e) => setTimedScreenshotSettings({ ...timedScreenshotSettings, intervalSeconds: Math.max(1, Number(e.target.value)) })}
                    disabled={!timedScreenshotSettings.enableIntervalCapture}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {t("tools.screenshots.intervalHint")}
              </p>
            </div>
          </div>

          {/* Captured Screenshots */}
          <div className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="panel-title mb-1">{t("tools.screenshots.sectionTitle")}</h3>
                <p className="text-sm text-slate-400">
                  {t("tools.screenshots.folderLabel")}: {formatPath(folder) || t("tools.screenshots.folderMissing")}
                </p>
              </div>
              <div className="flex gap-2">
                {images.length > 0 && (
                  <button
                    className="btn-outline text-xs"
                    onClick={selectedScreenshots.size === images.length ? clearScreenshotSelection : selectAllScreenshots}
                  >
                    {selectedScreenshots.size === images.length ? (
                      <>
                        <Square size={14} /> Deselect All
                      </>
                    ) : (
                      <>
                        <CheckSquare size={14} /> Select All
                      </>
                    )}
                  </button>
                )}
                <button className="btn-primary" onClick={takeScreenshot}>
                  <Camera size={16} /> {t("tools.screenshots.takeScreenshot")}
                </button>
                <button className="btn-outline" onClick={() => mutate()}>
                  <RefreshCw size={16} /> {t("common.refresh")}
                </button>
              </div>
            </div>

            {isLoading && <p className="text-sm text-slate-400">{t("tools.screenshots.loading")}</p>}

            {!isLoading && folder && images.length === 0 && (
              <div className="text-sm text-slate-400 flex items-center gap-2">
                <ImageIcon size={16} />
                {t("tools.screenshots.empty")}
              </div>
            )}
            {!folder && (
              <p className="text-sm text-red-400">{t("tools.screenshots.configurePrompt")}</p>
            )}

            {selectedScreenshots.size > 0 && (
              <div className="panel bg-sky-900/20 border-sky-500/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">
                    {selectedScreenshots.size} screenshot{selectedScreenshots.size > 1 ? 's' : ''} selected
                  </span>
                  <div className="flex gap-2">
                    <button className="btn-outline text-xs" onClick={clearScreenshotSelection}>
                      Clear
                    </button>
                    <button className="btn-primary text-xs" onClick={downloadSelectedScreenshots}>
                      <Download size={14} /> Download as ZIP
                    </button>
                    <button className="btn-outline text-xs text-red-400 hover:text-red-300" onClick={deleteSelectedScreenshots}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.isArray(images) && images.map((img) => (
                <div key={img.fullPath} className={`screenshot-card ${selectedScreenshots.has(img.fullPath) ? 'ring-2 ring-sky-500' : ''}`}>
                  <div className="relative">
                    <img
                      src={buildRawUrl(img.fullPath)}
                      alt={img.name}
                      className="screenshot-thumb"
                      onClick={() => openPreview(img)}
                    />
                    <div className="absolute top-2 left-2">
                      <button
                        className="icon-btn bg-slate-900/80 hover:bg-slate-800/80"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleScreenshotSelection(img.fullPath);
                        }}
                        title={selectedScreenshots.has(img.fullPath) ? "Deselect" : "Select"}
                      >
                        {selectedScreenshots.has(img.fullPath) ? (
                          <CheckSquare size={16} className="text-sky-400" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="screenshot-meta">
                    <div>
                      <p className="screenshot-name">{img.name}</p>
                      <p className="text-xs text-slate-400">{formatDate(img.modifiedAt)}</p>
                    </div>
                    <div className="screenshot-actions">
                      <button
                        className="icon-btn"
                        onClick={() => openPreview(img)}
                        title={t("common.view")}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => download(img.fullPath)}
                        title={t("common.download")}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => deleteScreenshot(img)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {preview && (
            <div className="modal-backdrop" onClick={() => setPreview(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-[0.2em]">{t("tools.screenshots.previewTitle")}</p>
                    <p className="font-semibold text-white break-all">{preview.path}</p>
                  </div>
                  <button className="btn-outline" onClick={() => setPreview(null)}>
                    {t("common.cancel")}
                  </button>
                </div>
                <div className="modal-body">
                  <img src={preview.url} alt="Screenshot preview" className="w-full rounded-md border border-slate-800" />
                </div>
              </div>
            </div>
          )}

          <ScreenshotLogPanel t={t} />
        </div>
      )}

      {tab === "storage-monitor" && <DiskMonitoringTab t={t} theme={theme} />}
      {tab === "application-monitor" && <ApplicationMonitorTab t={t} />}
      {tab === "terminal" && <TerminalTab t={t} />}
      {tab === "vnc" && <RemoteDesktopTab t={t} />}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        variant={confirmDialog.variant}
      />
    </section>
  );
}

function DiskMonitoringTab({ t, theme }: { t: TranslateFn; theme: Theme }) {
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDrive, setSelectedDrive] = useState<string | null>(null);
  const [folderPickerIndex, setFolderPickerIndex] = useState<number | null>(null);
  const { data: config, mutate: refreshConfig } = useSWR<DiskMonitoringConfig>("disk-monitoring-config", () => api<DiskMonitoringConfig>("/api/disk-monitoring/config"));
  const { data: status, mutate: refreshStatus } = useSWR<DiskMonitoringStatus>("disk-monitoring-status", () => api<DiskMonitoringStatus>("/api/disk-monitoring/status"), { refreshInterval: 30000 });
  const { data: availableDrives } = useSWR<Array<{ name: string; totalBytes: number; freeBytes: number }>>("available-drives", () => api<Array<{ name: string; totalBytes: number; freeBytes: number }>>("/api/disk-monitoring/drives"));



  const [form, setForm] = useState<DiskMonitoringConfig>({
    enabled: false,
    monitoredDrives: [],
    folderMonitors: [],
    notificationRecipients: []
  });

  useEffect(() => {
    if (config) {
      setForm(config);
    }
  }, [config]);

  const getDriveConfig = useCallback((driveName: string): DriveMonitorConfig | undefined => {
    if (!Array.isArray(form.monitoredDrives)) return undefined;
    return form.monitoredDrives.find((d) => d.driveName === driveName);
  }, [form.monitoredDrives]);

  const updateDriveConfig = useCallback((driveName: string, updates: Partial<DriveMonitorConfig>) => {
    setForm((prev) => {
      const monitoredDrives = Array.isArray(prev.monitoredDrives) ? prev.monitoredDrives : [];
      const existing = monitoredDrives.find((d) => d.driveName === driveName);
      const updated: DriveMonitorConfig = existing
        ? { ...existing, ...updates }
        : { driveName, enabled: true, checkIntervalMinutes: 15, thresholdPercent: null, thresholdBytes: null, ...updates };

      const otherDrives = monitoredDrives.filter((d) => d.driveName !== driveName);
      return {
        ...prev,
        monitoredDrives: [...otherDrives, updated]
      };
    });
  }, []);

  const saveConfig = useCallback(async () => {
    setIsSaving(true);
    try {
      await api("/api/disk-monitoring/config", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      await refreshConfig();
      await refreshStatus();
      showToast(t("tools.disk.saveSuccess"), "success");
    } catch (err) {
      console.error("Failed to save disk monitoring config:", err);
      const message = err instanceof Error ? err.message : String(err);
      showToast(t("tools.disk.saveFailure", { message }), "error");
    } finally {
      setIsSaving(false);
    }
  }, [form, refreshConfig, refreshStatus, t]);

  const addRecipient = useCallback(() => {
    const email = window.prompt(t("tools.disk.recipientPrompt"));
    if (email) {
      const recipients = Array.isArray(form.notificationRecipients) ? form.notificationRecipients : [];
      if (!recipients.includes(email)) {
        setForm((prev) => ({
          ...prev,
          notificationRecipients: [...recipients, email]
        }));
      }
    }
  }, [form.notificationRecipients, t]);

  const removeRecipient = useCallback((email: string) => {
    setForm((prev) => {
      const recipients = Array.isArray(prev.notificationRecipients) ? prev.notificationRecipients : [];
      return {
        ...prev,
        notificationRecipients: recipients.filter((e) => e !== email)
      };
    });
  }, []);

  const selectedDriveData = availableDrives && Array.isArray(availableDrives) ? availableDrives.find((d) => d.name === selectedDrive) : undefined;
  const selectedDriveConfig = selectedDrive ? getDriveConfig(selectedDrive) : undefined;
  const selectedDriveStatus = status?.driveStatuses && Array.isArray(status.driveStatuses) ? status.driveStatuses.find((d) => d.driveName === selectedDrive) : undefined;
  const monitoringStatus = status?.isRunning ? t("tools.disk.statusActive") : t("tools.disk.statusInactive");
  const lastCheckDisplay = status?.lastCheck ? formatDate(status.lastCheck) : t("tools.disk.statusNever");

  return (
    <div className="space-y-4">
      <div className="panel space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="panel-title mb-1">{t("tools.disk.title")}</h3>
            <p className="text-sm text-slate-400">
              {monitoringStatus} • {t("tools.disk.lastCheck", { value: lastCheckDisplay })}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => refreshStatus()}>
              <RefreshCw size={16} /> {t("common.refresh")}
            </button>
            <button className="btn-primary" onClick={saveConfig} disabled={isSaving}>
              <Save size={16} /> {isSaving ? t("tools.disk.saving") : t("tools.disk.save")}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enableMonitoring"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="checkbox"
            />
            <label htmlFor="enableMonitoring" className="text-sm text-slate-300">
              {t("tools.disk.enable")}
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-slate-400">{t("tools.disk.recipients")}</label>
              <button className="btn-outline text-xs" onClick={addRecipient}>
                {t("tools.disk.addRecipient")}
              </button>
            </div>
            <div className="space-y-1">
              {Array.isArray(form.notificationRecipients) && form.notificationRecipients.map((email) => (
                <div key={email} className="flex items-center justify-between bg-slate-900/50 rounded px-2 py-1">
                  <span className="text-sm text-slate-300">{email}</span>
                  <button className="icon-btn" onClick={() => removeRecipient(email)}>
                    ×
                  </button>
                </div>
              ))}
              {form.notificationRecipients.length === 0 && (
                <p className="text-xs text-slate-500">{t("tools.disk.noRecipients")}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="panel space-y-4">
        <h4 className="panel-title">{t("tools.disk.availableDrives")}</h4>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {availableDrives && Array.isArray(availableDrives) && availableDrives.map((drive) => {
            const usedBytes = drive.totalBytes - drive.freeBytes;
            const usedPercent = (usedBytes / drive.totalBytes) * 100;
            const freePercent = (drive.freeBytes / drive.totalBytes) * 100;
            const driveConfig = getDriveConfig(drive.name);
            const driveStatus = status?.driveStatuses && Array.isArray(status.driveStatuses) ? status.driveStatuses.find((d) => d.driveName === drive.name) : undefined;
            const isSelected = selectedDrive === drive.name;
            const isMonitored = driveConfig?.enabled ?? false;

            return (
              <div
                key={drive.name}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${isSelected
                  ? "border-sky-500 bg-slate-900/70"
                  : isMonitored
                    ? "border-slate-700 bg-slate-900/50"
                    : "border-slate-800 bg-slate-900/30"
                  } ${driveStatus?.isBelowThreshold ? "border-red-500/50" : ""}`}
                onClick={() => setSelectedDrive(isSelected ? null : drive.name)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive size={18} className={isMonitored ? "text-sky-400" : "text-slate-500"} />
                    <span className="font-semibold text-white">{drive.name}</span>
                    {driveStatus?.isBelowThreshold && <AlertTriangle size={16} className="text-red-400" />}
                  </div>
                  {isMonitored && (
                    <span className="text-xs text-sky-400 bg-sky-900/30 px-2 py-0.5 rounded">{t("tools.disk.monitoredBadge")}</span>
                  )}
                </div>

                <div className="space-y-2">
                  <div
                    className="h-3 rounded-full overflow-hidden"
                    style={{ backgroundColor: theme.colors.border.muted }}
                  >
                    <div className="h-full flex">
                      <div
                        style={{ width: `${usedPercent}%`, backgroundColor: theme.colors.accent.primary }}
                        title={t("tools.disk.usedTooltip", { value: formatBytes(usedBytes) })}
                      />
                      <div
                        style={{ width: `${freePercent}%`, backgroundColor: theme.colors.text.muted }}
                        title={t("tools.disk.freeTooltip", { value: formatBytes(drive.freeBytes) })}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>{t("tools.disk.total")}</span>
                      <span className="text-slate-300">{formatBytes(drive.totalBytes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("tools.disk.used")}</span>
                      <span className="text-slate-300">
                        {formatBytes(usedBytes)} ({usedPercent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t("tools.disk.free")}</span>
                      <span className="text-slate-300">
                        {formatBytes(drive.freeBytes)} ({freePercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDrive && selectedDriveData && (
        <div className="panel space-y-4">
          <h4 className="panel-title">{t("tools.disk.configureDrive", { drive: selectedDrive })}</h4>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`monitor-${selectedDrive}`}
                checked={selectedDriveConfig?.enabled ?? false}
                onChange={(e) => updateDriveConfig(selectedDrive, { enabled: e.target.checked })}
                className="checkbox"
              />
              <label htmlFor={`monitor-${selectedDrive}`} className="text-sm text-slate-300">
                {t("tools.disk.enableDrive")}
              </label>
            </div>

            {(selectedDriveConfig?.enabled ?? false) && (
              <div className="space-y-4 pl-6 border-l-2 border-slate-800">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t("tools.disk.checkInterval")}</label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    className="input-text"
                    value={selectedDriveConfig?.checkIntervalMinutes ?? 15}
                    onChange={(e) => updateDriveConfig(selectedDrive, { checkIntervalMinutes: Number(e.target.value) })}
                  />
                  <p className="text-xs text-slate-500 mt-1">{t("tools.disk.checkIntervalHint")}</p>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">{t("tools.disk.thresholdTitle")}</label>
                  <div className="space-y-3">
                    <div>
                      <label className="flex items-center gap-2 text-sm text-slate-300 mb-1">
                        <input
                          type="radio"
                          name={`threshold-type-${selectedDrive}`}
                          checked={selectedDriveConfig?.thresholdPercent !== null && selectedDriveConfig?.thresholdPercent !== undefined}
                          onChange={() => updateDriveConfig(selectedDrive, { thresholdPercent: 10, thresholdBytes: null })}
                          className="radio"
                        />
                        {t("tools.disk.thresholdPercent")}
                      </label>
                      {selectedDriveConfig?.thresholdPercent !== null && selectedDriveConfig?.thresholdPercent !== undefined && (
                        <input
                          type="number"
                          min={1}
                          max={100}
                          className="input-text mt-1"
                          value={selectedDriveConfig.thresholdPercent}
                          onChange={(e) => updateDriveConfig(selectedDrive, { thresholdPercent: Number(e.target.value) })}
                        />
                      )}
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm text-slate-300 mb-1">
                        <input
                          type="radio"
                          name={`threshold-type-${selectedDrive}`}
                          checked={selectedDriveConfig?.thresholdBytes !== null && selectedDriveConfig?.thresholdBytes !== undefined}
                          onChange={() => updateDriveConfig(selectedDrive, { thresholdBytes: 1024 * 1024 * 1024, thresholdPercent: null })}
                          className="radio"
                        />
                        {t("tools.disk.thresholdBytes")}
                      </label>
                      {selectedDriveConfig?.thresholdBytes !== null && selectedDriveConfig?.thresholdBytes !== undefined && (
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="input-text mt-1"
                          value={Math.round(selectedDriveConfig.thresholdBytes / (1024 * 1024))}
                          onChange={(e) => updateDriveConfig(selectedDrive, { thresholdBytes: Number(e.target.value) * 1024 * 1024 })}
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {t("tools.disk.thresholdHint")}
                  </p>
                </div>

                {selectedDriveStatus && (
                  <div className={`p-3 rounded-lg border ${selectedDriveStatus.isBelowThreshold ? "border-red-500/50 bg-red-900/20" : "border-slate-800 bg-slate-900/30"
                    }`}>
                    <p className="text-sm font-semibold text-white mb-1">{t("tools.disk.statusCardTitle")}</p>
                    <p className="text-xs text-slate-400">
                      {formatBytes(selectedDriveStatus.freeBytes)} {t("tools.disk.free")} ({selectedDriveStatus.freePercent.toFixed(1)}%)
                      {selectedDriveStatus.isBelowThreshold && (
                        <span className="text-red-400 ml-2">⚠ {t("tools.disk.belowThreshold")}</span>
                      )}
                    </p>
                    {selectedDriveStatus.lastAlertSent && (
                      <p className="text-xs text-slate-500 mt-1">
                        {t("tools.disk.lastAlert", { value: formatDate(selectedDriveStatus.lastAlertSent) })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="panel space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="panel-title">{t("tools.disk.folderMonitoring")}</h4>
          <button
            className="btn-outline text-xs"
            onClick={() => {
              setForm((prev) => ({
                ...prev,
                folderMonitors: [...prev.folderMonitors, { path: "", enabled: true, checkIntervalMinutes: 15, thresholdBytes: 1024 * 1024 * 1024, thresholdDirection: "Over" }]
              }));
            }}
          >
            {t("tools.disk.addFolder")}
          </button>
        </div>

        {form.folderMonitors.length === 0 ? (
          <p className="text-sm text-slate-400">{t("tools.disk.noFolders")}</p>
        ) : (
          <div className="space-y-3">
            {Array.isArray(form.folderMonitors) && form.folderMonitors.map((monitor, index) => (
              <div key={index} className="p-4 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={monitor.enabled}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        folderMonitors: Array.isArray(prev.folderMonitors) ? prev.folderMonitors.map((m, i) => i === index ? { ...m, enabled: e.target.checked } : m) : []
                      }));
                    }}
                    className="checkbox"
                  />
                  <label className="text-sm text-slate-300">{t("tools.disk.enableFolder")}</label>
                  <button
                    className="ml-auto icon-btn text-red-400"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        folderMonitors: Array.isArray(prev.folderMonitors) ? prev.folderMonitors.filter((_, i) => i !== index) : []
                      }));
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t("tools.disk.folderPath")}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input-text flex-1"
                      value={formatPath(monitor.path)}
                      onChange={(e) => {
                        // Normalize path - replace double backslashes with single
                        const normalizedPath = e.target.value.replace(/\\\\/g, '\\');
                        setForm((prev) => ({
                          ...prev,
                          folderMonitors: Array.isArray(prev.folderMonitors) ? prev.folderMonitors.map((m, i) => i === index ? { ...m, path: normalizedPath } : m) : []
                        }));
                      }}
                      placeholder={t("tools.disk.folderPlaceholder")}
                    />
                    <button
                      className="btn-outline"
                      type="button"
                      onClick={() => setFolderPickerIndex(index)}
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                  {folderPickerIndex === index && (
                    <FolderPicker
                      initialPath={monitor.path}
                      onSelect={(path) => {
                        // Normalize path by removing double backslashes
                        const normalized = path.replace(/\\\\/g, '\\');
                        setForm((prev) => ({
                          ...prev,
                          folderMonitors: Array.isArray(prev.folderMonitors) ? prev.folderMonitors.map((m, i) => i === index ? { ...m, path: normalized } : m) : []
                        }));
                        setFolderPickerIndex(null);
                      }}
                      onCancel={() => setFolderPickerIndex(null)}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">{t("tools.disk.checkInterval")}</label>
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      className="input-text"
                      value={monitor.checkIntervalMinutes}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          folderMonitors: Array.isArray(prev.folderMonitors) ? prev.folderMonitors.map((m, i) => i === index ? { ...m, checkIntervalMinutes: Number(e.target.value) } : m) : []
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">{t("tools.disk.thresholdDirection")}</label>
                    <select
                      className="input-text"
                      value={monitor.thresholdDirection || "Over"}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          folderMonitors: Array.isArray(prev.folderMonitors) ? prev.folderMonitors.map((m, i) => i === index ? { ...m, thresholdDirection: e.target.value as "Over" | "Under" } : m) : []
                        }));
                      }}
                    >
                      <option value="Over">{t("tools.disk.thresholdOver")}</option>
                      <option value="Under">{t("tools.disk.thresholdUnder")}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">{t("tools.disk.thresholdValue")}</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="input-text"
                    value={Math.round(monitor.thresholdBytes / (1024 * 1024))}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        folderMonitors: Array.isArray(prev.folderMonitors) ? prev.folderMonitors.map((m, i) => i === index ? { ...m, thresholdBytes: Number(e.target.value) * 1024 * 1024 } : m) : []
                      }));
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {monitor.thresholdDirection === "Under"
                    ? t("tools.disk.thresholdSummaryUnder", { value: formatBytes(monitor.thresholdBytes) })
                    : t("tools.disk.thresholdSummaryOver", { value: formatBytes(monitor.thresholdBytes) })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storage Monitor Log Tailing Section */}
      <LogPanel name="DiskMonitor" title={t("tools.disk.logTitle")} subfolder="DiskMonitor" />
    </div>
  );
}

function ApplicationMonitorTab({ t }: { t: TranslateFn }) {
  const [isSaving, setIsSaving] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [currentAppIdForPicker, setCurrentAppIdForPicker] = useState<string | null>(null);
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());
  const { data: config, mutate: refreshConfig } = useSWR<ApplicationMonitorConfig>("application-monitor-config", () => api<ApplicationMonitorConfig>("/api/application-monitor/config"));



  const [form, setForm] = useState<ApplicationMonitorConfig>({
    enabled: false,
    applications: [],
    notificationRecipients: []
  });

  useEffect(() => {
    if (config) {
      setForm({
        ...config,
        notificationRecipients: Array.isArray(config.notificationRecipients) ? config.notificationRecipients : []
      });
    }
  }, [config]);

  const saveConfig = useCallback(async () => {
    setIsSaving(true);
    try {
      await api("/api/application-monitor/config", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      await refreshConfig();
      showToast(t("tools.app.saveSuccess"), "success");
    } catch (err) {
      console.error("Failed to save application monitor config:", err);
      const message = err instanceof Error ? err.message : String(err);
      showToast(t("tools.app.saveFailure", { message }), "error");
    } finally {
      setIsSaving(false);
    }
  }, [form, refreshConfig, t]);

  const addApplication = useCallback(() => {
    const newId = generateUUID();
    setForm((prev) => ({
      ...prev,
      applications: [...prev.applications, {
        id: newId,
        name: "",
        executablePath: "",
        arguments: null,
        workingDirectory: null,
        enabled: true,
        checkIntervalSeconds: 60,
        restartDelaySeconds: 5,
        logPath: null,
        eventLogSource: null
      }]
    }));
    // Automatically expand the new application panel
    setExpandedApps(prev => new Set([...prev, newId]));
  }, []);

  const updateApplication = useCallback((id: string, updates: Partial<MonitoredApplication>) => {
    setForm((prev) => ({
      ...prev,
      applications: Array.isArray(prev.applications) ? prev.applications.map((app) => app.id === id ? { ...app, ...updates } : app) : []
    }));
  }, []);

  const handleFileSelect = useCallback((path: string) => {
    if (currentAppIdForPicker) {
      // Normalize path by removing double backslashes
      const normalized = path.replace(/\\\\/g, '\\');
      updateApplication(currentAppIdForPicker, { executablePath: normalized });
    }
    setShowFilePicker(false);
    setCurrentAppIdForPicker(null);
  }, [currentAppIdForPicker, updateApplication]);

  const removeApplication = useCallback((id: string) => {
    setForm((prev) => ({
      ...prev,
      applications: Array.isArray(prev.applications) ? prev.applications.filter((app) => app.id !== id) : []
    }));
  }, []);

  const addRecipient = useCallback(() => {
    const email = window.prompt(t("tools.app.recipientPrompt"));
    if (email) {
      setForm((prev) => {
        const list = Array.isArray(prev.notificationRecipients) ? prev.notificationRecipients : [];
        if (list.includes(email)) {
          return prev;
        }
        return { ...prev, notificationRecipients: [...list, email] };
      });
    }
  }, [t]);

  const removeRecipient = useCallback((email: string) => {
    setForm((prev) => ({
      ...prev,
      notificationRecipients: Array.isArray(prev.notificationRecipients)
        ? prev.notificationRecipients.filter((recipient) => recipient !== email)
        : []
    }));
  }, []);

  return (
    <div className="space-y-4">
      <div className="panel space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="panel-title mb-1">{t("tools.app.title")}</h3>
            <p className="text-sm text-slate-400">
              {t("tools.app.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={saveConfig} disabled={isSaving}>
              <Save size={16} /> {isSaving ? t("tools.app.saving") : t("tools.app.save")}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enableAppMonitoring"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="checkbox"
            />
            <label htmlFor="enableAppMonitoring" className="text-sm text-slate-300">
              {t("tools.app.enable")}
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-slate-400">{t("tools.app.recipients")}</label>
              <button className="btn-outline text-xs" onClick={addRecipient}>
                {t("tools.app.addRecipient")}
              </button>
            </div>
            <div className="space-y-1">
              {Array.isArray(form.notificationRecipients) && form.notificationRecipients.map((email) => (
                <div key={email} className="flex items-center justify-between bg-slate-900/50 rounded px-2 py-1">
                  <span className="text-sm text-slate-300">{email}</span>
                  <button className="icon-btn" onClick={() => removeRecipient(email)}>
                    ×
                  </button>
                </div>
              ))}
              {(!form.notificationRecipients || form.notificationRecipients.length === 0) && (
                <p className="text-xs text-slate-500">{t("tools.app.noRecipients")}</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-slate-400">{t("tools.app.listTitle")}</label>
              <button className="btn-outline text-xs" onClick={addApplication}>
                {t("tools.app.addApplication")}
              </button>
            </div>

            {form.applications.length === 0 ? (
              <p className="text-sm text-slate-400">{t("tools.app.empty")}</p>
            ) : (
              <div className="space-y-2">
                {Array.isArray(form.applications) && form.applications.map((app) => {
                  const isExpanded = expandedApps.has(app.id);
                  return (
                    <div key={app.id} className="border border-slate-800 rounded-lg">
                      {/* Compact Header - Always Visible */}
                      <div className="flex items-center gap-2 p-2 bg-slate-900/30 hover:bg-slate-900/50">
                        <input
                          type="checkbox"
                          checked={app.enabled}
                          onChange={(e) => updateApplication(app.id, { enabled: e.target.checked })}
                          className="checkbox"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="flex-1 text-sm font-medium text-slate-200 min-w-0 truncate">
                          {app.name || t("tools.app.namePlaceholder")}
                        </span>
                        <span className="text-xs text-slate-400">
                          {t("tools.app.checkInterval")}: {app.checkIntervalSeconds}s
                        </span>
                        <span className="text-xs text-slate-400">
                          {t("tools.app.restartDelay")}: {app.restartDelaySeconds}s
                        </span>
                        <button
                          className="icon-btn text-slate-400 hover:text-white"
                          onClick={() => {
                            setExpandedApps(prev => {
                              const next = new Set(prev);
                              if (next.has(app.id)) {
                                next.delete(app.id);
                              } else {
                                next.add(app.id);
                              }
                              return next;
                            });
                          }}
                          title={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button
                          className="icon-btn text-red-400 hover:text-red-300"
                          onClick={() => removeApplication(app.id)}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Expanded Content - Only when expanded */}
                      {isExpanded && (
                        <div className="p-4 space-y-3 border-t border-slate-800">

                          <div>
                            <label className="block text-sm text-slate-400 mb-1">{t("tools.app.namePlaceholder")}</label>
                            <input
                              type="text"
                              className="input-text w-full"
                              placeholder={t("tools.app.namePlaceholder")}
                              value={app.name}
                              onChange={(e) => updateApplication(app.id, { name: e.target.value })}
                            />
                          </div>

                          <div>
                            <label className="block text-sm text-slate-400 mb-1">{t("tools.app.executablePath")}</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                className="input-text flex-1"
                                placeholder={t("tools.app.executablePlaceholder")}
                                value={formatPath(app.executablePath || "")}
                                onChange={(e) => {
                                  // Normalize path by removing double backslashes
                                  const normalized = e.target.value.replace(/\\\\/g, '\\');
                                  updateApplication(app.id, { executablePath: normalized });
                                }}
                              />
                              <button
                                className="btn-outline"
                                onClick={() => {
                                  setCurrentAppIdForPicker(app.id);
                                  setShowFilePicker(true);
                                }}
                              >
                                <FolderOpen size={16} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm text-slate-400 mb-1">{t("tools.app.checkInterval")}</label>
                              <input
                                type="number"
                                min={1}
                                max={3600}
                                className="input-text"
                                value={app.checkIntervalSeconds}
                                onChange={(e) => updateApplication(app.id, { checkIntervalSeconds: Number(e.target.value) })}
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-slate-400 mb-1">{t("tools.app.restartDelay")}</label>
                              <input
                                type="number"
                                min={0}
                                max={300}
                                className="input-text"
                                value={app.restartDelaySeconds}
                                onChange={(e) => updateApplication(app.id, { restartDelaySeconds: Number(e.target.value) })}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm text-slate-400 mb-1">{t("tools.app.arguments")}</label>
                            <input
                              type="text"
                              className="input-text"
                              placeholder={t("tools.app.argumentsPlaceholder")}
                              value={app.arguments || ""}
                              onChange={(e) => updateApplication(app.id, { arguments: e.target.value || null })}
                            />
                          </div>

                          <div>
                            <label className="block text-sm text-slate-400 mb-1">{t("tools.app.workingDirectory")}</label>
                            <input
                              type="text"
                              className="input-text"
                              placeholder={t("tools.app.workingPlaceholder")}
                              value={formatPath(app.workingDirectory || "")}
                              onChange={(e) => {
                                // Normalize path by removing double backslashes
                                const normalized = e.target.value.replace(/\\\\/g, '\\');
                                updateApplication(app.id, { workingDirectory: normalized || null });
                              }}
                            />
                          </div>

                          <div>
                            <label className="block text-sm text-slate-400 mb-1">{t("tools.app.eventLogSource")}</label>
                            <input
                              type="text"
                              className="input-text w-full"
                              placeholder={t("tools.app.eventLogPlaceholder")}
                              value={app.eventLogSource || ""}
                              onChange={(e) => updateApplication(app.id, { eventLogSource: e.target.value || null })}
                            />
                            <p className="text-xs text-slate-500 mt-1">{t("tools.app.eventLogHint")}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log Tailing Section */}
      <LogPanel name="ApplicationMonitor" title={t("tools.app.logTitle")} subfolder="ApplicationMonitor" />

      {showFilePicker && (
        <FilePicker
          initialPath={currentAppIdForPicker ? (form.applications || []).find(app => app.id === currentAppIdForPicker)?.executablePath || "" : ""}
          onSelect={handleFileSelect}
          onCancel={() => { setShowFilePicker(false); setCurrentAppIdForPicker(null); }}
          fileExtensions={[".exe", ".bat", ".cmd", ".com", ".scr", ".vbs", ".js", ".ps1"]}
        />
      )}
    </div>
  );
}

function TerminalTab({ t }: { t: TranslateFn }) {
  const [terminalSession, setTerminalSession] = useState<TerminalSession | null>(null);
  const [showShellDialog, setShowShellDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const createNewTerminal = async (shellType: "cmd" | "powershell") => {
    setIsCreating(true);
    setShowShellDialog(false);
    try {
      // Close existing terminal if any
      if (terminalSession) {
        try {
          await closeTerminal(terminalSession.id);
        } catch (error) {
          // Ignore errors when closing old terminal
        }
      }

      const session = await createTerminal(shellType);
      setTerminalSession(session);
      showToast(`Terminal created (${shellType})`, "success");
    } catch (error) {
      showToast(`Failed to create terminal: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const closeCurrentTerminal = async () => {
    if (!terminalSession) return;

    try {
      await closeTerminal(terminalSession.id);
      setTerminalSession(null);
      showToast("Terminal closed", "success");
    } catch (error) {
      showToast(`Failed to close terminal: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="panel-title mb-0">Terminal</h3>
          <div className="flex items-center gap-2">
            {terminalSession && (
              <>
                <button
                  className="btn-outline"
                  onClick={async () => {
                    try {
                      // Create a new terminal session for the popup
                      const newSession = await createTerminal(terminalSession.shellType as "cmd" | "powershell");
                      const url = `/terminal-popup?id=${newSession.id}`;
                      window.open(url, '_blank', 'width=800,height=600');
                    } catch (error) {
                      showToast(`Failed to open popup: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
                    }
                  }}
                  title="Open terminal in a new window"
                >
                  <ExternalLink size={16} /> Open in Popup
                </button>
                <button
                  className="btn-outline"
                  onClick={closeCurrentTerminal}
                >
                  <X size={16} /> Close Terminal
                </button>
              </>
            )}
            <button
              className="btn-primary"
              onClick={() => setShowShellDialog(true)}
              disabled={isCreating}
            >
              <Terminal size={16} /> New Terminal
            </button>
          </div>
        </div>

        {showShellDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Select Shell</h3>
                <button
                  className="text-slate-400 hover:text-white"
                  onClick={() => setShowShellDialog(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3">
                <button
                  className="w-full p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-700 rounded-lg text-left transition-colors"
                  onClick={() => createNewTerminal("cmd")}
                >
                  <div className="font-medium text-white">Command Prompt (cmd.exe)</div>
                  <div className="text-sm text-slate-400 mt-1">Windows Command Prompt</div>
                </button>
                <button
                  className="w-full p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-700 rounded-lg text-left transition-colors"
                  onClick={() => createNewTerminal("powershell")}
                >
                  <div className="font-medium text-white">PowerShell</div>
                  <div className="text-sm text-slate-400 mt-1">Windows PowerShell</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {!terminalSession ? (
          <div className="text-center py-12 text-slate-400">
            <Terminal size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">No active terminal</p>
            <p className="text-sm">Click "New Terminal" to create one</p>
          </div>
        ) : (
          <div className="h-[600px]">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full bg-slate-900 rounded-lg border border-slate-800">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm text-slate-400">Loading terminal...</p>
                </div>
              </div>
            }>
              <TerminalViewer
                sessionId={terminalSession.id}
                onClose={closeCurrentTerminal}
              />
            </Suspense>
          </div>
        )}
      </div>

      <TerminalLogPanel t={t} />
    </div>
  );
}

// Log panel components for each tool
function ScreenshotLogPanel({ t }: { t: TranslateFn }) {
  return <LogPanel name="Screenshots" title={t("tools.screenshots.logTitle")} subfolder="Screenshots" />;
}

function TerminalLogPanel({ t }: { t: TranslateFn }) {
  return <LogPanel name="Terminal" title={t("tools.terminal.logTitle")} subfolder="Terminal" />;
}

function VncLogPanel({ t }: { t: TranslateFn }) {
  return <LogPanel name="VNC" title={t("tools.vnc.logTitle")} subfolder="VNC" />;
}

function RemoteDesktopTab({ t }: { t: TranslateFn }) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [password, setPassword] = useState("");

  const { data: config } = useSWR<VncConfig>("vnc-config", () => api<VncConfig>("/api/vnc/config"));
  const { data: status, mutate: mutateStatus } = useSWR<VncStatus>("vnc-status", () => api<VncStatus>("/api/vnc/status"), {
    refreshInterval: 2000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true
  });

  // Ensure status is fetched immediately on mount
  useEffect(() => {
    mutateStatus();
  }, [mutateStatus]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await api("/api/vnc/start", { method: "POST" });
      await mutateStatus();
      showToast(t("tools.vnc.startSuccess"), "success");
    } catch (err) {
      showToast(t("tools.vnc.startFailure", { message: err instanceof Error ? err.message : String(err) }), "error");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await api("/api/vnc/stop", { method: "POST" });
      await mutateStatus();
      showToast(t("tools.vnc.stopSuccess"), "success");
    } catch (err) {
      showToast(t("tools.vnc.stopFailure", { message: err instanceof Error ? err.message : String(err) }), "error");
    } finally {
      setIsStopping(false);
    }
  };

  const handleConnect = () => {
    if (!status || !config) return;

    const host = status.allowRemote ? window.location.hostname : "127.0.0.1";
    const port = status.port;

    // Get password - use from input field, or prompt if required but not provided
    let connectPassword = password;
    if (config.hasPassword && !connectPassword) {
      const enteredPassword = prompt("VNC server requires a password. Please enter the password:");
      if (!enteredPassword) {
        showToast("Password is required to connect to the VNC server.", "error");
        return; // User cancelled
      }
      connectPassword = enteredPassword;
      setPassword(enteredPassword); // Store it for next time
    }

    // Store connection params in localStorage for the popup
    localStorage.setItem("vnc_host", host);
    localStorage.setItem("vnc_port", port.toString());
    if (connectPassword) {
      localStorage.setItem("vnc_password", connectPassword);
    } else {
      localStorage.removeItem("vnc_password");
    }

    // Open popup window with VNC viewer
    const viewerUrl = `/vnc-viewer?host=${encodeURIComponent(host)}&port=${port}${connectPassword ? `&password=${encodeURIComponent(connectPassword)}` : ""}`;

    const popup = window.open(
      viewerUrl,
      "VNC Viewer",
      `width=${screen.width},height=${screen.height},fullscreen=yes,resizable=yes,scrollbars=no`
    );

    if (!popup) {
      showToast("Popup blocked. Please allow popups for this site to connect to VNC.", "error");
    }
  };

  if (!config) {
    return <div className="text-sm text-slate-400">{t("tools.vnc.loading")}</div>;
  }

  const localIp = status?.allowRemote ? window.location.hostname : "127.0.0.1";
  const connectionInfo = status?.isRunning ? `${localIp}:${status.port}` : null;

  return (
    <div className="space-y-4">
      <div className="panel space-y-4">
        <h3 className="panel-title mb-0">{t("tools.vnc.statusTitle")}</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{t("tools.vnc.status")}</span>
            <span className={`text-sm font-semibold ${status?.isRunning ? "text-green-400" : "text-slate-400"}`}>
              {status?.isRunning ? t("tools.vnc.running") : t("tools.vnc.stopped")}
            </span>
          </div>

          {status?.isRunning && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{t("tools.vnc.connections")}</span>
                <span className="text-sm font-semibold text-white">{status.connectionCount}</span>
              </div>

              {connectionInfo && (
                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                  <p className="text-xs text-slate-400 mb-1">{t("tools.vnc.connectionInfo")}</p>
                  <p className="text-sm font-mono text-white">{connectionInfo}</p>
                  <p className="text-xs text-slate-500 mt-2">{t("tools.vnc.connectionHint")}</p>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            {!status?.isRunning ? (
              <button
                className="btn-primary flex-1"
                onClick={handleStart}
                disabled={isStarting || isStopping || !config.enabled}
              >
                {isStarting ? t("tools.vnc.starting") : "Start Server"}
              </button>
            ) : (
              <button
                className="btn-primary flex-1"
                onClick={handleConnect}
                disabled={!status.isRunning}
              >
                <EyeIcon size={16} /> Connect
              </button>
            )}
            <button
              className="btn-outline flex-1"
              onClick={handleStop}
              disabled={isStarting || isStopping || !status?.isRunning}
            >
              {isStopping ? t("tools.vnc.stopping") : t("tools.vnc.stop")}
            </button>
            <button className="btn-outline" onClick={() => mutateStatus()}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      <VncLogPanel t={t} />
    </div>
  );
}


