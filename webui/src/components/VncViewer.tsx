import { useEffect, useRef, useState } from "react";
// Dynamic import for noVNC to handle module resolution
let RFB: any;

interface VncViewerProps {
  host: string;
  port: number;
  password?: string;
  onDisconnect?: () => void;
}

export default function VncViewer({ host, port, password, onDisconnect }: VncViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("Connecting...");

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Create WebSocket URL - VNC uses raw TCP, so we need a WebSocket proxy
    // The backend should provide a WebSocket endpoint that proxies to the VNC server
    // Format: ws://host:webPort/vnc-ws?host=targetHost&port=targetPort
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/api/vnc/ws?host=${encodeURIComponent(host)}&port=${port}`;
    
    // Dynamically import noVNC
    const initVnc = async () => {
      try {
        // Import noVNC RFB client
        let RFBModule;
        try {
          // Import from @novnc/novnc/lib/rfb
          RFBModule = await import("@novnc/novnc/lib/rfb.js");
          RFB = RFBModule.default || RFBModule.RFB || RFBModule;
        } catch (e) {
          try {
            // Fallback to @novnc/novnc main entry
            RFBModule = await import("@novnc/novnc");
            RFB = RFBModule.default || RFBModule.RFB || RFBModule;
          } catch (e2) {
            console.error("Failed to import noVNC:", e2);
            setConnectionStatus("Failed to load VNC client library");
            return;
          }
        }

        if (!RFB) {
          setConnectionStatus("VNC client library not available");
          return;
        }

        // Create RFB client - noVNC will handle authentication automatically
        // Note: noVNC connects automatically when RFB is instantiated
        console.log("Creating RFB client with WebSocket URL:", wsUrl);
        console.log("Password provided:", password ? `yes (length: ${password.length})` : "no");

        // IMPORTANT: For noVNC, credentials must be set as a property, not in constructor options
        // Create RFB instance with the container div - noVNC will create its own canvas
        const rfb = new RFB(container, wsUrl);
        
        // Set credentials immediately after creation, before connection starts
        // noVNC checks for credentials when the credentialsrequired event fires
        if (password) {
          // Set credentials as a property (this is the correct way for noVNC)
          rfb.credentials = { password: password };
          console.log("VNC credentials set as property");
        } else {
          console.log("No password provided for VNC connection");
        }

        rfb.addEventListener("connect", () => {
          setIsConnected(true);
          setConnectionStatus("Connected");
          console.log("VNC connected successfully");
        });

        rfb.addEventListener("desktopname", (e: any) => {
          console.log("VNC desktop name:", e.detail?.name);
        });

        rfb.addEventListener("disconnect", (e: any) => {
          setIsConnected(false);
          const reason = e.detail?.reason || e.detail?.message || "Unknown reason";
          setConnectionStatus(`Disconnected: ${e.detail?.clean ? "Clean disconnect" : reason}`);
          console.error("VNC disconnected", e.detail, e);
          onDisconnect?.();
        });

        rfb.addEventListener("credentialsrequired", (e: any) => {
          console.log("VNC credentials required event fired", e);
          setConnectionStatus("Sending credentials...");
          if (password) {
            // Ensure credentials are set (they should already be set, but double-check)
            rfb.credentials = { password: password };
            console.log("VNC credentials set in credentialsrequired handler");
            
            // noVNC should automatically use the credentials property
            // But we can try to explicitly trigger it if methods are available
            try {
              // Method 1: sendCredentials (if available in this noVNC version)
              if (typeof (rfb as any).sendCredentials === "function") {
                (rfb as any).sendCredentials({ password: password });
                console.log("Called sendCredentials method");
                return;
              }
              
              // Method 2: sendPassword (alternative method)
              if (typeof (rfb as any).sendPassword === "function") {
                (rfb as any).sendPassword(password);
                console.log("Called sendPassword method");
                return;
              }
              
              // Method 3: Just setting credentials should work for most noVNC versions
              // The credentials property is checked automatically by noVNC
              console.log("Credentials property set - noVNC should use them automatically");
              
            } catch (err) {
              console.error("Error in credentialsrequired handler:", err);
              setConnectionStatus("Error sending credentials");
            }
          } else {
            setConnectionStatus("Password required but not provided");
            console.error("VNC requires password but none was provided");
          }
        });

        rfb.addEventListener("securityfailure", (e: any) => {
          const reason = e.detail?.reason || e.detail?.message || "Authentication failed";
          setConnectionStatus(`Security failure: ${reason}`);
          console.error("VNC security failure", e.detail, e);
        });

        rfb.addEventListener("error", (e: any) => {
          const errorMsg = e.detail?.message || e.detail?.reason || "Connection error";
          setConnectionStatus(`Error: ${errorMsg}`);
          console.error("VNC error", e.detail, e);
        });

        // Configure noVNC options
        // Reference: https://github.com/novnc/noVNC/blob/master/docs/EMBEDDING.md
        rfb.scaleViewport = false; // Don't scale - show at native resolution
        rfb.resizeSession = false; // Don't resize the remote session
        rfb.clipViewport = false; // Use scrollbars instead of clipping for large screens

        rfbRef.current = rfb;
      } catch (error) {
        console.error("Failed to create VNC connection", error);
        setConnectionStatus(`Connection error: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    };

    initVnc();

    return () => {
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
    };
  }, [host, port, password, onDisconnect]);

  const handleDisconnect = () => {
    if (rfbRef.current) {
      rfbRef.current.disconnect();
    }
    onDisconnect?.();
  };

  return (
    <div className="relative w-full h-full bg-black">
      <div className="absolute top-0 left-0 right-0 bg-slate-900/90 text-white p-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm">{connectionStatus}</span>
        </div>
        <button
          onClick={handleDisconnect}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
        >
          Disconnect
        </button>
      </div>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          overflow: "auto"
        }}
      />
    </div>
  );
}

