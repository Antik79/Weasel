import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Activity, HardDrive, Wifi, RefreshCw, GaugeCircle, Server, FileText } from "lucide-react";
import { api } from "../api/client";
import { EventLogEntry, SystemStatus, NetworkAdapterInfo, NetworkAdapterStats } from "../types";
import { formatBytes, formatDate } from "../utils/format";
import TaskManager from "./TaskManager";
import ServiceManager from "./ServiceManager";

const statusFetcher = (url: string) => api<SystemStatus>(url);
const eventsFetcher = (url: string) => api<EventLogEntry[]>(url);
const adaptersFetcher = () => api<NetworkAdapterInfo[]>("/api/system/network/adapters");
const networkStatsFetcher = (adapterId: string) => api<NetworkAdapterStats>(`/api/system/network/stats/${encodeURIComponent(adapterId)}`);

type SystemTab = "overview" | "tasks" | "services" | "events";
type RangePreset = "1h" | "6h" | "24h" | "custom";

export default function SystemDashboard() {
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

  const systemTabs: { key: SystemTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <GaugeCircle size={16} /> },
    { key: "events", label: "Events", icon: <FileText size={16} /> },
    { key: "tasks", label: "Task Manager", icon: <Activity size={16} /> },
    { key: "services", label: "Services", icon: <Server size={16} /> }
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
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
      </div>

      {tab === "overview" && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">
              Last refreshed: {formatDate(lastRefresh.toISOString())}
            </p>
            <button className="btn-outline" onClick={handleRefresh}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="panel">
              <h3 className="panel-title">Realtime</h3>
              {statusLoading && <p className="text-slate-400 text-sm">Loading…</p>}
              {status && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                      <Activity size={16} /> CPU
                    </p>
                    <p className="text-3xl font-semibold text-white">
                      {status.cpuUsagePercent.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                    <p className="text-sm text-slate-400 flex items-center gap-2">
                      <Activity size={16} /> Memory
                    </p>
                    <p className="text-3xl font-semibold text-white">
                      {status.memoryUsagePercent.toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="panel">
              <h3 className="panel-title">Storage</h3>
              <div className="space-y-3">
                {status?.drives && Array.isArray(status.drives) && status.drives.map((drive) => {
                  const used = drive.totalBytes - drive.freeBytes;
                  const percent = (used / drive.totalBytes) * 100;
                  return (
                    <div
                      key={drive.name}
                      className="bg-slate-900/60 rounded-lg p-3 border border-slate-800"
                    >
                      <p className="text-sm text-slate-300 flex items-center gap-2">
                        <HardDrive size={16} /> {drive.name}
                      </p>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-gradient-to-r from-sky-400 to-blue-600"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatBytes(used)} used of {formatBytes(drive.totalBytes)}
                      </p>
                    </div>
                  );
                })}
                {(!status?.drives || !Array.isArray(status.drives) || !status.drives.length) && (
                  <p className="text-sm text-slate-400">No drives detected.</p>
                )}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="flex items-center justify-between mb-3">
              <h3 className="panel-title mb-0">Network</h3>
              <select
                className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm text-white"
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

            {adaptersLoading && <p className="text-slate-400 text-sm">Loading adapters…</p>}

            {selectedAdapterId && adapters && (
              <div className="space-y-4">
                {(() => {
                  if (!adapters || !Array.isArray(adapters)) return null;
                  const adapter = adapters.find(a => a.id === selectedAdapterId);
                  if (!adapter) return null;

                  return (
                    <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-800 space-y-3">
                      <div>
                        <p className="text-sm text-slate-400 mb-1">Adapter Information</p>
                        <p className="text-sm font-semibold text-white">{adapter.description}</p>
                        <p className="text-xs text-slate-400 mt-1">Status: {adapter.status}</p>
                        {adapter.macAddress && (
                          <p className="text-xs text-slate-400">MAC: {adapter.macAddress}</p>
                        )}
                        {adapter.speedBytesPerSecond && (
                          <p className="text-xs text-slate-400">
                            Speed: {formatBytes(adapter.speedBytesPerSecond)}/s
                          </p>
                        )}
                      </div>

                      {adapter.ipAddresses && Array.isArray(adapter.ipAddresses) && adapter.ipAddresses.length > 0 && (
                        <div>
                          <p className="text-sm text-slate-400 mb-1">IP Addresses</p>
                          <div className="space-y-1">
                            {adapter.ipAddresses.map((ip, idx) => (
                              <p key={idx} className="text-sm text-slate-300 font-mono">{ip}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {networkStatsLoading && (
                        <p className="text-xs text-slate-400">Loading statistics…</p>
                      )}

                      {networkStats && (
                        <div>
                          <p className="text-sm text-slate-400 mb-2 flex items-center gap-2">
                            <Wifi size={16} /> Statistics (Realtime)
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs text-slate-500">Bytes Received</p>
                              <p className="text-sm font-semibold text-white">
                                {formatBytes(networkStats.bytesReceived)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Bytes Sent</p>
                              <p className="text-sm font-semibold text-white">
                                {formatBytes(networkStats.bytesSent)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Packets Received</p>
                              <p className="text-sm font-semibold text-white">
                                {networkStats.packetsReceived.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Packets Sent</p>
                              <p className="text-sm font-semibold text-white">
                                {networkStats.packetsSent.toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            Last updated: {formatDate(networkStats.capturedAt)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {!selectedAdapterId && !adaptersLoading && (
              <p className="text-sm text-slate-400">Select a network adapter to view information.</p>
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
              <p className="text-xs text-slate-400 mb-1">Log</p>
              <select
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
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
              <p className="text-xs text-slate-400 mb-1">Level</p>
              <select
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
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
              <p className="text-xs text-slate-400 mb-1">Range</p>
              <select
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
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
                  <p className="text-xs text-slate-400 mb-1">From</p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
                      value={customSinceDate}
                      onChange={(e) => setCustomSinceDate(e.target.value)}
                    />
                    <input
                      type="time"
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
                      value={customSinceTime}
                      onChange={(e) => setCustomSinceTime(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">To</p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
                      value={customUntilDate}
                      onChange={(e) => setCustomUntilDate(e.target.value)}
                    />
                    <input
                      type="time"
                      className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
                      value={customUntilTime}
                      onChange={(e) => setCustomUntilTime(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <p className="text-xs text-slate-400 mb-1">Max</p>
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white w-24"
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
            {eventsLoading && <p className="text-sm text-slate-400">Loading…</p>}
            {!eventsLoading &&
              events && Array.isArray(events) && events.map((entry) => (
                <div
                  key={`${entry.eventId}-${entry.timestamp}-${entry.provider}`}
                  className="border border-slate-800 rounded-lg p-3 bg-slate-900/60"
                >
                  <p className="text-sm font-semibold text-white">
                    [{entry.level}] {entry.provider}
                  </p>
                  <p className="text-xs text-slate-400 mb-2">
                    {formatDate(entry.timestamp)} · #{entry.eventId}
                  </p>
                  <p className="text-sm text-slate-200 whitespace-pre-line">
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

