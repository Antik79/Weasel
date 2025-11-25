import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, getUiPreferences, saveUiPreferences } from "../api/client";
import type { LogsResponse, LogFileInfo } from "../types";

interface LogPanelProps {
  name: string;
  title: string;
  subfolder: string;
}

export function LogPanel({ name, title, subfolder }: LogPanelProps) {
  const [isTailing, setIsTailing] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false); // Default: collapsed
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch UI preferences on mount
  const { data: uiPreferences } = useSWR("ui-preferences", getUiPreferences, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  // Initialize expansion state from preferences once
  useEffect(() => {
    if (uiPreferences && !initialLoadComplete) {
      const savedState = uiPreferences.logPanelExpanded?.[name];
      if (savedState !== undefined) {
        setIsExpanded(savedState);
      }
      setInitialLoadComplete(true);
    }
  }, [uiPreferences, name, initialLoadComplete]);

  // Save expansion state to backend (debounced)
  const saveExpansionState = (expanded: boolean) => {
    if (!uiPreferences) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const updated = {
          ...uiPreferences,
          logPanelExpanded: {
            ...uiPreferences.logPanelExpanded,
            [name]: expanded,
          },
        };
        await saveUiPreferences(updated);
      } catch (error) {
        console.error("Failed to save UI preferences:", error);
      }
    }, 500);
  };

  // Handle expansion toggle
  const handleToggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    if (initialLoadComplete) {
      saveExpansionState(newState);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Fetch log files for this component
  const { data: logFiles } = useSWR(
    isExpanded ? `${subfolder}-log-files` : null,
    () => {
      const url = new URL("/api/logs", window.location.origin);
      url.searchParams.set("subfolder", subfolder);
      return api<LogsResponse>(url.toString());
    },
    { refreshInterval: 10000 }
  );

  const latestLogFile = useMemo(() => {
    if (!logFiles?.files || logFiles.files.length === 0) return null;
    return logFiles.files.sort((a: LogFileInfo, b: LogFileInfo) => b.name.localeCompare(a.name))[0];
  }, [logFiles]);

  const { data: logContent, isLoading: logLoading } = useSWR(
    (isExpanded && latestLogFile) ? [`${subfolder}-log`, latestLogFile.name] : null,
    ([, fileName]: [string, string]) => {
      const url = new URL(`/api/logs/${encodeURIComponent(fileName)}`, window.location.origin);
      url.searchParams.set("subfolder", subfolder);
      return api<string>(url.toString());
    },
    {
      revalidateOnFocus: true,
      refreshInterval: isTailing ? 2000 : undefined // Auto-refresh only if tailing is enabled
    }
  );

  // Auto-scroll to bottom when tailing and new content arrives
  useEffect(() => {
    if (isTailing && isExpanded && logContent && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logContent, isTailing, isExpanded]);

  return (
    <div className="panel space-y-2">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={handleToggleExpanded}>
        <h3 className="panel-title mb-0 flex items-center gap-2">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          {title}
        </h3>
        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`tail-${subfolder}`}
              className="checkbox"
              checked={isTailing}
              onChange={(e) => setIsTailing(e.target.checked)}
              disabled={!isExpanded}
            />
            <label htmlFor={`tail-${subfolder}`} className={`text-xs ${!isExpanded ? "text-slate-600" : "text-slate-400 cursor-pointer"}`}>
              Tail Log
            </label>
          </div>
          <div className="text-xs text-slate-500 w-24 text-right">
            {logLoading ? "Loading..." : (isTailing && isExpanded ? "Live" : "Paused")}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div ref={logContainerRef} className="bg-slate-950 rounded border border-slate-800 p-3 max-h-96 overflow-y-auto font-mono text-xs">
          {logLoading && <p className="text-slate-400">Loading log...</p>}
          {!logLoading && !logContent && <p className="text-slate-400">No log content available</p>}
          {!logLoading && logContent && (
            <pre className="text-slate-300 whitespace-pre-wrap break-all">
              {logContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
