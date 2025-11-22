import { useMemo, useState, useCallback } from "react";
import useSWR from "swr";
import { Package, RefreshCcw, Search as SearchIcon, Plus, Trash2, Download, Upload, Archive } from "lucide-react";
import { api } from "../api/client";
import { InstalledApplication, PackageOperationResult, PackageSearchResult, PackageBundle, BundlePackage, LogsResponse } from "../types";
import Table, { TableColumn } from "../components/Table";
import SubmenuNav, { SubmenuItem } from "../components/SubmenuNav";
import ConfirmDialog from "../components/ConfirmDialog";
import { showToast } from "../App";

const fetcher = (url: string) => api<InstalledApplication[]>(url);
const bundlesFetcher = () => api<PackageBundle[]>("/api/packages/bundles");

type PackageTab = "installed" | "install" | "saved" | "bundles";

export default function PackageManager() {
  const [activeTab, setActiveTab] = useState<PackageTab>("installed");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PackageSearchResult[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [installingPackageId, setInstallingPackageId] = useState<string | null>(null);
  
  // Bundle state
  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);
  const [newBundleName, setNewBundleName] = useState("");
  const [newBundleDescription, setNewBundleDescription] = useState("");
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);
  const [isInstallingBundle, setIsInstallingBundle] = useState(false);
  
  // Search results selection
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
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

  const { data: installedPackages, mutate, isLoading, error } = useSWR("/api/packages", fetcher, {
    revalidateOnFocus: false
  });

  // Check if a package is installed and get its version
  const getInstalledPackage = useCallback((packageId: string): InstalledApplication | undefined => {
    if (!installedPackages || !Array.isArray(installedPackages)) return undefined;
    return installedPackages.find(pkg => pkg.identifier.toLowerCase() === packageId.toLowerCase());
  }, [installedPackages]);

  // Check if a newer version is available
  const isUpdateAvailable = useCallback((searchResult: PackageSearchResult): boolean => {
    const installed = getInstalledPackage(searchResult.id);
    if (!installed || !searchResult.version) return false;
    // Simple version comparison - could be improved
    return searchResult.version !== installed.version;
  }, [getInstalledPackage]);

  const { data: bundles, mutate: mutateBundles } = useSWR("bundles", bundlesFetcher, {
    revalidateOnFocus: false
  });

  // Log fetching for installation tailing
  const logsFetcher = () => {
    const url = new URL("/api/logs", window.location.origin);
    return api<LogsResponse>(url.toString());
  };

  const { data: logsResponse } = useSWR(
    installingPackageId ? ["logs-general", installingPackageId] : null,
    logsFetcher,
    { refreshInterval: 1000 }
  );

  const logFiles = logsResponse?.files ?? [];
  // Get the latest log file (sorted by name, which includes date)
  const latestLogFile = logFiles.length > 0 
    ? [...logFiles].sort((a, b) => b.name.localeCompare(a.name))[0]
    : null;

  const { data: logContent, isLoading: logLoading } = useSWR(
    installingPackageId && latestLogFile ? ["log-content", latestLogFile.name] : null,
    ([, fileName]: [string, string]) => {
      const url = new URL(`/api/logs/${encodeURIComponent(fileName)}`, window.location.origin);
      return api<string>(url.toString());
    },
    {
      revalidateOnFocus: true,
      refreshInterval: 1000 // Auto-refresh every second for tailing
    }
  );

  const filtered = useMemo(() => {
    if (!installedPackages || !Array.isArray(installedPackages)) return [];
    if (!search) return installedPackages;
    const query = search.toLowerCase();
    return installedPackages.filter((pkg) =>
      pkg.displayName.toLowerCase().includes(query) ||
      pkg.identifier.toLowerCase().includes(query) ||
      pkg.publisher.toLowerCase().includes(query) ||
      pkg.version.toLowerCase().includes(query)
    );
  }, [installedPackages, search]);

  const currentBundle = useMemo(() => {
    if (!selectedBundle || !bundles) return null;
    return bundles.find(b => b.id === selectedBundle);
  }, [selectedBundle, bundles]);

  const performSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedPackages(new Set());
      return;
    }
    setIsSearching(true);
    try {
      const results = await api<PackageSearchResult[]>(`/api/packages/search?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(results || []);
      setSelectedPackages(new Set()); // Clear selection on new search
    } catch (err) {
      console.error("Search failed:", err);
      showToast(`Search failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      setSearchResults([]);
      setSelectedPackages(new Set());
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const togglePackageSelection = (packageId: string) => {
    setSelectedPackages(prev => {
      const next = new Set(prev);
      if (next.has(packageId)) {
        next.delete(packageId);
      } else {
        next.add(packageId);
      }
      return next;
    });
  };

  const selectAllPackages = () => {
    setSelectedPackages(new Set(searchResults.map(p => p.id)));
  };

  const clearSelection = () => {
    setSelectedPackages(new Set());
  };

  const installSelectedPackages = async () => {
    if (selectedPackages.size === 0) return;
    
    setConfirmDialog({
      isOpen: true,
      title: "Install Packages",
      message: `Install ${selectedPackages.size} package(s)? This may take a while.`,
      onConfirm: async () => {
        setIsBusy(true);
        setInstallingPackageId("batch-install");
        try {
          const results: PackageOperationResult[] = [];
          for (const packageId of selectedPackages) {
            try {
              const result = await api<PackageOperationResult>(`/api/packages/install`, {
                method: "POST",
                body: JSON.stringify({ identifier: packageId })
              });
              results.push(result);
            } catch (err) {
              results.push({
                succeeded: false,
                exitCode: -1,
                message: err instanceof Error ? err.message : String(err)
              });
            }
          }
          
          const succeeded = results.filter(r => r.succeeded).length;
          const failed = results.filter(r => !r.succeeded).length;
          if (failed === 0) {
            showToast(`Installation complete: ${succeeded} package(s) installed successfully`, "success");
          } else {
            showToast(`Installation complete: ${succeeded} succeeded, ${failed} failed`, "warning");
          }
          setSelectedPackages(new Set());
          await mutate();
          setInstallingPackageId(null);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          showToast(`Failed to install packages: ${err instanceof Error ? err.message : String(err)}`, "error");
          setInstallingPackageId(null);
        } finally {
          setIsBusy(false);
        }
      },
      variant: "info"
    });
  };

  const addSelectedToBundle = async (bundleId: string) => {
    if (selectedPackages.size === 0) return;
    
    try {
      const bundle = await api<PackageBundle>(`/api/packages/bundles/${bundleId}`);
      const packagesToAdd = searchResults
        .filter(p => selectedPackages.has(p.id))
        .map(p => ({
          id: p.id,
          name: p.name,
          version: p.version ?? null,
          publisher: p.publisher ?? null
        }));
      
      await api<PackageBundle>(`/api/packages/bundles/${bundleId}`, {
        method: "PUT",
        body: JSON.stringify({
          packages: [...bundle.packages, ...packagesToAdd]
        })
      });
      
      await mutateBundles();
      setSelectedPackages(new Set());
      showToast(`Added ${packagesToAdd.length} package(s) to bundle "${bundle.name}"`, "success");
    } catch (err) {
      showToast(`Failed to add packages to bundle: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const execute = async (endpoint: "/install" | "/uninstall", targetIdentifier?: string) => {
    const id = targetIdentifier ?? identifier;
    if (!id) return;
    setIsBusy(true);
    if (endpoint === "/install") {
      setInstallingPackageId(id);
    }
    try {
      const result = await api<PackageOperationResult>(`/api/packages${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ identifier: id })
      });
      if (result.succeeded) {
        showToast(`${id} ${endpoint === "/install" ? "installed" : "uninstalled"} successfully.`, "success");
      } else {
        showToast(`Failed to ${endpoint === "/install" ? "install" : "uninstall"} ${id}. Error: ${result.message.split('\n')[0]}`, "error");
      }
      await mutate();
      if (endpoint === "/install") {
        setInstallingPackageId(null);
      }
    } catch (err) {
      showToast(`Failed to ${endpoint === "/install" ? "install" : "uninstall"} ${id}: ${err instanceof Error ? err.message : String(err)}`, "error");
      if (endpoint === "/install") {
        setInstallingPackageId(null);
      }
    } finally {
      setIsBusy(false);
    }
  };


  const createBundle = async () => {
    if (!newBundleName.trim()) {
      showToast("Please enter a bundle name", "warning");
      return;
    }
    setIsCreatingBundle(true);
    try {
      const bundle = await api<PackageBundle>("/api/packages/bundles", {
        method: "POST",
        body: JSON.stringify({ name: newBundleName, description: newBundleDescription })
      });
      setSelectedBundle(bundle.id);
      setNewBundleName("");
      setNewBundleDescription("");
      await mutateBundles();
      setActiveTab("bundles");
      showToast("Bundle created successfully", "success");
    } catch (err) {
      showToast(`Failed to create bundle: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setIsCreatingBundle(false);
    }
  };

  const addPackageToBundle = async (pkg: PackageSearchResult) => {
    if (!selectedBundle || !pkg) return;
    
    const bundlePackage: BundlePackage = {
      id: pkg.id,
      name: pkg.name,
      version: pkg.version ?? null,
      publisher: pkg.publisher ?? null
    };

    try {
      const bundle = await api<PackageBundle>(`/api/packages/bundles/${selectedBundle}`, {
        method: "PUT",
        body: JSON.stringify({
          packages: [...(currentBundle?.packages || []), bundlePackage]
        })
      });
      await mutateBundles();
      showToast(`Added ${pkg.name} to bundle`, "success");
    } catch (err) {
      showToast(`Failed to add package to bundle: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const removePackageFromBundle = async (packageId: string) => {
    if (!selectedBundle || !currentBundle) return;
    
    try {
      await api<PackageBundle>(`/api/packages/bundles/${selectedBundle}`, {
        method: "PUT",
        body: JSON.stringify({
          packages: currentBundle.packages.filter(p => p.id !== packageId)
        })
      });
      await mutateBundles();
      showToast("Package removed from bundle", "success");
    } catch (err) {
      showToast(`Failed to remove package from bundle: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  const [bundleToInstall, setBundleToInstall] = useState<string | null>(null);

  const installBundle = async (bundleId: string) => {
    setBundleToInstall(bundleId);
    setConfirmDialog({
      isOpen: true,
      title: "Install Bundle",
      message: "Install all packages in this bundle? This may take a while.",
      onConfirm: async () => {
        if (!bundleToInstall) return;
        setIsInstallingBundle(true);
        try {
          const results = await api<PackageOperationResult[]>(`/api/packages/bundles/${bundleToInstall}/install`, {
            method: "POST"
          });
          
          const succeeded = results.filter(r => r.succeeded).length;
          const failed = results.filter(r => !r.succeeded).length;
          if (failed === 0) {
            showToast(`Bundle installation complete: ${succeeded} package(s) installed successfully`, "success");
          } else {
            showToast(`Bundle installation complete: ${succeeded} succeeded, ${failed} failed`, "warning");
          }
          await mutate();
          setBundleToInstall(null);
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        } catch (err) {
          showToast(`Failed to install bundle: ${err instanceof Error ? err.message : String(err)}`, "error");
        } finally {
          setIsInstallingBundle(false);
        }
      },
      variant: "info"
    });
  };

  const [bundleToDelete, setBundleToDelete] = useState<string | null>(null);

  const deleteBundle = async (bundleId: string) => {
    setBundleToDelete(bundleId);
    setConfirmDialog({
      isOpen: true,
      title: "Delete Bundle",
      message: "Are you sure you want to delete this bundle?",
      onConfirm: async () => {
        if (!bundleToDelete) return;
        try {
          await api(`/api/packages/bundles/${bundleToDelete}`, { method: "DELETE" });
          await mutateBundles();
          if (selectedBundle === bundleToDelete) {
            setSelectedBundle(null);
          }
          showToast("Bundle deleted successfully", "success");
          setBundleToDelete(null);
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        } catch (err) {
          showToast(`Failed to delete bundle: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
      },
      variant: "danger"
    });
  };

  const exportBundle = (bundle: PackageBundle) => {
    const dataStr = JSON.stringify(bundle, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${bundle.name.replace(/[^a-z0-9]/gi, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBundle = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const bundle: PackageBundle = JSON.parse(text);
        
        // Create new bundle with imported data
        const newBundle = await api<PackageBundle>("/api/packages/bundles", {
          method: "POST",
          body: JSON.stringify({ name: bundle.name, description: bundle.description })
        });
        
        if (bundle.packages.length > 0) {
          await api<PackageBundle>(`/api/packages/bundles/${newBundle.id}`, {
            method: "PUT",
            body: JSON.stringify({ packages: bundle.packages })
          });
        }
        
        await mutateBundles();
        setSelectedBundle(newBundle.id);
        setActiveTab("bundles");
        showToast("Bundle imported successfully", "success");
      } catch (err) {
        showToast(`Failed to import bundle: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    };
    input.click();
  };

  const packageTabs: SubmenuItem[] = [
    { id: "installed", label: "Installed Packages", icon: <Package size={16} /> },
    { id: "install", label: "Install Packages", icon: <SearchIcon size={16} /> },
    { id: "saved", label: "Saved Packages", icon: <Archive size={16} /> },
    { id: "bundles", label: "Bundles", icon: <Archive size={16} /> }
  ];

  return (
    <section className="space-y-4">
      <SubmenuNav 
        items={packageTabs} 
        activeId={activeTab} 
        onSelect={(id) => setActiveTab(id as PackageTab)} 
      />

      {error && (
        <p className="text-sm text-red-400">Failed to load packages: {String(error)}</p>
      )}

      {/* Installed Packages Tab */}
      {activeTab === "installed" && (
        <div className="flex items-center justify-end gap-2 mb-2">
          <button className="btn-outline" onClick={() => mutate()}>
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
      )}
      {activeTab === "installed" && (
        <div className="panel">
            <h3 className="panel-title mb-3">Installed Packages</h3>
            <div className="mb-3">
              <input
                className="w-full input-text"
                placeholder="Search installed packages by name, ID, publisher, or version..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
      )}

      {/* Install Packages Tab */}
      {activeTab === "install" && (
        <div className="space-y-4">
          <div className="panel space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="panel-title mb-0 flex items-center gap-2">
                <SearchIcon size={18} /> Search winget packages
              </h3>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 input-text"
                placeholder="Search for packages (e.g. chrome, firefox, vscode)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    performSearch();
                  }
                }}
              />
              <button
                className="btn-primary"
                onClick={performSearch}
                disabled={isSearching || !searchQuery.trim()}
              >
                <SearchIcon size={16} /> {isSearching ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <>
              {/* Batch Actions */}
              <div className="panel">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-400">
                      {selectedPackages.size} of {searchResults.length} selected
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="btn-outline text-xs"
                        onClick={selectAllPackages}
                        disabled={selectedPackages.size === searchResults.length}
                      >
                        Select All
                      </button>
                      <button
                        className="btn-outline text-xs"
                        onClick={clearSelection}
                        disabled={selectedPackages.size === 0}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedPackages.size > 0 && bundles && bundles.length > 0 && (
                      <select
                        className="btn-outline text-xs"
                        value=""
                        onChange={(e) => {
                          const bundleId = e.target.value;
                          if (bundleId) {
                            addSelectedToBundle(bundleId);
                          }
                          e.target.value = "";
                        }}
                      >
                        <option value="">Add selected to bundle...</option>
                        {bundles.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    )}
                    {selectedPackages.size > 0 && (
                      <button
                        className="btn-primary text-xs"
                        onClick={installSelectedPackages}
                        disabled={isBusy}
                      >
                        Install Selected ({selectedPackages.size})
                      </button>
                    )}
                  </div>
                </div>

                <Table
                  data={searchResults}
                  columns={[
                    {
                      key: "select",
                      label: "",
                      sortable: false,
                      render: (pkg) => (
                        <input
                          type="checkbox"
                          checked={selectedPackages.has(pkg.id)}
                          onChange={() => togglePackageSelection(pkg.id)}
                          className="checkbox"
                        />
                      )
                    },
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
                      render: (pkg) => {
                        const installed = getInstalledPackage(pkg.id);
                        const hasUpdate = isUpdateAvailable(pkg);
                        return (
                          <div className="flex gap-2">
                            {installed ? (
                              <>
                                {hasUpdate && (
                                  <button
                                    className="btn-primary text-xs"
                                    onClick={() => execute("/install", pkg.id)}
                                    disabled={isBusy}
                                    title={`Update from ${installed.version} to ${pkg.version}`}
                                  >
                                    Update
                                  </button>
                                )}
                                <button
                                  className="btn-outline text-xs text-red-400 hover:text-red-300"
                                  onClick={() => {
                                    setConfirmDialog({
                                      isOpen: true,
                                      title: "Uninstall Package",
                                      message: `Uninstall ${pkg.name}?`,
                                      onConfirm: async () => {
                                        await execute("/uninstall", pkg.id);
                                        setConfirmDialog({ ...confirmDialog, isOpen: false });
                                      },
                                      variant: "danger"
                                    });
                                  }}
                                  disabled={isBusy}
                                >
                                  Uninstall
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn-primary text-xs"
                                onClick={() => execute("/install", pkg.id)}
                                disabled={isBusy}
                              >
                                Install
                              </button>
                            )}
                            {bundles && bundles.length > 0 && (
                              <select
                                className="btn-outline text-xs"
                                value=""
                                onChange={(e) => {
                                  const bundleId = e.target.value;
                                  if (bundleId) {
                                    addPackageToBundle(pkg);
                                  }
                                  e.target.value = "";
                                }}
                              >
                                <option value="">Add to bundle...</option>
                                {bundles.map(b => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      }
                    }
                  ]}
                  keyExtractor={(pkg) => pkg.id}
                  isLoading={isSearching}
                  emptyMessage="No results found. Try a different search query."
                  maxHeight="max-h-96"
                />
              </div>

              {/* Installation Log Tailing */}
              {installingPackageId && (
                <div className="panel space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="panel-title mb-0">Installation Log</h3>
                    <div className="text-xs text-slate-400">
                      {logLoading ? "Loading..." : "Tailing log (auto-refreshing every second)"}
                    </div>
                  </div>
                  <div className="bg-slate-950 rounded border border-slate-800 p-3 max-h-64 overflow-y-auto">
                    {logLoading && <p className="text-sm text-slate-400">Loading log...</p>}
                    {!logLoading && !logContent && <p className="text-sm text-slate-400">No log content available</p>}
                    {!logLoading && logContent && (
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                        {logContent}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Bundles Tab */}
      {/* Saved Packages Tab */}
      {activeTab === "saved" && (
        <div className="panel">
          <h3 className="panel-title mb-3">Saved Packages</h3>
          <p className="text-sm text-slate-400">Saved packages functionality coming soon.</p>
        </div>
      )}

      {/* Bundles Tab */}
      {activeTab === "bundles" && (
        <div className="space-y-4">
          <div className="panel space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="panel-title mb-0">Create Bundle</h3>
              <button className="btn-outline" onClick={importBundle}>
                <Upload size={16} /> Import Bundle
              </button>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 input-text"
                placeholder="Bundle name"
                value={newBundleName}
                onChange={(e) => setNewBundleName(e.target.value)}
              />
              <input
                className="flex-1 input-text"
                placeholder="Description (optional)"
                value={newBundleDescription}
                onChange={(e) => setNewBundleDescription(e.target.value)}
              />
              <button
                className="btn-primary"
                onClick={createBundle}
                disabled={isCreatingBundle || !newBundleName.trim()}
              >
                <Plus size={16} /> Create
              </button>
            </div>
          </div>

          {bundles && bundles.length > 0 && (
            <div className="panel space-y-4">
              <h3 className="panel-title mb-0">Bundles</h3>
              <div className="space-y-3">
                {bundles.map((bundle) => (
                  <div
                    key={bundle.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      selectedBundle === bundle.id
                        ? "border-sky-500 bg-sky-900/20"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                    onClick={() => setSelectedBundle(bundle.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-white">{bundle.name}</h4>
                        {bundle.description && (
                          <p className="text-sm text-slate-400 mt-1">{bundle.description}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                          {bundle.packages.length} package{bundle.packages.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="btn-outline text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportBundle(bundle);
                          }}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          className="btn-outline text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            installBundle(bundle.id);
                          }}
                          disabled={isInstallingBundle}
                        >
                          Install All
                        </button>
                        <button
                          className="btn-outline text-xs text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBundle(bundle.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentBundle && (
            <div className="panel space-y-4">
              <h3 className="panel-title mb-0">{currentBundle.name} - Packages</h3>
              {currentBundle.packages.length === 0 ? (
                <p className="text-sm text-slate-400">No packages in this bundle. Search for packages and add them to this bundle.</p>
              ) : (
                <Table
                  data={currentBundle.packages}
                  columns={[
                    {
                      key: "name",
                      label: "Package",
                      sortable: true,
                      sortFn: (a, b) => a.name.localeCompare(b.name),
                      render: (pkg) => (
                        <div className="flex items-center gap-2">
                          <Package size={16} className="text-amber-300 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-white">{pkg.name}</p>
                            <p className="text-xs text-slate-400">{pkg.id}</p>
                          </div>
                        </div>
                      )
                    },
                    {
                      key: "version",
                      label: "Version",
                      sortable: true,
                      sortFn: (a, b) => (a.version || "").localeCompare(b.version || ""),
                      render: (pkg) => <span>{pkg.version || "—"}</span>
                    },
                    {
                      key: "actions",
                      label: "Actions",
                      sortable: false,
                      render: (pkg) => (
                        <button
                          className="btn-outline text-xs text-red-400"
                          onClick={() => removePackageFromBundle(pkg.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )
                    }
                  ]}
                  keyExtractor={(pkg) => pkg.id}
                  isLoading={false}
                  emptyMessage="No packages"
                  maxHeight="max-h-64"
                />
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        variant={confirmDialog.variant}
      />
    </section>
  );
}
