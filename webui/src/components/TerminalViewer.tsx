import { useEffect, useRef, useState } from "react";
import { Terminal as XTerminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { showToast } from "../App";

interface TerminalViewerProps {
  sessionId: string;
  onClose?: () => void;
}

export default function TerminalViewer({ sessionId, onClose }: TerminalViewerProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const terminal = new XTerminal({
      theme: {
        background: "#0f172a", // slate-900
        foreground: "#e2e8f0", // slate-200
        cursor: "#38bdf8", // sky-400
        selection: "#1e3a8a80", // sky-900 with opacity
        black: "#1e293b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e2e8f0",
        brightBlack: "#475569",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#f1f5f9"
      },
      fontSize: 14,
      fontFamily: "Consolas, 'Courier New', monospace",
      cursorBlink: true,
      cursorStyle: "block",
      allowTransparency: true
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    
    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const connectWebSocket = () => {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/api/terminal/ws?id=${encodeURIComponent(sessionId)}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          if (reconnectTimeoutRef.current) {
            window.clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          terminal.clear();
          terminal.write("\r\n\x1b[32mConnected to terminal\x1b[0m\r\n");
        };

        ws.onmessage = (event) => {
          if (typeof event.data === "string") {
            terminal.write(event.data);
          }
        };

        ws.onerror = (error) => {
          console.error("Terminal WebSocket error:", error);
          terminal.write("\r\n\x1b[31mConnection error\x1b[0m\r\n");
        };

        ws.onclose = () => {
          setIsConnected(false);
          terminal.write("\r\n\x1b[33mConnection closed\x1b[0m\r\n");
          
          // Attempt to reconnect after 2 seconds (unless we're closing)
          if (!onClose) {
            reconnectTimeoutRef.current = window.setTimeout(() => {
              if (terminalRef.current) {
                connectWebSocket();
              }
            }, 2000);
          }
        };

        // Handle terminal input
        terminal.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        // Handle resize
        const handleResize = () => {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit();
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "resize",
                rows: terminal.rows,
                cols: terminal.cols
              }));
            }
          }
        };

        window.addEventListener("resize", handleResize);
        
        return () => {
          window.removeEventListener("resize", handleResize);
        };
      } catch (error) {
        console.error("Failed to create WebSocket:", error);
        terminal.write("\r\n\x1b[31mFailed to connect\x1b[0m\r\n");
      }
    };

    connectWebSocket();

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
    };
  }, [sessionId, onClose]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      <div
        ref={terminalRef}
        className="w-full h-full"
        style={{ minHeight: "400px" }}
      />
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
          <div className="text-center">
            <div className="text-slate-400 mb-2">Connecting to terminal...</div>
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      )}
    </div>
  );
}

