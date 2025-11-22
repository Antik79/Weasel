import { getAuthToken, clearAuthToken } from "../components/Login";

const CSRF_KEY = "weasel.csrf";

const generateToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const csrfToken = (() => {
  if (typeof window === "undefined") {
    return "local";
  }

  const existing = window.localStorage.getItem(CSRF_KEY);
  if (existing) {
    return existing;
  }

  const generated = generateToken();
  window.localStorage.setItem(CSRF_KEY, generated);
  return generated;
})();

export async function api<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const authToken = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Weasel-Csrf": csrfToken,
    Accept: "application/json",
    ...(init?.headers as Record<string, string> ?? {})
  };

  if (authToken) {
    headers["X-Weasel-Token"] = authToken;
  }

  const response = await fetch(input, {
    headers,
    ...init
  });

  if (response.status === 401) {
    // Authentication failed, clear token and reload to show login
    clearAuthToken();
    window.location.reload();
    throw new Error("Authentication required.");
  }

  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  if (!response.ok) {
    // Read the response body once as text
    const text = await response.text();
    
    // Try to parse as JSON if content-type suggests it
    if (isJson && text) {
      try {
        const errorData = JSON.parse(text);
        const errorMessage = errorData.error || errorData.detail || errorData.message || `Request failed with ${response.status}`;
        throw new Error(errorMessage);
      } catch (parseError) {
        // If JSON parsing fails, use the text as error message
        throw new Error(text || `Request failed with ${response.status}`);
      }
    } else {
      throw new Error(text || `Request failed with ${response.status}`);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  // Read the response body once
  const text = await response.text();
  
  if (isJson && text) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  return text as T;
}

export async function upload(formData: FormData): Promise<void> {
  const authToken = getAuthToken();
  const headers: Record<string, string> = {
    "X-Weasel-Csrf": csrfToken
  };

  if (authToken) {
    headers["X-Weasel-Token"] = authToken;
  }

  // Don't set Content-Type - let browser set it for multipart/form-data
  const response = await fetch("/api/fs/upload", {
    method: "POST",
    headers,
    body: formData
  });

  if (response.status === 401) {
    clearAuthToken();
    window.location.reload();
    throw new Error("Authentication required.");
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Upload failed with ${response.status}`);
  }
}

export function download(path: string) {
  const url = new URL("/api/fs/download", window.location.origin);
  url.searchParams.set("path", path);
  window.open(url.toString(), "_blank");
}

// System API functions
export async function getSystemVersion(): Promise<{ version: string; buildDate?: string }> {
  return api<{ version: string; buildDate?: string }>("/api/system/version");
}

// VNC API functions
import type { VncConfig, VncStatus } from "../types";

export async function getVncStatus(): Promise<VncStatus> {
  return api<VncStatus>("/api/vnc/status");
}

export async function getVncConfig(): Promise<VncConfig> {
  return api<VncConfig>("/api/vnc/config");
}

export async function startVncServer(): Promise<{ message: string }> {
  return api<{ message: string }>("/api/vnc/start", {
    method: "POST"
  });
}

export async function stopVncServer(): Promise<{ message: string }> {
  return api<{ message: string }>("/api/vnc/stop", {
    method: "POST"
  });
}

export async function updateVncConfig(config: {
  enabled: boolean;
  port: number;
  allowRemote: boolean;
  password?: string;
}): Promise<VncConfig> {
  return api<VncConfig>("/api/vnc/config", {
    method: "PUT",
    body: JSON.stringify(config)
  });
}

