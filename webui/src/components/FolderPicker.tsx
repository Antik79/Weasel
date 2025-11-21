import { useState, useEffect } from "react";
import useSWR from "swr";
import { Folder, HardDrive, ChevronUp, Check, X, Loader2 } from "lucide-react";
import { api } from "../api/client";
import { FileSystemItem } from "../types";
import { formatPath } from "../utils/format";

interface FolderPickerProps {
    initialPath?: string;
    onSelect: (path: string) => void;
    onCancel: () => void;
}

const fetcher = (path: string) => api<FileSystemItem[]>(`/api/fs?path=${encodeURIComponent(path)}`);
const drivesFetcher = () => api<FileSystemItem[]>("/api/fs/drives");

export default function FolderPicker({ initialPath, onSelect, onCancel }: FolderPickerProps) {
    const [currentPath, setCurrentPath] = useState(initialPath || "");

    // If path is empty, fetch drives. Otherwise fetch children of path.
    const key = currentPath ? currentPath : "drives";
    const { data, error, isLoading } = useSWR(key, currentPath ? () => fetcher(currentPath) : drivesFetcher);

    // Filter to show only directories
    const items = data?.filter(item => item.isDirectory) || [];

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
    };

    const handleUp = () => {
        if (!currentPath) return;

        // Simple parent path resolution
        const parts = currentPath.split(/[/\\]/);
        // Remove last part
        parts.pop();
        // If it was a drive root (e.g. "C:"), parts might be empty or just empty string
        if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) {
            setCurrentPath("");
        } else {
            // Join back, ensuring we don't end up with a trailing slash unless it's root
            const newPath = parts.join("\\") || "";
            // If we went up from "C:\Users", we get "C:". 
            // If we went up from "C:", we want empty string to show drives list.
            // But "C:" split is ["C:", ""]. pop gives ["C:"]. 
            // Let's handle the drive root case specifically.
            if (currentPath.endsWith(":\\") || (currentPath.length === 2 && currentPath[1] === ':')) {
                setCurrentPath("");
            } else {
                setCurrentPath(newPath);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800 rounded-t-lg">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <Folder className="text-blue-400" size={20} />
                        Select Folder
                    </h3>
                    <button onClick={onCancel} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar / Path */}
                <div className="p-2 bg-slate-800 border-b border-slate-700 flex gap-2 items-center">
                    <button
                        onClick={handleUp}
                        disabled={!currentPath}
                        className="p-2 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Go Up"
                    >
                        <ChevronUp size={20} />
                    </button>
                    <div className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300 font-mono truncate">
                        {formatPath(currentPath) || "This PC"}
                    </div>
                </div>

                {/* File List */}
                <div className="flex-1 overflow-y-auto p-2 min-h-[300px]">
                    {isLoading && (
                        <div className="flex items-center justify-center h-full text-slate-400 gap-2">
                            <Loader2 className="animate-spin" size={24} />
                            Loading...
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center justify-center h-full text-red-400 gap-2">
                            <X size={24} />
                            Failed to load directory
                        </div>
                    )}

                    {!isLoading && !error && items.length === 0 && (
                        <div className="flex items-center justify-center h-full text-slate-500 italic">
                            No folders found
                        </div>
                    )}

                    {!isLoading && !error && (
                        <div className="grid grid-cols-1 gap-1">
                            {items.map((item) => (
                                <button
                                    key={item.fullPath || item.name}
                                    onClick={() => handleNavigate(item.fullPath || item.name)} // Single click to navigate for now, or maybe double click? 
                                    // Usually single click selects, double click navigates. 
                                    // But for a folder picker, we usually want to navigate to find the target.
                                    // Let's make single click navigate for simplicity on web.
                                    className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded text-left group"
                                >
                                    {currentPath === "" ? (
                                        <HardDrive className="text-slate-400 group-hover:text-blue-400" size={20} />
                                    ) : (
                                        <Folder className="text-yellow-500 group-hover:text-yellow-400" size={20} />
                                    )}
                                    <span className="text-slate-200 text-sm flex-1 truncate">{item.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-800 rounded-b-lg flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSelect(currentPath)}
                        disabled={!currentPath}
                        className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Check size={16} />
                        Select This Folder
                    </button>
                </div>
            </div>
        </div>
    );
}
