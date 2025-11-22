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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rfbRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("Connecting...");

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    
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
        console.log("Password provided:", password ? "yes (length: " + password.length + ")" : "no");
        
        // IMPORTANT: Set credentials BEFORE creating RFB instance
        // noVNC needs credentials to be available when the connection starts
        const rfbOptions: any = {
          // Set credentials in options if available
        };
        if (password) {
          rfbOptions.credentials = { password: password };
          console.log("VNC credentials set in RFB constructor options, password length:", password.length);
        } else {
          console.log("No password provided for VNC connection");
        }
        
        console.log("Creating RFB instance with options:", { ...rfbOptions, credentials: rfbOptions.credentials ? "***" : undefined });
        const rfb = new RFB(canvas, wsUrl, Object.keys(rfbOptions).length > 0 ? rfbOptions : undefined);
        
        // Also set credentials property immediately after creation for compatibility
        // This ensures credentials are available even if constructor options didn't work
        if (password) {
          rfb.credentials = { password: password };
          console.log("VNC credentials also set as property after RFB creation");
        }

        rfb.addEventListener("connect", () => {
          setIsConnected(true);
          setConnectionStatus("Connected");
          console.log("VNC connected successfully");
        });
        
        rfb.addEventListener("serverinit", () => {
          console.log("VNC ServerInit received");
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
            // Set credentials immediately - noVNC should use them automatically
            rfb.credentials = { password: password };
            console.log("VNC credentials set in credentialsrequired handler, password length:", password.length);
            
            // Some noVNC versions need explicit sendCredentials call
            // Try multiple methods to ensure credentials are sent
            try {
              // Method 1: sendCredentials (if available)
              if (typeof (rfb as any).sendCredentials === "function") {
                (rfb as any).sendCredentials({ password: password });
                console.log("Called sendCredentials method");
                return; // Exit early if successful
              }
              
              // Method 2: sendPassword (alternative method)
              if (typeof (rfb as any).sendPassword === "function") {
                (rfb as any).sendPassword(password);
                console.log("Called sendPassword method");
                return;
              }
              
              // Method 3: Try to trigger credential sending by accessing the property
              // Setting credentials should be enough for most noVNC versions
              console.log("No explicit send method found, credentials property set - noVNC should use them automatically");
              
              // Force a re-check by accessing the credentials property
              const creds = rfb.credentials;
              console.log("Current credentials:", creds ? "set" : "not set");
              
            } catch (err) {
              console.error("Error sending credentials:", err);
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

        rfb.scaleViewport = true;
        rfb.resizeSession = false;

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
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block" }}
      />
    </div>
  );
}

