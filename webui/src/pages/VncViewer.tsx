import { useEffect, useState } from "react";
import VncViewer from "../components/VncViewer";
import { api } from "../api/client";
import type { VncRecordingOptions } from "../types";

export default function VncViewerPage() {
  const [connectionParams, setConnectionParams] = useState<{
    host: string;
    port: number;
    password?: string;
    viewOnly?: boolean;
    shared?: boolean;
    quality?: number;
    compression?: number;
    profileId?: string;
    profileName?: string;
  } | null>(null);
  const [recordingOptions, setRecordingOptions] = useState<VncRecordingOptions | undefined>();

  useEffect(() => {
    // Get connection parameters from URL query params or localStorage
    const params = new URLSearchParams(window.location.search);
    const host = params.get("host") || localStorage.getItem("vnc_host") || "localhost";
    const port = parseInt(params.get("port") || localStorage.getItem("vnc_port") || "5900", 10);
    // URLSearchParams.get() already handles decoding automatically
    const password = params.get("password") || localStorage.getItem("vnc_password") || undefined;

    // Debug logging for password (mask it for security)
    console.log('[VNC Viewer] Password received:', !!password);
    console.log('[VNC Viewer] Password length:', password?.length || 0);
    if (password && password.length > 0) {
      console.log('[VNC Viewer] Password check (first/last char):',
        password.charAt(0),
        password.charAt(password.length - 1));
    }

    // Get VNC options
    const viewOnly = params.get("viewOnly") === "true" || localStorage.getItem("vnc_viewOnly") === "true";
    const shared = params.get("shared") === "true" || localStorage.getItem("vnc_shared") === "true";
    const quality = parseInt(params.get("quality") || localStorage.getItem("vnc_quality") || "6", 10);
    const compression = parseInt(params.get("compression") || localStorage.getItem("vnc_compression") || "2", 10);

    // Get profile info for recording
    const profileId = params.get("profileId") || undefined;
    const profileName = params.get("profileName") || undefined;

    setConnectionParams({ host, port, password, viewOnly, shared, quality, compression, profileId, profileName });

    // Fetch recording configuration
    const fetchRecordingConfig = async () => {
      try {
        const config = await api<VncRecordingOptions>("/api/vnc/recordings/config");
        setRecordingOptions(config);
      } catch (error) {
        console.error("Failed to fetch recording config:", error);
      }
    };
    fetchRecordingConfig();

    // Try to enter fullscreen
    const requestFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (error) {
        console.log("Could not enter fullscreen:", error);
      }
    };

    // Small delay to ensure page is loaded
    setTimeout(requestFullscreen, 100);
  }, []);

  const handleDisconnect = () => {
    // Exit fullscreen if in fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    // Close the window after a short delay
    setTimeout(() => {
      window.close();
    }, 500);
  };

  const handleScreenshot = async (dataUrl: string) => {
    try {
      console.log('[VNC Screenshot] Starting screenshot upload...');

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      console.log('[VNC Screenshot] Converted to blob, size:', blob.size);

      // Create form data
      const formData = new FormData();
      const filename = `vnc-screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;

      // Add the file and the destination path
      formData.append('file', blob, filename);
      formData.append('path', 'Screenshots'); // Upload to Screenshots folder

      console.log('[VNC Screenshot] Uploading to Screenshots folder, filename:', filename);

      // Get auth token
      const authToken = localStorage.getItem("weasel.auth.token");
      const headers: Record<string, string> = {};
      if (authToken) {
        headers["X-Weasel-Token"] = authToken;
      }

      // Upload to screenshots folder
      const uploadResponse = await fetch("/api/fs/upload", {
        method: "POST",
        headers,
        body: formData
      });

      if (uploadResponse.ok) {
        console.log('[VNC Screenshot] Screenshot saved successfully:', filename);
      } else {
        const errorText = await uploadResponse.text();
        console.error('[VNC Screenshot] Upload failed:', uploadResponse.status, errorText);
      }
    } catch (error) {
      console.error('[VNC Screenshot] Failed to save screenshot:', error);
    }
  };

  if (!connectionParams) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center text-white">
        <div>Loading VNC connection...</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      <VncViewer
        host={connectionParams.host}
        port={connectionParams.port}
        password={connectionParams.password}
        viewOnly={connectionParams.viewOnly}
        shared={connectionParams.shared}
        quality={connectionParams.quality}
        compression={connectionParams.compression}
        profileId={connectionParams.profileId}
        profileName={connectionParams.profileName}
        enableRecording={!!connectionParams.profileId && !!recordingOptions}
        recordingOptions={recordingOptions}
        onDisconnect={handleDisconnect}
        onScreenshot={handleScreenshot}
      />
    </div>
  );
}

