import { useEffect, useState } from "react";
import VncViewer from "../components/VncViewer";

export default function VncViewerPage() {
  const [connectionParams, setConnectionParams] = useState<{
    host: string;
    port: number;
    password?: string;
  } | null>(null);

  useEffect(() => {
    // Get connection parameters from URL query params or localStorage
    const params = new URLSearchParams(window.location.search);
    const host = params.get("host") || localStorage.getItem("vnc_host") || "localhost";
    const port = parseInt(params.get("port") || localStorage.getItem("vnc_port") || "5900", 10);
    const password = params.get("password") || localStorage.getItem("vnc_password") || undefined;

    setConnectionParams({ host, port, password });

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
        onDisconnect={handleDisconnect}
      />
    </div>
  );
}

