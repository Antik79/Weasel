import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import useSWR from "swr";
import {
  Download,
  FileText,
  Folder,
  Plus,
  RefreshCcw,
  Trash2,
  Upload,
  Archive,
  FileArchive,
  X,
  Copy,
  Scissors,
  Clipboard,
  Star,
  StarOff,
  ArrowUp,
  ArrowDown,
  Pencil,
  Eye,
  MoreHorizontal,
  Menu,
  Search as SearchIcon,
  FileEdit
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { api, download, upload } from "../api/client";
import { FileSystemItem } from "../types";
import { formatBytes, formatDate } from "../utils/format";
import ContextMenu from "../components/ContextMenu";
import { useTranslation } from "../i18n/i18n";

const fetcher = async (path: string) => {
  const url = new URL("/api/fs", window.location.origin);
  if (path) {
    url.searchParams.set("path", path);
  }

  return api<FileSystemItem[]>(url.toString());
};

const drivesFetcher = () => api<FileSystemItem[]>("/api/fs/drives");

const normalizePath = (path: string) => path.replace(/\//g, "\\");

const ensureTrailingSlash = (path: string) => {
  if (!path) return "";
  const normalized = normalizePath(path);
  return normalized.endsWith("\\") ? normalized : `${normalized}\\`;
};

const parentOf = (path: string) => {
  if (!path) return "";
  let normalized = normalizePath(path).replace(/\\+$/, "");
  const isUnc = normalized.startsWith("\\\\");

  if (isUnc) {
    const parts = normalized.split("\\").filter(Boolean);
    if (parts.length <= 2) {
      return `\\\\${parts.join("\\")}\\`;
    }
    parts.pop();
    return `\\\\${parts.join("\\")}\\`;
  }

  if (normalized.endsWith(":")) {
    return `${normalized}\\`;
  }

  const idx = normalized.lastIndexOf("\\");
  if (idx <= 1) {
    return `${normalized.slice(0, idx + 1)}\\`;
  }

  return `${normalized.slice(0, idx)}\\`;
};

const joinPath = (base: string, name: string) => {
  if (!base) return name;
  return `${ensureTrailingSlash(base)}${name}`;
};

const detectLanguage = (filePath: string) => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "cs":
      return "csharp";
    case "sql":
      return "sql";
    case "xml":
      return "xml";
    case "md":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "plaintext";
  }
};

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState("");
  const [editorFile, setEditorFile] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isNewFile, setIsNewFile] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{ items: string[], operation: "copy" | "cut" } | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('weasel.bookmarks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [tailFile, setTailFile] = useState<string | null>(null);
  const [tailContent, setTailContent] = useState("");
  const [isTailing, setIsTailing] = useState(false);

  // New State for Refactor
  const { t } = useTranslation();
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'size' | 'date'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = localStorage.getItem('weasel.layout.leftPanelWidth');
    return saved ? parseInt(saved) : 33; // Default to 33% (1/3)
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FileSystemItem } | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Persist last path
  useEffect(() => {
    const savedPath = localStorage.getItem('weasel.lastPath');
    if (savedPath && !currentPath) {
      setCurrentPath(savedPath);
    }
  }, []);

  useEffect(() => {
    if (currentPath) {
      localStorage.setItem('weasel.lastPath', currentPath);
    }
  }, [currentPath]);

  const { data, mutate, isLoading, error } = useSWR(currentPath, fetcher, {
    revalidateOnFocus: false
  });

  const { data: drivesData } = useSWR("drives", drivesFetcher, {
    revalidateOnFocus: false
  });

  const drives = Array.isArray(drivesData) ? drivesData : [];

  const allDirectories = useMemo(
    () => {
      const items = Array.isArray(data) ? data : [];
      return items.filter((item) => item.isDirectory);
    },
    [data]
  );
  const allFiles = useMemo(
    () => {
      const items = Array.isArray(data) ? data : [];
      return items.filter((item) => !item.isDirectory);
    },
    [data]
  );

  // Filter based on search query
  const filteredDirectories = useMemo(() => {
    if (!Array.isArray(allDirectories)) return [];
    if (!searchQuery) return allDirectories;
    const query = searchQuery.toLowerCase();
    return allDirectories.filter((item) =>
      item.name.toLowerCase().includes(query)
    );
  }, [allDirectories, searchQuery]);

  const filteredFiles = useMemo(() => {
    if (!Array.isArray(allFiles)) return [];
    if (!searchQuery) return allFiles;
    const query = searchQuery.toLowerCase();
    return allFiles.filter((item) =>
      item.name.toLowerCase().includes(query)
    );
  }, [allFiles, searchQuery]);

  const sortItems = useCallback((items: FileSystemItem[]) => {
    return [...items].sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.key) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.sizeBytes - b.sizeBytes;
          break;
        case 'date':
          comparison = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
          break;
      }
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [sortConfig]);

  const directories = useMemo(() => sortItems(filteredDirectories), [filteredDirectories, sortItems]);
  const files = useMemo(() => sortItems(filteredFiles), [filteredFiles, sortItems]);

  const handleSort = (key: 'name' | 'size' | 'date') => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const refresh = useCallback(() => mutate(), [mutate]);

  // Close bookmarks dropdown when clicking outside
  useEffect(() => {
    if (!showBookmarks) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.relative')) {
        setShowBookmarks(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBookmarks]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs or editor
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      // Don't trigger when editor modal is open
      if (editorFile) {
        return;
      }

      // Ctrl+C - Copy
      if (e.ctrlKey && e.key === 'c' && selectedItems.size > 0) {
        e.preventDefault();
        copyToClipboard();
      }
      // Ctrl+X - Cut
      else if (e.ctrlKey && e.key === 'x' && selectedItems.size > 0) {
        e.preventDefault();
        cutToClipboard();
      }
      // Ctrl+V - Paste
      else if (e.ctrlKey && e.key === 'v' && clipboard) {
        e.preventDefault();
        pasteFromClipboard();
      }
      // Delete - Delete selected
      else if (e.key === 'Delete' && selectedItems.size > 0) {
        e.preventDefault();
        bulkDelete();
      }
      // Ctrl+A - Select all
      else if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      // Escape - Clear selection
      else if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
      }
      // F5 or Ctrl+R - Refresh
      else if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        e.preventDefault();
        refresh();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItems, clipboard, editorFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDirectory = (item: FileSystemItem) => {
    setCurrentPath(ensureTrailingSlash(item.fullPath));
    closeEditor();
  };

  const loadFileContent = async (filePath: string) => {
    setIsLoadingFile(true);
    try {
      const url = new URL("/api/fs/content", window.location.origin);
      url.searchParams.set("path", filePath);
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const text = await response.text();
      setEditorContent(text);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const startEditing = async (file: FileSystemItem) => {
    setEditorFile(file.fullPath);
    setIsNewFile(false);
    await loadFileContent(file.fullPath);
  };

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }

    if (!currentPath) {
      window.alert("Select a folder before uploading files.");
      event.target.value = "";
      return;
    }

    try {
      for (const file of Array.from(event.target.files)) {
        const form = new FormData();
        form.append("path", ensureTrailingSlash(currentPath));
        form.append("file", file, file.name);
        await upload(form);
      }
      await refresh();
    } catch (error) {
      window.alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      event.target.value = "";
    }
  };

  const createFolder = async () => {
    const name = window.prompt("Folder name");
    if (!name) return;
    if (!currentPath) {
      window.alert("Select a folder before creating a new folder.");
      return;
    }
    await api("/api/fs/directory", {
      method: "POST",
      body: JSON.stringify({ parentPath: currentPath, name })
    });
    await refresh();
  };

  const createFile = () => {
    if (!currentPath) {
      window.alert("Select a folder before creating a new file.");
      return;
    }

    const fileName = window.prompt("File name (e.g. notes.txt)");
    if (!fileName) return;

    const fullPath = joinPath(currentPath, fileName);
    setEditorFile(fullPath);
    setEditorContent("");
    setIsNewFile(true);
  };

  const deleteItem = async (item: FileSystemItem) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    const url = new URL("/api/fs", window.location.origin);
    url.searchParams.set("path", item.fullPath);
    await api(url.toString(), { method: "DELETE" });
    if (editorFile === item.fullPath) {
      closeEditor();
    }
    await refresh();
  };

  const renameItem = async (item: FileSystemItem) => {
    const newName = window.prompt("New name", item.name);
    if (!newName || newName === item.name) return;
    await api("/api/fs/rename", {
      method: "POST",
      body: JSON.stringify({ path: item.fullPath, newName })
    });
    await refresh();
  };

  const saveFile = async () => {
    if (!editorFile) return;
    setIsSaving(true);
    try {
      await api("/api/fs/write", {
        method: "POST",
        body: JSON.stringify({ path: editorFile, content: editorContent })
      });
      await refresh();
      setIsNewFile(false);
    } finally {
      setIsSaving(false);
    }
  };

  const closeEditor = () => {
    setEditorFile(null);
    setEditorContent("");
    setIsNewFile(false);
    setIsLoadingFile(false);
  };

  const toggleSelection = (item: FileSystemItem) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item.fullPath)) {
        next.delete(item.fullPath);
      } else {
        next.add(item.fullPath);
      }
      return next;
    });
  };

  const selectAll = () => {
    const dirs = Array.isArray(directories) ? directories : [];
    const fileList = Array.isArray(files) ? files : [];
    const allPaths = new Set([...dirs, ...fileList].map((item) => item.fullPath));
    setSelectedItems(allPaths);
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const downloadItem = async (item: FileSystemItem) => {
    if (item.isDirectory) {
      // For folders, create a zip first, then download it
      const tempZip = `${item.name}_${new Date().toISOString().slice(0, 10)}.zip`;
      const zipPath = joinPath(currentPath || parentOf(item.fullPath), tempZip);
      
      try {
        await api("/api/fs/bulk/zip", {
          method: "POST",
          body: JSON.stringify({
            sourcePaths: [item.fullPath],
            zipFilePath: zipPath
          })
        });
        // Download the created zip file
        download(zipPath);
        // Clean up the zip file after a short delay (give time for download to start)
        setTimeout(async () => {
          try {
            await api("/api/fs/bulk/delete", {
              method: "POST",
              body: JSON.stringify({ paths: [zipPath] })
            });
            await refresh();
          } catch (e) {
            // Ignore cleanup errors
          }
        }, 2000);
      } catch (error) {
        alert(`Failed to zip folder: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // For files, download directly
      download(item.fullPath);
    }
  };

  const bulkDownload = async () => {
    if (selectedItems.size === 0) return;
    const paths = Array.from(selectedItems);

    if (paths.length === 1) {
      // Get the item to check if it's a folder
      const item = data?.find(f => f.fullPath === paths[0]);
      if (item) {
        await downloadItem(item);
      } else {
        download(paths[0]);
      }
      return;
    }

    // Multiple files - use bulk download endpoint
    const url = new URL("/api/fs/download/bulk", window.location.origin);
    await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths })
    }).then(async (response) => {
      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `download_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
      }
    });
    clearSelection();
    await refresh();
  };

  const bulkDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!window.confirm(`Delete ${selectedItems.size} item(s)?`)) return;

    await api("/api/fs/bulk/delete", {
      method: "POST",
      body: JSON.stringify({ paths: Array.from(selectedItems) })
    });
    clearSelection();
    await refresh();
  };

  const copyToClipboard = () => {
    if (selectedItems.size === 0) return;
    setClipboard({ items: Array.from(selectedItems), operation: "copy" });
  };

  const cutToClipboard = () => {
    if (selectedItems.size === 0) return;
    setClipboard({ items: Array.from(selectedItems), operation: "cut" });
  };

  const pasteFromClipboard = async () => {
    if (!clipboard || !currentPath) return;

    try {
      if (clipboard.operation === "copy") {
        await api("/api/fs/bulk/copy", {
          method: "POST",
          body: JSON.stringify({
            sourcePaths: clipboard.items,
            destinationPath: currentPath
          })
        });
      } else if (clipboard.operation === "cut") {
        await api("/api/fs/bulk/move", {
          method: "POST",
          body: JSON.stringify({
            sourcePaths: clipboard.items,
            destinationPath: currentPath
          })
        });
        setClipboard(null); // Clear clipboard after cut operation
      }
      clearSelection();
      await refresh();
    } catch (error) {
      window.alert(`Paste failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const addBookmark = () => {
    if (!currentPath) return;
    if (bookmarks.includes(currentPath)) return;
    const newBookmarks = [...bookmarks, currentPath];
    setBookmarks(newBookmarks);
    localStorage.setItem('weasel.bookmarks', JSON.stringify(newBookmarks));
  };

  const removeBookmark = (path: string) => {
    const bookmarksList = Array.isArray(bookmarks) ? bookmarks : [];
    const newBookmarks = bookmarksList.filter(b => b !== path);
    setBookmarks(newBookmarks);
    localStorage.setItem('weasel.bookmarks', JSON.stringify(newBookmarks));
  };

  const navigateToBookmark = (path: string) => {
    setCurrentPath(path);
    clearSelection();
    setShowBookmarks(false);
  };

  const isCurrentPathBookmarked = currentPath && bookmarks.includes(currentPath);

  const zipItem = async (item: FileSystemItem) => {
    const zipFileName = window.prompt("Zip file name (e.g., archive.zip)", `${item.name}.zip`);
    if (!zipFileName) return;

    const zipPath = joinPath(currentPath || parentOf(item.fullPath), zipFileName);
    await api("/api/fs/bulk/zip", {
      method: "POST",
      body: JSON.stringify({
        sourcePaths: [item.fullPath],
        zipFilePath: zipPath
      })
    });
    await refresh();
  };

  const bulkZip = async () => {
    if (selectedItems.size === 0) return;

    const zipFileName = window.prompt("Zip file name (e.g., archive.zip)", "archive.zip");
    if (!zipFileName) return;

    const zipPath = joinPath(currentPath, zipFileName);
    await api("/api/fs/bulk/zip", {
      method: "POST",
      body: JSON.stringify({
        sourcePaths: Array.from(selectedItems),
        zipFilePath: zipPath
      })
    });
    clearSelection();
    await refresh();
  };

  const unzipFile = async (zipPath: string) => {
    const destination = currentPath || parentOf(zipPath);
    await api("/api/fs/unzip", {
      method: "POST",
      body: JSON.stringify({
        zipFilePath: zipPath,
        destinationPath: destination
      })
    });
    await refresh();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) {
      setIsDraggingOver(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide if leaving the main container
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (!currentPath) {
      window.alert("Select a folder before uploading files.");
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    try {
      for (const file of files) {
        const form = new FormData();
        form.append("path", ensureTrailingSlash(currentPath));
        form.append("file", file, file.name);
        await upload(form);
      }
      await refresh();
    } catch (error) {
      window.alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const startTailing = async (filePath: string) => {
    setTailFile(filePath);
    setIsTailing(true);
    setTailContent("");
    // Load initial content
    try {
      const url = new URL("/api/fs/content", window.location.origin);
      url.searchParams.set("path", filePath);
      const response = await fetch(url.toString());
      if (response.ok) {
        const text = await response.text();
        setTailContent(text);
      }
    } catch (error) {
      console.error("Failed to load file content:", error);
    }
  };

  const stopTailing = () => {
    setTailFile(null);
    setIsTailing(false);
    setTailContent("");
  };

  // Auto-refresh tail content
  useEffect(() => {
    if (!isTailing || !tailFile) return;

    const intervalId = setInterval(async () => {
      try {
        const url = new URL("/api/fs/content", window.location.origin);
        url.searchParams.set("path", tailFile);
        const response = await fetch(url.toString());
        if (response.ok) {
          const text = await response.text();
          setTailContent(text);
        }
      } catch (error) {
        console.error("Failed to refresh tail content:", error);
      }
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(intervalId);
  }, [isTailing, tailFile]);

  // Resizing Logic (horizontal)
  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    localStorage.setItem('weasel.layout.leftPanelWidth', leftPanelWidth.toString());
  }, [leftPanelWidth]);

  // We need a ref for the container to calculate relative X
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidthPercent = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    // Ensure left panel is at least 20% and right panel gets at least 30%
    if (newWidthPercent >= 20 && newWidthPercent <= 70) {
      setLeftPanelWidth(newWidthPercent);
      localStorage.setItem('weasel.layout.leftPanelWidth', newWidthPercent.toString());
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, handleMouseMove, stopResizing]);

  const handleContextMenu = (e: React.MouseEvent, item: FileSystemItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  return (
    <section
      className="space-y-4 relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && currentPath && (
        <div className="fixed inset-0 bg-sky-900/30 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-slate-800 border-4 border-dashed border-sky-500 rounded-lg p-8 shadow-2xl">
            <Upload size={48} className="mx-auto mb-4 text-sky-400" />
            <p className="text-xl font-semibold text-white">Drop files to upload</p>
            <p className="text-sm text-slate-400 mt-2">to {currentPath}</p>
          </div>
        </div>
      )}
      <header className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-shrink-0">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("common.search")}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm w-64 focus:outline-none focus:border-sky-500 pl-9"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon size={14} />
              </div>
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap justify-end">
            {selectedItems.size > 0 && (
              <>
                <button className="btn-outline" onClick={bulkDownload}>
                  <Download size={16} />
                </button>
                <button className="btn-outline" onClick={bulkDelete}>
                  <Trash2 size={16} />
                </button>
                <button className="btn-outline" onClick={bulkZip}>
                  <Archive size={16} />
                </button>
                <button className="btn-outline" onClick={copyToClipboard}>
                  <Copy size={16} />
                </button>
                <button className="btn-outline" onClick={cutToClipboard}>
                  <Scissors size={16} />
                </button>
                <button className="btn-outline" onClick={clearSelection}>
                  <X size={16} />
                </button>
              </>
            )}
            {clipboard && (
              <button
                className="btn-outline bg-sky-900/30 border-sky-500"
                onClick={pasteFromClipboard}
                disabled={!currentPath}
              >
                <Clipboard size={16} />
              </button>
            )}
            <div className="relative">
              <button
                className={`btn-outline ${isCurrentPathBookmarked ? "bg-amber-900/30 border-amber-500" : ""}`}
                onClick={() => {
                  if (isCurrentPathBookmarked) {
                    removeBookmark(currentPath);
                  } else {
                    addBookmark();
                  }
                }}
                disabled={!currentPath}
                title={isCurrentPathBookmarked ? "Remove bookmark" : "Add bookmark"}
              >
                {isCurrentPathBookmarked ? <Star size={16} className="fill-amber-400 text-amber-400" /> : <StarOff size={16} />}
              </button>
            </div>
            {bookmarks.length > 0 && (
              <div className="relative">
                <button
                  className="btn-outline"
                  onClick={() => setShowBookmarks(!showBookmarks)}
                  title="Show bookmarks"
                >
                  <Star size={16} />
                </button>
                {showBookmarks && (
                  <div className="absolute top-full right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded shadow-lg z-50 max-h-96 overflow-y-auto">
                    <div className="p-3 border-b border-slate-700">
                      <h4 className="font-semibold text-sm">Bookmarked Folders</h4>
                    </div>
                    <div className="divide-y divide-slate-700">
                      {Array.isArray(bookmarks) && bookmarks.map((bookmark) => (
                        <div key={bookmark} className="flex items-center gap-2 p-3 hover:bg-slate-700/50">
                          <button
                            className="flex-1 text-left text-sm hover:text-sky-400 break-all"
                            onClick={() => navigateToBookmark(bookmark)}
                          >
                            <Folder size={14} className="inline mr-2 text-amber-300" />
                            {bookmark || "Root"}
                          </button>
                          <button
                            className="icon-btn text-red-400 hover:text-red-300"
                            onClick={() => removeBookmark(bookmark)}
                            title="Remove bookmark"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button className="btn-outline" onClick={createFolder} title={t("common.newFolder")}>
              <Plus size={16} />
            </button>
            <button className="btn-outline" onClick={createFile} disabled={!currentPath} title={t("common.newFile")}>
              <FileText size={16} />
            </button>
            <label className={`btn-outline cursor-pointer ${!currentPath ? "opacity-50 pointer-events-none" : ""}`} title={t("common.upload")}>
              <Upload size={16} />
              <input
                type="file"
                multiple
                className="hidden"
                onChange={uploadFiles}
                disabled={!currentPath}
              />
            </label>
            <button className="btn-outline" onClick={refresh} title={t("common.refresh")}>
              <RefreshCcw size={16} />
            </button>
          </div>
        </div>

        {/* Breadcrumbs Line - Moved below toolbar */}
        <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded border border-slate-800 overflow-hidden">
          <span className="text-slate-500 flex-shrink-0">{t("common.path")}:</span>
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
            <button
              className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline flex-shrink-0"
              onClick={() => {
                setCurrentPath("");
                clearSelection();
              }}
              title="Go to root"
            >
              Home
            </button>
            {currentPath && currentPath.split("\\").filter(Boolean).map((segment, index, arr) => {
              const pathUpToSegment = arr.slice(0, index + 1).join("\\") + "\\";
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
                        setCurrentPath(pathUpToSegment);
                        clearSelection();
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
          {selectedItems.size > 0 && (
            <span className="text-xs text-sky-400 flex-shrink-0 bg-sky-900/20 px-2 py-1 rounded">
              {selectedItems.size} {t("files.selected")}
            </span>
          )}
        </div>
      </header>

      {error && (
        <p className="text-red-400 text-sm">
          Failed to load items: {String(error)}
        </p>
      )}

      <div className="panel">
        <h3 className="panel-title">{t("files.drives")}</h3>
        <div className="flex flex-wrap gap-3">
          {Array.isArray(drives) && drives.map((drive) => (
            <button
              key={drive.fullPath}
              className={`drive-pill ${currentPath.startsWith(drive.fullPath) ? "active" : ""
                }`}
              onClick={() => {
                setCurrentPath(drive.fullPath);
                clearSelection();
              }}
            >
              {drive.name}
            </button>
          ))}
          {!drives.length && (
            <p className="text-sm text-slate-400">No drives detected.</p>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex flex-row gap-2" style={{ height: 'calc(100vh - 140px)', minHeight: '600px' }}>
        {/* Folders Panel (Left - 1/3) */}
        <div className="panel flex flex-col overflow-hidden" style={{ width: `${leftPanelWidth}%`, minWidth: '250px' }}>
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="panel-title mb-0">{t("files.directories")}</h3>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <button className="hover:text-white flex items-center gap-1" onClick={() => handleSort('name')}>
                Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
              <button className="hover:text-white flex items-center gap-1" onClick={() => handleSort('date')}>
                Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-800 overflow-y-auto flex-1 pr-2">
            {isLoading && <p className="py-4 text-sm text-slate-400">Loading…</p>}
            {!isLoading && directories.length === 0 && (
              <p className="py-4 text-sm text-slate-400">No folders</p>
            )}
            {Array.isArray(directories) && directories.map((dir) => (
              <div
                key={dir.fullPath}
                className={`item-row hover:bg-slate-800/50 cursor-pointer ${selectedItems.has(dir.fullPath) ? "bg-slate-800/70" : ""
                  }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('input[type="checkbox"]') ||
                    (e.target as HTMLElement).closest('button')) {
                    return;
                  }
                  openDirectory(dir);
                }}
                onContextMenu={(e) => handleContextMenu(e, dir)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(dir.fullPath)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelection(dir);
                    }}
                    className="checkbox flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Folder size={18} className="text-amber-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{dir.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(dir.modifiedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); renameItem(dir); }} title="Rename">
                    <FileEdit size={14} />
                  </button>
                  <button className="icon-btn text-red-400 hover:text-red-300" onClick={(e) => { e.stopPropagation(); deleteItem(dir); }} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resizer */}
        <div
          className="w-2 cursor-col-resize bg-slate-900 hover:bg-sky-500/50 transition-colors flex items-center justify-center z-10 flex-shrink-0 rounded"
          onMouseDown={startResizing}
        >
          <div className="h-8 w-1 bg-slate-600 rounded-full" />
        </div>

        {/* Files Panel (Right - 2/3) */}
        <div className="panel flex-1 flex flex-col overflow-hidden" style={{ minWidth: '400px' }}>
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="panel-title mb-0">{t("files.files")}</h3>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <button className="hover:text-white flex items-center gap-1" onClick={() => handleSort('name')}>
                Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
              <button className="hover:text-white flex items-center gap-1" onClick={() => handleSort('size')}>
                Size {sortConfig.key === 'size' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
              <button className="hover:text-white flex items-center gap-1" onClick={() => handleSort('date')}>
                Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-800 overflow-y-auto flex-1 pr-2">
            {isLoading && <p className="py-4 text-sm text-slate-400">Loading…</p>}
            {!isLoading && files.length === 0 && (
              <p className="py-4 text-sm text-slate-400">No files</p>
            )}
            {Array.isArray(files) && files.map((file) => {
              const isZip = file.name.toLowerCase().endsWith(".zip");
              return (
                <div
                  key={file.fullPath}
                  className={`item-row hover:bg-slate-800/50 cursor-default group ${selectedItems.has(file.fullPath) ? "bg-slate-800/70" : ""
                    }`}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(file.fullPath)}
                      onChange={() => toggleSelection(file)}
                      className="checkbox flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    {isZip ? (
                      <FileArchive size={18} className="text-purple-300 flex-shrink-0" />
                    ) : (
                      <FileText size={18} className="text-sky-300 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatBytes(file.sizeBytes)} – {formatDate(file.modifiedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); download(file.fullPath); }} title="Download">
                      <Download size={14} />
                    </button>
                    {isZip && (
                      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); unzipFile(file.fullPath); }} title="Unzip">
                        <FileArchive size={14} />
                      </button>
                    )}
                    {!isZip && (
                      <>
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); startEditing(file); }} title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); startTailing(file.fullPath); }} title="Tail">
                          <Eye size={14} />
                        </button>
                      </>
                    )}
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); renameItem(file); }} title="Rename">
                      <FileEdit size={14} />
                    </button>
                    <button className="icon-btn text-red-400 hover:text-red-300" onClick={(e) => { e.stopPropagation(); deleteItem(file); }} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editorFile && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-[0.2em]">Editing</p>
                <p className="font-semibold text-white break-all">{editorFile}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-outline" onClick={closeEditor}>
                  Close
                </button>
                <button className="btn-primary" onClick={saveFile} disabled={isSaving || (isLoadingFile && !isNewFile)}>
                  {isSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <div className="modal-body">
              {isLoadingFile && !isNewFile ? (
                <p className="text-sm text-slate-400">Loading content…</p>
              ) : (
                <Editor
                  height="400px"
                  theme="vs-dark"
                  language={detectLanguage(editorFile)}
                  value={editorContent}
                  onChange={(value) => setEditorContent(value ?? "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    scrollBeyondLastLine: false
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {tailFile && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-[0.2em]">
                  Monitoring File {isTailing && <span className="text-green-400 ml-2">● Live</span>}
                </p>
                <p className="font-semibold text-white break-all">{tailFile}</p>
              </div>
              <div className="flex gap-2">
                <button
                  className={`btn-outline ${isTailing ? "bg-amber-900/30 border-amber-500" : "bg-green-900/30 border-green-500"}`}
                  onClick={() => setIsTailing(!isTailing)}
                >
                  {isTailing ? "Pause" : "Resume"}
                </button>
                <button className="btn-outline" onClick={stopTailing}>
                  Close
                </button>
              </div>
            </div>
            <div className="modal-body">
              <pre className="text-sm font-mono whitespace-pre-wrap break-all bg-slate-900 p-4 rounded max-h-96 overflow-y-auto">
                {tailContent || "Loading..."}
              </pre>
              <p className="text-xs text-slate-400 mt-2">
                Auto-refreshing every 2 seconds
              </p>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            ...(contextMenu.item.isDirectory ? [{
              label: "Open",
              icon: <Folder size={14} />,
              onClick: () => openDirectory(contextMenu.item!)
            }] : []),
            {
              label: "Download",
              icon: <Download size={14} />,
              onClick: () => downloadItem(contextMenu.item!)
            },
            {
              label: "Zip",
              icon: <Archive size={14} />,
              onClick: () => zipItem(contextMenu.item!)
            },
            ...(!contextMenu.item.isDirectory && !contextMenu.item.name.endsWith(".zip") ? [
              {
                label: "Edit",
                icon: <Pencil size={14} />,
                onClick: () => startEditing(contextMenu.item!)
              },
              {
                label: "Tail",
                icon: <Eye size={14} />,
                onClick: () => startTailing(contextMenu.item!.fullPath)
              }
            ] : []),
            {
              label: "Copy",
              icon: <Copy size={14} />,
              onClick: () => {
                setClipboard({ items: [contextMenu.item!.fullPath], operation: "copy" });
                setContextMenu(null);
              }
            },
            {
              label: "Cut",
              icon: <Scissors size={14} />,
              onClick: () => {
                setClipboard({ items: [contextMenu.item!.fullPath], operation: "cut" });
                setContextMenu(null);
              }
            },
            ...(contextMenu.item.name.endsWith(".zip") ? [{
              label: "Unzip",
              icon: <FileArchive size={14} />,
              onClick: () => unzipFile(contextMenu.item!.fullPath)
            }] : []),
            {
              label: "Rename",
              icon: <FileEdit size={14} />,
              onClick: () => renameItem(contextMenu.item!)
            },
            {
              label: "Delete",
              icon: <Trash2 size={14} />,
              onClick: () => deleteItem(contextMenu.item!),
              danger: true
            }
          ]}
        />
      )}
    </section>
  );
}

