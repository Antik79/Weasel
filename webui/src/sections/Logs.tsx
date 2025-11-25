import { useEffect, useMemo, useState, useRef } from "react";
import useSWR from "swr";
import { RefreshCw, FileText, Folder, Archive, Download, ArrowUp, ArrowDown, Search as SearchIcon } from "lucide-react";
import { api } from "../api/client";
import { getAuthToken } from "../components/Login";
import { LogsResponse, LogFileInfo } from "../types";
import { formatBytes, formatDate } from "../utils/format";
import { useTranslation } from "../i18n/i18n";

const logsFetcher = (subfolder?: string) => {
  const url = new URL("/api/logs", window.location.origin);
  if (subfolder) {
    url.searchParams.set("subfolder", subfolder);
  }
  return api<LogsResponse>(url.toString());
};

const openLogDownload = (fileName: string, subfolder?: string | null) => {
  const authToken = getAuthToken();
  const url = new URL(`/api/logs/${encodeURIComponent(fileName)}`, window.location.origin);
  if (subfolder) {
    url.searchParams.set("subfolder", subfolder);
  }
  if (authToken) {
    url.searchParams.set("token", authToken);
  }
  window.open(url.toString(), "_blank");
};

export default function Logs() {
  const { t } = useTranslation();
  const [selectedLogSubfolder, setSelectedLogSubfolder] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logSortConfig, setLogSortConfig] = useState<{ key: 'name' | 'size' | 'date'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [logFolderSortConfig, setLogFolderSortConfig] = useState<{ key: 'name' | 'date'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [logLeftPanelWidth, setLogLeftPanelWidth] = useState(33);
  const [isLogResizing, setIsLogResizing] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  const {
    data: logsResponse,
    isLoading: logsLoading,
    mutate: refreshLogs
  } = useSWR(["logs", selectedLogSubfolder], () => logsFetcher(selectedLogSubfolder ?? undefined), { refreshInterval: 15000 });

  const logFiles = logsResponse?.files ?? [];
  const logFolder = logsResponse?.folder ?? "";
  const logSubfolders = logsResponse?.subfolders ?? [];

  const { data: logContent, isLoading: logContentLoading } = useSWR(
    selectedLog ? ["log", selectedLog, selectedLogSubfolder] : null,
    ([, fileName, subfolder]: [string, string, string | null]) => {
      const url = new URL(`/api/logs/${encodeURIComponent(fileName)}`, window.location.origin);
      if (subfolder) {
        url.searchParams.set("subfolder", subfolder);
      }
      return api<string>(url.toString());
    },
    { 
      revalidateOnFocus: true,
      refreshInterval: 2000 // Auto-refresh every 2 seconds for tailing
    }
  );

  useEffect(() => {
    if (!selectedLog && logFiles.length > 0) {
      setSelectedLog(logFiles[0].name);
    }
  }, [selectedLog, logFiles]);

  // Log resizing logic
  useEffect(() => {
    if (!isLogResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!logContainerRef.current) return;
      const containerRect = logContainerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      const clampedWidth = Math.max(20, Math.min(60, newWidth));
      setLogLeftPanelWidth(clampedWidth);
      localStorage.setItem('weasel.logs.leftPanelWidth', clampedWidth.toString());
    };

    const handleMouseUp = () => {
      setIsLogResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isLogResizing]);

  // Load saved panel width
  useEffect(() => {
    const saved = localStorage.getItem('weasel.logs.leftPanelWidth');
    if (saved) {
      setLogLeftPanelWidth(parseInt(saved));
    }
  }, []);

  // Log sorting and filtering
  const sortedLogFolders = useMemo(() => {
    const folders = [...logSubfolders];
    if (selectedLogSubfolder && !selectedLogSubfolder.includes('/Archive')) {
      // Add Archive folder if not in Archive
      folders.push(`${selectedLogSubfolder}/Archive`);
    }
    return folders.sort((a, b) => {
      let comparison = 0;
      switch (logFolderSortConfig.key) {
        case 'name':
          comparison = a.localeCompare(b);
          break;
        case 'date':
          // For folders, we can't really sort by date, so just use name
          comparison = a.localeCompare(b);
          break;
      }
      return logFolderSortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [logSubfolders, selectedLogSubfolder, logFolderSortConfig]);

  const filteredLogFiles = useMemo(() => {
    if (!Array.isArray(logFiles)) return [];
    if (!logSearchQuery) return logFiles;
    const query = logSearchQuery.toLowerCase();
    return logFiles.filter((file) => file.name.toLowerCase().includes(query));
  }, [logFiles, logSearchQuery]);

  const sortedLogFiles = useMemo(() => {
    return [...filteredLogFiles].sort((a, b) => {
      let comparison = 0;
      switch (logSortConfig.key) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.sizeBytes - b.sizeBytes;
          break;
        case 'date':
          comparison = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
          break;
      }
      return logSortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredLogFiles, logSortConfig]);

  const handleLogSort = (key: 'name' | 'size' | 'date') => {
    setLogSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleLogFolderSort = (key: 'name' | 'date') => {
    setLogFolderSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const startLogResizing = () => {
    setIsLogResizing(true);
  };
  
  useEffect(() => {
    // Clear selected log when subfolder changes
    setSelectedLog(null);
  }, [selectedLogSubfolder]);

  return (
    <section className="space-y-4">
      <div className="panel space-y-4">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded border border-slate-800 overflow-hidden">
          <span className="text-slate-500 flex-shrink-0">{t("common.path")}:</span>
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
            <button
              className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline flex-shrink-0"
              onClick={() => {
                setSelectedLogSubfolder(null);
                setSelectedLog(null);
              }}
              title="Go to root"
            >
              Logs
            </button>
            {selectedLogSubfolder && selectedLogSubfolder.split('/').filter(Boolean).map((segment, index, arr) => {
              const pathUpToSegment = arr.slice(0, index + 1).join('/');
              const isLast = index === arr.length - 1;
              return (
                <div key={index} className="flex items-center gap-1 flex-shrink-0 min-w-0">
                  <span className="text-slate-500 flex-shrink-0">/</span>
                  <button
                    className={`text-sm font-medium truncate max-w-[150px] ${isLast
                      ? "text-white"
                      : "text-sky-400 hover:text-sky-300 hover:underline"
                      }`}
                    onClick={() => {
                      if (!isLast) {
                        setSelectedLogSubfolder(pathUpToSegment);
                        setSelectedLog(null);
                      }
                    }}
                    disabled={isLast}
                    title={pathUpToSegment}
                  >
                    {segment}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button className="icon-btn" onClick={() => refreshLogs()} title={t("common.refresh")}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Two-panel layout */}
        <div ref={logContainerRef} className="flex flex-row gap-2" style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
          {/* Folders Panel (Left) */}
          <div className="panel flex flex-col overflow-hidden" style={{ width: `${logLeftPanelWidth}%`, minWidth: '250px' }}>
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="panel-title mb-0">Folders</h3>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <button className="hover:text-white flex items-center gap-1" onClick={() => handleLogFolderSort('name')}>
                  Name {logFolderSortConfig.key === 'name' && (logFolderSortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
              </div>
            </div>
            <div className="divide-y divide-slate-800 overflow-y-auto flex-1 pr-2">
              {logsLoading && <p className="py-4 text-sm text-slate-400">Loading…</p>}
              {!logsLoading && sortedLogFolders.length === 0 && (
                <p className="py-4 text-sm text-slate-400">No folders</p>
              )}
              {!logsLoading && sortedLogFolders.map((folder) => {
                const isArchive = folder.toLowerCase().includes('archive');
                const folderName = folder.split('/').pop() || folder;
                return (
                  <div
                    key={folder}
                    className={`item-row hover:bg-slate-800/50 cursor-pointer ${selectedLogSubfolder === folder ? "bg-slate-800/70" : ""
                      }`}
                    onClick={() => {
                      setSelectedLogSubfolder(folder);
                      setSelectedLog(null);
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isArchive ? <Archive size={18} className="text-amber-300 flex-shrink-0" /> : <Folder size={18} className="text-amber-300 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{folderName}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resizer */}
          <div
            className="w-2 cursor-col-resize bg-slate-900 hover:bg-sky-500/50 transition-colors flex items-center justify-center z-10 flex-shrink-0 rounded"
            onMouseDown={startLogResizing}
          >
            <div className="h-8 w-1 bg-slate-600 rounded-full" />
          </div>

          {/* Files Panel (Right) */}
          <div className="panel flex-1 flex flex-col overflow-hidden" style={{ minWidth: '400px' }}>
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="panel-title mb-0">Log Files</h3>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <button className="hover:text-white flex items-center gap-1" onClick={() => handleLogSort('name')}>
                  Name {logSortConfig.key === 'name' && (logSortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
                <button className="hover:text-white flex items-center gap-1" onClick={() => handleLogSort('size')}>
                  Size {logSortConfig.key === 'size' && (logSortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
                <button className="hover:text-white flex items-center gap-1" onClick={() => handleLogSort('date')}>
                  Date {logSortConfig.key === 'date' && (logSortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
              </div>
            </div>
            
            {/* Search */}
            <div className="mb-2 flex-shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search log files..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 pl-9 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
                <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            <div className="divide-y divide-slate-800 overflow-y-auto flex-1 pr-2">
              {logsLoading && <p className="py-4 text-sm text-slate-400">Loading…</p>}
              {!logsLoading && sortedLogFiles.length === 0 && (
                <p className="py-4 text-sm text-slate-400">{logSearchQuery ? "No files match your search" : "No log files"}</p>
              )}
              {!logsLoading && sortedLogFiles.map((file) => (
                <div
                  key={file.name}
                  className={`item-row hover:bg-slate-800/50 cursor-pointer group ${selectedLog === file.name ? "bg-slate-800/70" : ""
                    }`}
                  onClick={() => setSelectedLog(file.name)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText size={18} className="text-blue-300 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatDate(file.lastModified)} • {formatBytes(file.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      className="icon-btn" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        openLogDownload(file.name, selectedLogSubfolder); 
                      }} 
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Log Content Viewer */}
        {selectedLog && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-white">{selectedLog}</p>
              <div className="flex gap-2">
                <button className="btn-outline" onClick={() => openLogDownload(selectedLog, selectedLogSubfolder)}>
                  <Download size={16} /> {t("tools.logs.download")}
                </button>
              </div>
            </div>
            {logContentLoading && <p className="text-sm text-slate-400">{t("tools.logs.loadingEntry")}</p>}
            {!logContentLoading && (
              <pre className="text-xs text-slate-300 whitespace-pre-wrap max-h-[400px] overflow-y-auto font-mono bg-slate-900/50 p-3 rounded border border-slate-800">
                {logContent || ""}
              </pre>
            )}
            <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" />
              <span>Tailing log (auto-refreshing every 2 seconds)</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

