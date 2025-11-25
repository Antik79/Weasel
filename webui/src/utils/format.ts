export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  return `${value} ${sizes[i]}`;
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

/**
 * Normalizes a file path for display by replacing multiple backslashes with single backslashes
 * @param path The path to normalize
 * @returns The normalized path with single backslashes
 */
export function formatPath(path: string): string {
  if (!path) return path;
  // Replace any sequence of 2 or more backslashes with a single backslash
  // This handles cases where paths are double-escaped (C:\\Users becomes C:\Users)
  return path.replace(/\\+/g, "\\");
}

