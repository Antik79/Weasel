import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Activity, HardDrive, Wifi, RefreshCw, GaugeCircle, Server, FileText, Monitor, Computer, Cpu, MemoryStick } from "lucide-react";
import { api, getSystemMetrics, getWeaselServicesStatus } from "../api/client";
import { EventLogEntry, SystemStatus, NetworkAdapterInfo, NetworkAdapterStats, SystemMetrics, WeaselServicesStatus } from "../types";
import { formatBytes, formatDate } from "../utils/format";
import { useTranslation } from "../i18n/i18n";
import { MetricChart } from "../components/MetricChart";
import { ServiceStatusCard, ServiceIcons } from "../components/ServiceStatusCard";
import TaskManager from "./TaskManager";
import ServiceManager from "./ServiceManager";

const statusFetcher = (url: string) => api<SystemStatus>(url);
const eventsFetcher = (url: string) => api<EventLogEntry[]>(url);
const adaptersFetcher = () => api<NetworkAdapterInfo[]>("/api/system/network/adapters");
const networkStatsFetcher = (adapterId: string) => api<NetworkAdapterStats>(`/api/system/network/stats/${encodeURIComponent(adapterId)}`);

type SystemTab = "overview" | "tasks" | "services" | "events";
type RangePreset = "1h" | "6h" | "24h" | "custom";

export default function SystemDashboard() {
  const { t } = useTranslation();
  const [logName, setLogName] = useState("System");
  const [level, setLevel] = useState("all");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [maxEvents, setMaxEvents] = useState(50);
  const [tab, setTab] = useState<SystemTab>("overview");
  const [rangePreset, setRangePreset] = useState<RangePreset>("6h");
  const [customSinceDate, setCustomSinceDate] = useState("");
  const [customSinceTime, setCustomSinceTime] = useState("00:00");
  const [customUntilDate, setCustomUntilDate] = useState("");
  const [customUntilTime, setCustomUntilTime] = useState("23:59");

  useEffect(() => {
    if (rangePreset === "custom") {
      const sinceValue =
        customSinceDate && customSinceTime
          ? `${customSinceDate}T${customSinceTime}`
          : "";
      const untilValue =
        customUntilDate && customUntilTime
          ? `${customUntilDate}T${customUntilTime}`
          : "";
      setSince(sinceValue);
      setUntil(untilValue);
      return;
    }

    const now = new Date();
    const hoursMap: Record<Exclude<RangePreset, "custom">, number> = {
      "1h": 1,
      "6h": 6,
      "24h": 24
    };
    const sinceDate = new Date(now.getTime() - hoursMap[rangePreset] * 60 * 60 * 1000);
    setUntil(now.toISOString().slice(0, 16));
    setSince(sinceDate.toISOString().slice(0, 16));
  }, [rangePreset, customSinceDate, customSinceTime, customUntilDate, customUntilTime]);

  useEffect(() => {
    if (rangePreset !== "custom") {
      setCustomSinceDate("");
      setCustomUntilDate("");
      return;
    }

    if (since) {
      setCustomSinceDate(since.slice(0, 10));
      setCustomSinceTime(since.slice(11, 16));
    }

    if (until) {
      setCustomUntilDate(until.slice(0, 10));
      setCustomUntilTime(until.slice(11, 16));
    }
  }, [rangePreset, since, until]);

  const [selectedAdapterId, setSelectedAdapterId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // System metrics with historical data
  const {
    data: metrics,
    isLoading: metricsLoading,
    mutate: refreshMetrics
  } = useSWR("system-metrics", getSystemMetrics, { refreshInterval: 5000 });

  // Weasel services status
  const {
    data: servicesStatus,
    isLoading: servicesLoading,
    mutate: refreshServices
  } = useSWR("weasel-services-status", getWeaselServicesStatus, { refreshInterval: 5000 });

  // Legacy status for backward compatibility
  const {
    data: status,
    isLoading: statusLoading,
    mutate: refreshStatus
  } = useSWR("/api/system/status", statusFetcher, { refreshInterval: 5000 });

  const {
    data: adapters,
    isLoading: adaptersLoading,
    mutate: refreshAdapters
  } = useSWR("network-adapters", adaptersFetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });

  const {
    data: networkStats,
    isLoading: networkStatsLoading,
    mutate: refreshNetworkStats
  } = useSWR(
    selectedAdapterId ? ["network-stats", selectedAdapterId] : null,
    ([, adapterId]: [string, string]) => networkStatsFetcher(adapterId),
    { revalidateOnFocus: false, refreshInterval: 5000 }
  );

  useEffect(() => {
    if (adapters && Array.isArray(adapters) && adapters.length > 0 && !selectedAdapterId) {
      const activeAdapter = adapters.find(a => a.status === "Up") || adapters[0];
      setSelectedAdapterId(activeAdapter?.id || null);
    }
  }, [adapters, selectedAdapterId]);

  const handleRefresh = () => {
    refreshMetrics();
    refreshServices();
    refreshStatus();
    refreshAdapters();
    if (selectedAdapterId) {
      refreshNetworkStats();
    }
    setLastRefresh(new Date());
  };

  const eventKey = useMemo(() => {
    const params = new URLSearchParams({
      logName,
      max: String(maxEvents)
    });
    if (level && level !== "all") {
      params.set("level", level);
    }
    if (since) {
      params.set("since", new Date(since).toISOString());
    }
    if (until) {
      params.set("until", new Date(until).toISOString());
    }
    return `/api/system/events?${params.toString()}`;
  }, [logName, level, since, until, maxEvents]);

  const {
    data: events,
    isLoading: eventsLoading,
    mutate: refreshEvents
  } = useSWR(eventKey, eventsFetcher);

  // Use metrics.current if available, otherwise fall back to status
  const currentStatus = metrics?.current || status;

  const systemTabs: { key: SystemTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: t("system.overview.title"), icon: <GaugeCircle size={16} /> },
    { key: "events", label: "Events", icon: <FileText size={16} /> },
    { key: "tasks", label: "Task Manager", icon: <Activity size={16} /> },
    { key: "services", label: "Services", icon: <Server size={16} /> }
  ];

  return (
    <section className="space-y-4">
      <div className="submenu-container">
        {systemTabs.map(({ key, label, icon }) => (
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

      {tab === "overview" && (
        <>
          {/* Header with refresh */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {t("system.overview.lastUpdated")}: {formatDate(lastRefresh.toISOString())}
            </p>
            <button className="btn-outline" onClick={handleRefresh}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>

          {/* CPU & Memory Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="panel">
              <div className="flex items-center gap-2 mb-2">
                <Cpu size={18} style={{ color: 'var(--color-accent-primary)' }} />
                <h3 className="panel-title mb-0">{t("system.overview.cpuUsage")}</h3>
              </div>
              {metricsLoading && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>}
              {metrics?.current ? (
                <MetricChart
                  data={metrics.cpuHistory.length > 0 ? metrics.cpuHistory : [{ value: metrics.current.cpuUsagePercent, timestamp: new Date().toISOString() }]}
                  label=""
                  unit="%"
                  color="var(--color-accent-primary)"
                  height={180}
                />
              ) : !metricsLoading ? (
                <div className="h-[180px] flex items-center justify-center panel">
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.collectingData")}</p>
                </div>
              ) : null}
            </div>
            <div className="panel">
              <div className="flex items-center gap-2 mb-2">
                <MemoryStick size={18} style={{ color: 'var(--color-accent-primary)' }} />
                <h3 className="panel-title mb-0">{t("system.overview.memoryUsage")}</h3>
              </div>
              {metricsLoading && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>}
              {metrics?.current ? (
                <MetricChart
                  data={metrics.memoryHistory.length > 0 ? metrics.memoryHistory : [{ value: metrics.current.memoryUsagePercent, timestamp: new Date().toISOString() }]}
                  label=""
                  unit="%"
                  color="var(--color-success)"
                  height={180}
                />
              ) : !metricsLoading ? (
                <div className="h-[180px] flex items-center justify-center panel">
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.collectingData")}</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* System Information */}
          <div className="panel">
            <div className="flex items-center gap-2 mb-4">
              <Computer size={18} style={{ color: 'var(--color-accent-primary)' }} />
              <h3 className="panel-title mb-0">{t("system.overview.systemInfo")}</h3>
            </div>
            {currentStatus && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.hostname")}</p>
                  <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{currentStatus.hostname}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.ipAddress")}</p>
                  <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{currentStatus.ipAddress}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.cpuUsage")}</p>
                  <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{currentStatus.cpuUsagePercent.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.memoryUsage")}</p>
                  <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{currentStatus.memoryUsagePercent.toFixed(1)}%</p>
                </div>
              </div>
            )}
            {!currentStatus && (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading system information...</p>
            )}
          </div>

          {/* Weasel Services */}
          <div className="panel">
            <div className="flex items-center gap-2 mb-4">
              <Server size={18} style={{ color: 'var(--color-accent-primary)' }} />
              <h3 className="panel-title mb-0">{t("system.overview.weaselServices")}</h3>
            </div>
            {servicesLoading && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading services...</p>}
            {servicesStatus && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* VNC Server */}
                <ServiceStatusCard
                  title={t("system.overview.vncServer")}
                  icon={ServiceIcons.vnc}
                  status={servicesStatus.vnc.isRunning ? "running" : servicesStatus.vnc.enabled ? "enabled" : "disabled"}
                  statusLabel={servicesStatus.vnc.isRunning ? t("system.overview.running") : servicesStatus.vnc.enabled ? t("system.overview.enabled") : t("system.overview.disabled")}
                  metrics={[
                    { label: t("system.overview.port"), value: servicesStatus.vnc.port },
                    { label: t("system.overview.activeConnections"), value: servicesStatus.vnc.connectionCount },
                    { label: t("system.overview.activeRecordings"), value: servicesStatus.vnc.activeRecordingSessions },
                    { label: t("system.overview.autoStart"), value: servicesStatus.vnc.autoStart ? "Yes" : "No" }
                  ]}
                  navigateTo="#/tools/vnc"
                  isRunning={servicesStatus.vnc.isRunning}
                />

                {/* Storage Monitor */}
                <ServiceStatusCard
                  title={t("system.overview.storageMonitor")}
                  icon={ServiceIcons.storage}
                  status={servicesStatus.storageMonitor.enabled ? (servicesStatus.storageMonitor.activeAlertsCount > 0 ? "warning" : "enabled") : "disabled"}
                  statusLabel={servicesStatus.storageMonitor.enabled ? t("system.overview.enabled") : t("system.overview.disabled")}
                  metrics={[
                    { label: t("system.overview.monitoredDrives"), value: servicesStatus.storageMonitor.monitoredDrivesCount },
                    { label: t("system.overview.monitoredFolders"), value: servicesStatus.storageMonitor.monitoredFoldersCount },
                    { label: t("system.overview.activeAlerts"), value: servicesStatus.storageMonitor.activeAlertsCount },
                    { label: t("system.overview.lastCheck"), value: servicesStatus.storageMonitor.lastCheck ? formatDate(servicesStatus.storageMonitor.lastCheck) : "-" }
                  ]}
                  navigateTo="#/tools/storage-monitor"
                />

                {/* Application Monitor */}
                <ServiceStatusCard
                  title={t("system.overview.applicationMonitor")}
                  icon={ServiceIcons.application}
                  status={servicesStatus.applicationMonitor.enabled ? "enabled" : "disabled"}
                  statusLabel={servicesStatus.applicationMonitor.enabled ? t("system.overview.enabled") : t("system.overview.disabled")}
                  metrics={[
                    { label: t("system.overview.totalApplications"), value: servicesStatus.applicationMonitor.totalApplicationsCount },
                    { label: t("system.overview.enabledApplications"), value: servicesStatus.applicationMonitor.enabledApplicationsCount },
                    { label: t("system.overview.currentlyRunning"), value: servicesStatus.applicationMonitor.currentlyRunningCount },
                    { label: t("system.overview.recentRestarts"), value: servicesStatus.applicationMonitor.recentRestartsCount }
                  ]}
                  navigateTo="#/tools/application-monitor"
                />

                {/* Screenshot Service */}
                <ServiceStatusCard
                  title={t("system.overview.screenshotService")}
                  icon={ServiceIcons.screenshot}
                  status={servicesStatus.screenshot.intervalCaptureEnabled ? "enabled" : "disabled"}
                  statusLabel={servicesStatus.screenshot.intervalCaptureEnabled ? t("system.overview.intervalCapture") : t("system.overview.disabled")}
                  metrics={[
                    { label: t("system.overview.interval"), value: `${servicesStatus.screenshot.intervalSeconds} ${t("system.overview.seconds")}` },
                    { label: t("system.overview.recentScreenshots"), value: servicesStatus.screenshot.recentScreenshotsCount },
                    { label: t("system.overview.totalScreenshots"), value: servicesStatus.screenshot.totalScreenshotsCount }
                  ]}
                  navigateTo="#/tools/screenshots"
                />

                {/* Terminal Sessions */}
                <ServiceStatusCard
                  title={t("system.overview.terminalSessions")}
                  icon={ServiceIcons.terminal}
                  status={servicesStatus.terminal.activeSessionsCount > 0 ? "running" : "disabled"}
                  statusLabel={servicesStatus.terminal.activeSessionsCount > 0 ? `${servicesStatus.terminal.activeSessionsCount} ${t("system.overview.activeSessions")}` : t("system.overview.inactive")}
                  metrics={[
                    { label: t("system.overview.activeSessions"), value: servicesStatus.terminal.activeSessionsCount }
                  ]}
                  navigateTo="#/tools/terminal"
                />

                {/* VNC Recordings */}
                <ServiceStatusCard
                  title={t("system.overview.vncRecordings")}
                  icon={ServiceIcons.recordings}
                  status={servicesStatus.recordings.totalRecordingsCount > 0 ? "enabled" : "disabled"}
                  statusLabel={`${servicesStatus.recordings.totalRecordingsCount} ${t("system.overview.totalRecordings")}`}
                  metrics={[
                    { label: t("system.overview.totalRecordings"), value: servicesStatus.recordings.totalRecordingsCount },
                    { label: t("system.overview.recentRecordings"), value: servicesStatus.recordings.recentRecordingsCount },
                    { label: t("system.overview.recordingsStorage"), value: formatBytes(servicesStatus.recordings.totalStorageBytes) }
                  ]}
                  navigateTo="#/tools/vnc"
                />
              </div>
            )}
          </div>

          {/* Storage */}
          <div className="panel">
            <div className="flex items-center gap-2 mb-4">
              <HardDrive size={18} style={{ color: 'var(--color-accent-primary)' }} />
              <h3 className="panel-title mb-0">{t("system.overview.storage")}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentStatus?.drives && Array.isArray(currentStatus.drives) && currentStatus.drives.map((drive) => {
                const used = drive.totalBytes - drive.freeBytes;
                const percent = (used / drive.totalBytes) * 100;
                const isHighUsage = percent > 90;
                const isMediumUsage = percent > 75;
                return (
                  <div
                    key={drive.name}
                    className="panel"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                        <HardDrive size={16} /> {drive.name}
                      </p>
                      <span 
                        className="text-xs font-semibold"
                        style={{ 
                          color: isHighUsage ? 'var(--color-error)' : isMediumUsage ? 'var(--color-warning)' : 'var(--color-success)'
                        }}
                      >
                        {percent.toFixed(1)}%
                      </span>
                    </div>
                    <div 
                      className="h-2 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--color-border-muted)' }}
                    >
                      <div
                        className="h-full transition-all"
                        style={{ 
                          width: `${percent}%`,
                          backgroundColor: isHighUsage ? 'var(--color-error)' : isMediumUsage ? 'var(--color-warning)' : 'var(--color-accent-primary)'
                        }}
                      />
                    </div>
                    <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatBytes(used)} / {formatBytes(drive.totalBytes)}
                    </p>
                  </div>
                );
              })}
              {(!currentStatus?.drives || !Array.isArray(currentStatus.drives) || !currentStatus.drives.length) && (
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No drives detected.</p>
              )}
            </div>
          </div>

          {/* Network */}
          <div className="panel">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wifi size={18} style={{ color: 'var(--color-accent-primary)' }} />
                <h3 className="panel-title mb-0">{t("system.overview.network")}</h3>
              </div>
              <select
                className="input-text"
                value={selectedAdapterId || ""}
                onChange={(e) => setSelectedAdapterId(e.target.value || null)}
              >
                <option value="">Select adapter...</option>
                {adapters && Array.isArray(adapters) && adapters.map((adapter) => (
                  <option key={adapter.id} value={adapter.id}>
                    {adapter.name} ({adapter.status})
                  </option>
                ))}
              </select>
            </div>

            {adaptersLoading && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading adapters…</p>}

            {selectedAdapterId && adapters && (
              <div className="space-y-4">
                {(() => {
                  if (!adapters || !Array.isArray(adapters)) return null;
                  const adapter = adapters.find(a => a.id === selectedAdapterId);
                  if (!adapter) return null;

                  return (
                    <div className="panel space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.adapterStatus")}</p>
                          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{adapter.description}</p>
                          <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>Status: {adapter.status}</p>
                          {adapter.macAddress && (
                            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>MAC: {adapter.macAddress}</p>
                          )}
                          {adapter.speedBytesPerSecond && (
                            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                              Speed: {formatBytes(adapter.speedBytesPerSecond)}/s
                            </p>
                          )}
                        </div>

                        {adapter.ipAddresses && Array.isArray(adapter.ipAddresses) && adapter.ipAddresses.length > 0 && (
                          <div>
                            <p className="text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.ipAddress")}</p>
                            <div className="space-y-1">
                              {adapter.ipAddresses.map((ip, idx) => (
                                <p key={idx} className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>{ip}</p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {networkStatsLoading && (
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Loading statistics…</p>
                      )}

                      {networkStats && (
                        <div className="pt-3 border-t" style={{ borderColor: 'var(--color-border-muted)' }}>
                          <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.throughput")}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.bytesReceived")}</p>
                              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                {formatBytes(networkStats.bytesReceived)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t("system.overview.bytesSent")}</p>
                              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                {formatBytes(networkStats.bytesSent)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Packets Received</p>
                              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                {networkStats.packetsReceived.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Packets Sent</p>
                              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                {networkStats.packetsSent.toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                            {t("system.overview.lastUpdated")}: {formatDate(networkStats.capturedAt)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {!selectedAdapterId && !adaptersLoading && (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Select a network adapter to view information.</p>
            )}
          </div>
        </>
      )}

      {tab === "tasks" && (
        <div className="grid grid-cols-1">
          <TaskManager />
        </div>
      )}

      {tab === "services" && (
        <div className="grid grid-cols-1">
          <ServiceManager />
        </div>
      )}

      {tab === "events" && (
        <div className="panel space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="panel-title mb-0">Event Log</h3>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Log</p>
              <select
                className="input-text"
                value={logName}
                onChange={(e) => setLogName(e.target.value)}
              >
                <option value="System">System</option>
                <option value="Application">Application</option>
                <option value="Security">Security</option>
                <option value="Setup">Setup</option>
              </select>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Level</p>
              <select
                className="input-text"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="all">All</option>
                <option value="Critical">Critical</option>
                <option value="Error">Error</option>
                <option value="Warning">Warning</option>
                <option value="Information">Information</option>
                <option value="Verbose">Verbose</option>
              </select>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Range</p>
              <select
                className="input-text"
                value={rangePreset}
                onChange={(e) => setRangePreset(e.target.value as RangePreset)}
              >
                <option value="1h">Last hour</option>
                <option value="6h">Last 6 hours</option>
                <option value="24h">Last 24 hours</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {rangePreset === "custom" && (
              <>
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>From</p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="input-text"
                      value={customSinceDate}
                      onChange={(e) => setCustomSinceDate(e.target.value)}
                    />
                    <input
                      type="time"
                      className="input-text"
                      value={customSinceTime}
                      onChange={(e) => setCustomSinceTime(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>To</p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="input-text"
                      value={customUntilDate}
                      onChange={(e) => setCustomUntilDate(e.target.value)}
                    />
                    <input
                      type="time"
                      className="input-text"
                      value={customUntilTime}
                      onChange={(e) => setCustomUntilTime(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Max</p>
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                className="input-text w-24"
                value={maxEvents}
                onChange={(e) =>
                  setMaxEvents(
                    Math.min(500, Math.max(10, Number(e.target.value) || 50))
                  )
                }
              />
            </div>
            <button className="btn-outline" onClick={() => refreshEvents()}>
              Refresh
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {eventsLoading && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>}
            {!eventsLoading &&
              events && Array.isArray(events) && events.map((entry) => (
                <div
                  key={`${entry.eventId}-${entry.timestamp}-${entry.provider}`}
                  className="panel"
                >
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    [{entry.level}] {entry.provider}
                  </p>
                  <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    {formatDate(entry.timestamp)} · #{entry.eventId}
                  </p>
                  <p className="text-sm whitespace-pre-line" style={{ color: 'var(--color-text-primary)' }}>
                    {entry.message}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
