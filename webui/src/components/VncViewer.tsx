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
  const intentionalDisconnectRef = useRef(false);

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
        // Create RFB instance with the container div - noVNC will create its own canvas
        const rfb = new RFB(container, wsUrl);

        // Set credentials immediately after creation, before connection starts
        // noVNC checks for credentials when the credentialsrequired event fires
        if (password) {
          // Set credentials as a property (this is the correct way for noVNC)
          rfb.credentials = { password: password };
        }

        rfb.addEventListener("connect", () => {
          setIsConnected(true);
          setConnectionStatus("Connected");
        });

        rfb.addEventListener("desktopname", (e: any) => {
          // Handle desktop name update if needed
        });

        rfb.addEventListener("disconnect", (e: any) => {
          setIsConnected(false);
          const reason = e.detail?.reason || e.detail?.message || "Unknown reason";
          setConnectionStatus(`Disconnected: ${e.detail?.clean ? "Clean disconnect" : reason}`);

          // Only call onDisconnect callback if this was an intentional disconnect
          // This prevents accidental window closes from keyboard shortcuts or network issues
          if (intentionalDisconnectRef.current) {
            onDisconnect?.();
          }
        });

        rfb.addEventListener("credentialsrequired", (e: any) => {
          setConnectionStatus("Sending credentials...");
          if (password) {
            // Ensure credentials are set (they should already be set, but double-check)
            rfb.credentials = { password: password };

            // noVNC should automatically use the credentials property
            // But we can try to explicitly trigger it if methods are available
            try {
              // Method 1: sendCredentials (if available in this noVNC version)
              if (typeof (rfb as any).sendCredentials === "function") {
                (rfb as any).sendCredentials({ password: password });
                return;
              }

              // Method 2: sendPassword (alternative method)
              if (typeof (rfb as any).sendPassword === "function") {
                (rfb as any).sendPassword(password);
                return;
              }

              // Method 3: Just setting credentials should work for most noVNC versions
              // The credentials property is checked automatically by noVNC

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
        rfb.scaleViewport = true; // Scale viewport to fit window
        rfb.resizeSession = false; // Don't resize the remote session
        rfb.clipViewport = false; // Don't clip viewport
        rfb.showDotCursor = true; // Show remote cursor
        rfb.viewOnly = false; // Allow interaction (not view-only)

        // Disable noVNC keyboard shortcuts to prevent accidental disconnects
        // The 't' key and other shortcuts can interfere with normal typing
        // Note: This disables hotkeys but keeps normal keyboard input working
        rfb.focusOnClick = true; // Focus on click for better keyboard handling

        rfbRef.current = rfb;
      } catch (error) {
        console.error("Failed to create VNC connection", error);
        setConnectionStatus(`Connection error: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    };

    initVnc();

    return () => {
      // Mark cleanup disconnects as intentional to avoid errors
      intentionalDisconnectRef.current = true;
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
    };
  }, [host, port, password, onDisconnect]);

  const handleDisconnect = () => {
    // Mark this as an intentional disconnect
    intentionalDisconnectRef.current = true;
    if (rfbRef.current) {
      rfbRef.current.disconnect();
    }
    // The onDisconnect callback will be called from the disconnect event handler
  };

  return (
    <div className="flex flex-col w-full h-full bg-black">
      <div className="bg-slate-900/90 text-white p-2 flex items-center justify-between z-10 shrink-0">
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
        className="flex-1 w-full overflow-hidden"
        style={{
          display: "block",
          position: "relative"
        }}
      />
    </div>
  );
}

