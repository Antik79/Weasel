import { useMemo, useState } from "react";
import useSWR from "swr";
import { Play, RotateCcw, Square } from "lucide-react";
import { api } from "../api/client";
import { SystemServiceInfo } from "../types";
import Table, { TableColumn } from "../components/Table";
import Pagination from "../components/Pagination";

const fetcher = (status: string) =>
  api<SystemServiceInfo[]>(
    `/api/services${status ? `?status=${encodeURIComponent(status)}` : ""}`
  );

export default function ServiceManager() {
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('weasel.serviceManager.pageSize');
    return saved ? parseInt(saved) : 50;
  });
  const [currentPage, setCurrentPage] = useState<number>(1);

  const { data, isLoading, mutate } = useSWR(
    ["services", statusFilter],
    ([, status]) => fetcher(status),
    { refreshInterval: 10000 }
  );

  const filteredServices = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    if (!query) return data;
    return data.filter((svc) =>
      `${svc.displayName} ${svc.serviceName}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [data, query]);

  const paginatedServices = useMemo(() => {
    if (pageSize === 0) return filteredServices;
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredServices.slice(start, end);
  }, [filteredServices, pageSize, currentPage]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    localStorage.setItem('weasel.serviceManager.pageSize', size.toString());
  };

  const invoke = async (serviceName: string, action: "start" | "stop" | "restart") => {
    await api(`/api/services/${serviceName}/${action}`, { method: "POST" });
    await mutate();
  };

  return (
    <section className="panel space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs text-slate-400 mb-1">Status</p>
          <select
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm text-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="Running">Running</option>
            <option value="Stopped">Stopped</option>
            <option value="Paused">Paused</option>
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs text-slate-400 mb-1">Search</p>
          <input
            className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-1 text-sm text-white"
            placeholder="Filter by service name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <Table
        data={paginatedServices}
        columns={[
          {
            key: "displayName",
            label: "Service",
            sortable: true,
            sortFn: (a, b) => a.displayName.localeCompare(b.displayName),
            render: (svc) => (
              <div>
                <p className="text-white font-medium">{svc.displayName}</p>
                <p className="text-xs text-slate-400">{svc.serviceName}</p>
              </div>
            )
          },
          {
            key: "status",
            label: "Status",
            sortable: true,
            sortFn: (a, b) => a.status.localeCompare(b.status),
            render: (svc) => <span>{svc.status}</span>
          },
          {
            key: "serviceType",
            label: "Type",
            sortable: true,
            sortFn: (a, b) => a.serviceType.localeCompare(b.serviceType),
            render: (svc) => <span>{svc.serviceType}</span>
          },
          {
            key: "actions",
            label: "",
            sortable: false,
            render: (svc) => (
              <div className="text-right space-x-2">
                <button
                  className="icon-btn"
                  disabled={!svc.canStop}
                  onClick={() => invoke(svc.serviceName, "stop")}
                >
                  <Square size={16} />
                </button>
                <button
                  className="icon-btn"
                  disabled={!svc.canPauseAndContinue && !svc.canStop}
                  onClick={() => invoke(svc.serviceName, "restart")}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => invoke(svc.serviceName, "start")}
                >
                  <Play size={16} />
                </button>
              </div>
            )
          }
        ]}
        keyExtractor={(svc) => svc.serviceName}
        isLoading={isLoading}
        emptyMessage="No services match your filters."
      />
      <Pagination
        currentPage={currentPage}
        totalItems={filteredServices.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </section>
  );
}

