import { useMemo, useState } from "react";
import useSWR from "swr";
import { Package, RefreshCcw, Search as SearchIcon } from "lucide-react";
import { api } from "../api/client";
import { InstalledApplication, PackageOperationResult, PackageSearchResult, PackageShowResponse } from "../types";
import Table, { TableColumn } from "../components/Table";

const fetcher = (url: string) => api<InstalledApplication[]>(url);

export default function PackageManager() {
  const [search, setSearch] = useState("");
  const [showQuery, setShowQuery] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isShowing, setIsShowing] = useState(false);
  const [showResult, setShowResult] = useState<PackageShowResponse | null>(null);
  const { data, mutate, isLoading, error } = useSWR("/api/packages", fetcher, {
    revalidateOnFocus: false
  });

  const filtered = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    if (!search) return data;
    return data.filter((pkg) =>
      pkg.displayName.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  const execute = async (endpoint: "/install" | "/uninstall", targetIdentifier?: string) => {
    const id = targetIdentifier ?? identifier;
    if (!id) return;
    setIsBusy(true);
    try {
      const result = await api<PackageOperationResult>(`/api/packages${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ identifier: id })
      });
      alert(result.message);
      await mutate();
    } finally {
      setIsBusy(false);
    }
  };

  const showPackageDetails = async (targetIdentifier?: string) => {
    const query = (targetIdentifier ?? showQuery).trim();
    if (!query) {
      setShowResult(null);
      return;
    }
    setIsShowing(true);
    try {
      const response = await api<PackageShowResponse>(`/api/packages/show?identifier=${encodeURIComponent(query)}`);
      setShowResult(response);
    } catch (err) {
      alert(`Failed to fetch package information: ${err instanceof Error ? err.message : String(err)}`);
      setShowResult(null);
    } finally {
      setIsShowing(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">Applications</p>
          <h2 className="text-lg font-semibold text-white">
            Managed via winget
          </h2>
        </div>
        <div className="flex gap-2">
          <input
            className="bg-slate-900 border border-slate-800 rounded px-3 py-1 text-sm text-white"
            placeholder="Filter"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn-outline" onClick={() => mutate()}>
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
      </header>

      {error && (
        <p className="text-sm text-red-400">Failed to load packages: {String(error)}</p>
      )}

      {/* Package Lookup */}
      <div className="panel space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="panel-title mb-0 flex items-center gap-2">
            <SearchIcon size={18} /> Package lookup (winget show)
          </h3>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 input-text"
            placeholder="Package ID or moniker (e.g. Google.Chrome, chrome)"
            value={showQuery}
            onChange={(e) => setShowQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                showPackageDetails();
              }
            }}
          />
          <button
            className="btn-primary"
            onClick={showPackageDetails}
            disabled={isShowing || !showQuery.trim()}
          >
            <SearchIcon size={16} /> {isShowing ? "Fetching…" : "Show details"}
          </button>
        </div>

        {showResult?.message && !showResult?.package && (showResult.alternatives?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-400">{showResult.message}</p>
        )}

        {showResult?.package && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-lg font-semibold text-white">{showResult.package.name}</p>
                <p className="text-xs text-slate-400">ID: {showResult.package.id}</p>
                {showResult.package.version && (
                  <p className="text-xs text-slate-400 mt-1">Version: {showResult.package.version}</p>
                )}
                {showResult.package.publisher && (
                  <p className="text-xs text-slate-400">Publisher: {showResult.package.publisher}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-outline"
                  onClick={() => setIdentifier(showResult.package?.id ?? "")}
                >
                  Use ID
                </button>
                <button
                  className="btn-primary"
                  onClick={() => execute("/install", showResult.package?.id)}
                  disabled={isBusy}
                >
                  Install
                </button>
              </div>
            </div>
            {showResult.package.description && (
              <p className="text-sm text-slate-300">{showResult.package.description}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {showResult.package.homepage && (
                <div>
                  <p className="text-xs text-slate-500">Homepage</p>
                  <a href={showResult.package.homepage} target="_blank" rel="noreferrer" className="text-sky-400 break-all">
                    {showResult.package.homepage}
                  </a>
                </div>
              )}
              {showResult.package.license && (
                <div>
                  <p className="text-xs text-slate-500">License</p>
                  <span>{showResult.package.license}</span>
                  {showResult.package.licenseUrl && (
                    <div>
                      <a href={showResult.package.licenseUrl} target="_blank" rel="noreferrer" className="text-sky-400 break-all">
                        {showResult.package.licenseUrl}
                      </a>
                    </div>
                  )}
                </div>
              )}
              {showResult.package.installerType && (
                <div>
                  <p className="text-xs text-slate-500">Installer Type</p>
                  <span>{showResult.package.installerType}</span>
                </div>
              )}
              {showResult.package.installerUrl && (
                <div>
                  <p className="text-xs text-slate-500">Installer URL</p>
                  <a href={showResult.package.installerUrl} target="_blank" rel="noreferrer" className="text-sky-400 break-all">
                    {showResult.package.installerUrl}
                  </a>
                </div>
              )}
            </div>
            {(showResult.package.tags?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {showResult.package.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(showResult.package.documentationLinks?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Documentation</p>
                <ul className="list-disc pl-4 text-sky-400 text-sm space-y-1">
                  {showResult.package.documentationLinks.map((doc, idx) => (
                    <li key={`${doc}-${idx}`}>
                      {doc.startsWith("http") ? (
                        <a href={doc} target="_blank" rel="noreferrer">{doc}</a>
                      ) : (
                        doc
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {showResult?.alternatives && showResult.alternatives.length > 0 && (
          <Table
            data={showResult.alternatives}
            columns={[
              {
                key: "name",
                label: "Package",
                sortable: true,
                sortFn: (a, b) => a.name.localeCompare(b.name),
                render: (pkg) => (
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-green-400 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-white">{pkg.name}</p>
                      <p className="text-xs text-slate-400">
                        {pkg.id} {pkg.description && `· ${pkg.description}`}
                      </p>
                    </div>
                  </div>
                )
              },
              {
                key: "version",
                label: "Version",
                sortable: true,
                sortFn: (a, b) => a.version.localeCompare(b.version),
                render: (pkg) => <span>{pkg.version}</span>
              },
              {
                key: "publisher",
                label: "Publisher",
                sortable: true,
                sortFn: (a, b) => a.publisher.localeCompare(b.publisher),
                render: (pkg) => <span>{pkg.publisher}</span>
              },
              {
                key: "actions",
                label: "Actions",
                sortable: false,
                render: (pkg) => (
                  <div className="flex gap-2">
                    <button
                      className="btn-outline text-xs"
                      onClick={() => {
                        setShowQuery(pkg.id);
                        showPackageDetails(pkg.id);
                      }}
                    >
                      Show
                    </button>
                    <button
                      className="btn-primary text-xs"
                      onClick={() => execute("/install", pkg.id)}
                      disabled={isBusy}
                    >
                      Install
                    </button>
                  </div>
                )
              }
            ]}
            keyExtractor={(pkg) => pkg.id}
            isLoading={false}
            emptyMessage="No matches"
            maxHeight="max-h-64"
          />
        )}
      </div>

      {/* Install/Uninstall */}
      <div className="panel">
        <h3 className="panel-title mb-3">Install/Uninstall by ID</h3>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 input-text"
            placeholder="winget package ID or product code"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={() => execute("/install")}
            disabled={isBusy || !identifier}
          >
            Install
          </button>
          <button
            className="btn-outline"
            onClick={() => execute("/uninstall")}
            disabled={isBusy || !identifier}
          >
            Uninstall
          </button>
        </div>

        <Table
          data={filtered}
          columns={[
            {
              key: "displayName",
              label: "Application",
              sortable: true,
              sortFn: (a, b) => a.displayName.localeCompare(b.displayName),
              render: (pkg) => (
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-sky-300 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-white">{pkg.displayName}</p>
                    <p className="text-xs text-slate-400">
                      {pkg.version} · {pkg.publisher}
                    </p>
                  </div>
                </div>
              )
            },
            {
              key: "version",
              label: "Version",
              sortable: true,
              sortFn: (a, b) => a.version.localeCompare(b.version),
              render: (pkg) => <span>{pkg.version}</span>
            },
            {
              key: "publisher",
              label: "Publisher",
              sortable: true,
              sortFn: (a, b) => a.publisher.localeCompare(b.publisher),
              render: (pkg) => <span>{pkg.publisher}</span>
            },
            {
              key: "actions",
              label: "Actions",
              sortable: false,
              render: (pkg) => (
                <button
                  className="btn-outline"
                  onClick={() => {
                    setIdentifier(pkg.identifier);
                    execute("/uninstall");
                  }}
                  disabled={isBusy}
                >
                  Remove
                </button>
              )
            }
          ]}
          keyExtractor={(pkg) => pkg.identifier}
          isLoading={isLoading}
          emptyMessage="No packages found"
          maxHeight="max-h-96"
        />
      </div>
    </section>
  );
}

