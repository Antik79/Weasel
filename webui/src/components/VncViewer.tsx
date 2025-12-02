import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Camera, Circle, Square } from "lucide-react";
import type { VncRecordingSession, VncRecordingOptions } from "../types";
// Dynamic import for noVNC to handle module resolution
let RFB: any;

interface VncViewerProps {
  host: string;
  port: number;
  password?: string;
  viewOnly?: boolean;
  shared?: boolean;
  quality?: number; // 0-9 (0 = best quality, 9 = best compression)
  compression?: number; // 0-9 (0 = no compression, 9 = max compression)
  onDisconnect?: () => void;
  onScreenshot?: (dataUrl: string) => void;
  profileId?: string;
  profileName?: string;
  enableRecording?: boolean;
  recordingOptions?: VncRecordingOptions;
}

export default function VncViewer({ host, port, password, viewOnly = false, shared = false, quality = 6, compression = 2, onDisconnect, onScreenshot, profileId, profileName, enableRecording = false, recordingOptions }: VncViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("Connecting...");
  const intentionalDisconnectRef = useRef(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSession, setRecordingSession] = useState<VncRecordingSession | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const lastFrameDataRef = useRef<ImageData | null>(null);
  const motionDetectionIntervalRef = useRef<number | null>(null);
  const noMotionTimeoutRef = useRef<number | null>(null);
  const [motionDetected, setMotionDetected] = useState(false);

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
        console.log(`[VNC] Connecting to ${wsUrl}`);
        console.log(`[VNC] Password provided: ${!!password}`);
        const rfb = new RFB(container, wsUrl);

        // Set credentials immediately after creation, before connection starts
        // noVNC checks for credentials when the credentialsrequired event fires
        if (password) {
          // Set credentials as a property (this is the correct way for noVNC)
          rfb.credentials = { password: password };
          console.log("[VNC] Credentials set on RFB object");
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
        rfb.viewOnly = viewOnly; // Set view-only mode based on parameter
        rfb.focusOnClick = true; // Focus on click for better keyboard handling

        // Set quality level (0-9: 0=best quality, 9=best compression)
        // noVNC uses qualityLevel property
        if (typeof rfb.qualityLevel !== 'undefined') {
          rfb.qualityLevel = quality;
        }

        // Set compression level (0-9: 0=no compression, 9=max compression)
        // noVNC uses compressionLevel property
        if (typeof rfb.compressionLevel !== 'undefined') {
          rfb.compressionLevel = compression;
        }

        // Set shared mode (allows multiple viewers)
        // This is typically set during connection initialization
        if (typeof rfb.shared !== 'undefined') {
          rfb.shared = shared;
        }

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
    // Note: onDisconnect is intentionally NOT in the dependency array
    // to prevent reconnections when the callback reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, port, password, viewOnly, shared, quality, compression]);

  const handleDisconnect = () => {
    // Mark this as an intentional disconnect
    intentionalDisconnectRef.current = true;
    if (rfbRef.current) {
      rfbRef.current.disconnect();
    }
    // The onDisconnect callback will be called from the disconnect event handler
  };

  const handleCtrlAltDelete = () => {
    console.log('[VNC] Ctrl+Alt+Del button clicked');
    console.log('[VNC] RFB connected:', !!rfbRef.current, 'isConnected:', isConnected);

    if (rfbRef.current && isConnected) {
      // Send CTRL+ALT+DELETE key combination
      // noVNC uses sendCtrlAltDel() method
      try {
        console.log('[VNC] Checking sendCtrlAltDel method...');
        if (typeof rfbRef.current.sendCtrlAltDel === 'function') {
          console.log('[VNC] Sending Ctrl+Alt+Del...');
          rfbRef.current.sendCtrlAltDel();
          console.log('[VNC] Ctrl+Alt+Del sent successfully');
        } else {
          console.error('[VNC] sendCtrlAltDel method not available on RFB object');
          console.log('[VNC] Available methods:', Object.keys(rfbRef.current).filter(k => typeof (rfbRef.current as any)[k] === 'function'));
        }
      } catch (error) {
        console.error('[VNC] Failed to send Ctrl+Alt+Del:', error);
      }
    } else {
      console.warn('[VNC] Ctrl+Alt+Del not available - not connected');
    }
  };

  // Recording functions
  const uploadChunk = useCallback(async (sessionId: string, blob: Blob) => {
    try {
      console.log(`[VNC Recording] Uploading chunk: ${blob.size} bytes`);
      const arrayBuffer = await blob.arrayBuffer();
      const authToken = localStorage.getItem("weasel.auth.token");
      const headers: Record<string, string> = { "Content-Type": "application/octet-stream" };
      if (authToken) {
        headers["X-Weasel-Token"] = authToken;
      }

      const response = await fetch(`/api/vnc/recordings/chunk/${sessionId}`, {
        method: "POST",
        headers,
        body: arrayBuffer
      });

      if (response.ok) {
        console.log(`[VNC Recording] Chunk uploaded successfully: ${blob.size} bytes`);
      } else {
        console.error(`[VNC Recording] Failed to upload chunk:`, response.statusText);
      }
    } catch (error) {
      console.error("Failed to upload recording chunk:", error);
    }
  }, []);

  const detectMotion = useCallback((canvas: HTMLCanvasElement): boolean => {
    if (!recordingOptions?.enableMotionDetection) return true;

    const ctx = canvas.getContext("2d");
    if (!ctx) return true;

    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const lastFrame = lastFrameDataRef.current;

    if (!lastFrame || lastFrame.width !== currentFrame.width || lastFrame.height !== currentFrame.height) {
      lastFrameDataRef.current = currentFrame;
      return true;
    }

    const blockSize = recordingOptions.motionDetectionBlockSize || 32;
    const threshold = (recordingOptions.motionDetectionThresholdPercent || 10) / 100;
    const blocksX = Math.ceil(canvas.width / blockSize);
    const blocksY = Math.ceil(canvas.height / blockSize);
    let changedBlocks = 0;

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        const x = bx * blockSize;
        const y = by * blockSize;
        let diff = 0;
        let pixelCount = 0;

        for (let py = 0; py < blockSize && y + py < canvas.height; py++) {
          for (let px = 0; px < blockSize && x + px < canvas.width; px++) {
            const idx = ((y + py) * canvas.width + (x + px)) * 4;
            const rDiff = Math.abs(currentFrame.data[idx] - lastFrame.data[idx]);
            const gDiff = Math.abs(currentFrame.data[idx + 1] - lastFrame.data[idx + 1]);
            const bDiff = Math.abs(currentFrame.data[idx + 2] - lastFrame.data[idx + 2]);
            diff += (rDiff + gDiff + bDiff) / 3;
            pixelCount++;
          }
        }

        if (pixelCount > 0 && diff / pixelCount > 30) {
          changedBlocks++;
        }
      }
    }

    lastFrameDataRef.current = currentFrame;
    const changeRatio = changedBlocks / (blocksX * blocksY);
    return changeRatio > threshold;
  }, [recordingOptions]);

  const startRecording = useCallback(async () => {
    if (!containerRef.current || !profileId || !profileName) {
      console.warn('[VNC Recording] Cannot start recording: missing container, profileId, or profileName');
      return;
    }

    try {
      console.log('[VNC Recording] Starting recording for profile:', profileName);

      const canvas = containerRef.current.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        console.error("[VNC Recording] Canvas not found for recording");
        return;
      }

      // Get auth token
      const authToken = localStorage.getItem("weasel.auth.token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["X-Weasel-Token"] = authToken;
      }

      // Create recording session on server
      console.log('[VNC Recording] Creating recording session on server...');
      const response = await fetch("/api/vnc/recordings/start", {
        method: "POST",
        headers,
        body: JSON.stringify({ profileId, profileName })
      });

      if (!response.ok) {
        throw new Error("Failed to start recording session");
      }

      const session: VncRecordingSession = await response.json();
      console.log('[VNC Recording] Recording session created:', session.id, 'Output:', session.outputPath);
      setRecordingSession(session);

      // Detect supported codec
      const fps = recordingOptions?.recordingFps || 5;
      const mimeTypes = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm;codecs=h264",
        "video/webm"
      ];
      const supportedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedType) {
        throw new Error("No supported video codec found");
      }

      console.log('[VNC Recording] Using codec:', supportedType, 'FPS:', fps);

      // Capture canvas stream
      const stream = canvas.captureStream(fps);
      mediaStreamRef.current = stream;

      // Create MediaRecorder
      const recorder = new MediaRecorder(stream, {
        mimeType: supportedType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      });

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && session) {
          await uploadChunk(session.id, event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("[VNC Recording] MediaRecorder error:", event);
        stopRecording();
      };

      console.log('[VNC Recording] Starting MediaRecorder, chunks every 5 seconds...');
      recorder.start(5000); // Upload chunks every 5 seconds
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      console.log('[VNC Recording] Recording started successfully');

      // Start motion detection if enabled
      if (recordingOptions?.enableMotionDetection) {
        const detectionInterval = 1000 / fps;
        motionDetectionIntervalRef.current = window.setInterval(() => {
          const hasMotion = detectMotion(canvas);
          setMotionDetected(hasMotion);

          // Update server with frame stats
          if (session) {
            fetch(`/api/vnc/recordings/frame-stats/${session.id}`, {
              method: "POST",
              headers,
              body: JSON.stringify({ motionDetected: hasMotion })
            }).catch(console.error);
          }

          // Pause/resume recording based on motion with delay
          if (hasMotion) {
            // Motion detected - clear any pending pause timeout and resume immediately if paused
            if (noMotionTimeoutRef.current) {
              clearTimeout(noMotionTimeoutRef.current);
              noMotionTimeoutRef.current = null;
              console.log('[VNC Recording] Motion detected, cancelling pause timer');
            }

            if (recorder.state === "paused") {
              console.log('[VNC Recording] Resuming recording due to motion');
              recorder.resume();
            }
          } else {
            // No motion detected - start timeout to pause after configured delay
            if (recorder.state === "recording" && !noMotionTimeoutRef.current) {
              const pauseDelayMs = (recordingOptions?.motionDetectionPauseDelaySeconds || 10) * 1000;
              console.log(`[VNC Recording] No motion detected, starting ${pauseDelayMs / 1000}s pause timer`);
              noMotionTimeoutRef.current = window.setTimeout(() => {
                if (recorder.state === "recording") {
                  console.log(`[VNC Recording] Pausing recording after ${pauseDelayMs / 1000}s of no motion`);
                  recorder.pause();
                }
                noMotionTimeoutRef.current = null;
              }, pauseDelayMs);
            }
          }
        }, detectionInterval);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
      setIsRecording(false);
      setRecordingSession(null);
    }
  }, [profileId, profileName, recordingOptions, uploadChunk, detectMotion]);

  const stopRecording = useCallback(async () => {
    try {
      console.log('[VNC Recording] Stopping recording...');

      // Stop motion detection
      if (motionDetectionIntervalRef.current) {
        clearInterval(motionDetectionIntervalRef.current);
        motionDetectionIntervalRef.current = null;
      }

      // Clear any pending pause timeout
      if (noMotionTimeoutRef.current) {
        clearTimeout(noMotionTimeoutRef.current);
        noMotionTimeoutRef.current = null;
      }

      // Stop media recorder and wait for final chunk
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        console.log('[VNC Recording] Stopping MediaRecorder, waiting for final chunk...');

        // Create a promise that resolves when the final chunk is uploaded
        const finalChunkPromise = new Promise<void>((resolve) => {
          const recorder = mediaRecorderRef.current;
          if (!recorder) {
            resolve();
            return;
          }

          // Set up handler for final data chunk
          const originalHandler = recorder.ondataavailable;
          recorder.ondataavailable = async (event) => {
            // Call original handler to upload the chunk
            if (originalHandler) {
              await originalHandler(event);
            }
            console.log('[VNC Recording] Final chunk uploaded, size:', event.data.size);
            resolve();
          };

          // Stop will trigger ondataavailable one final time
          recorder.stop();
        });

        // Wait for final chunk with timeout
        await Promise.race([
          finalChunkPromise,
          new Promise(resolve => setTimeout(resolve, 10000)) // 10 second timeout
        ]);

        mediaRecorderRef.current = null;
        console.log('[VNC Recording] MediaRecorder stopped');
      }

      // Stop media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      // Notify server to finalize recording
      if (recordingSession) {
        console.log('[VNC Recording] Notifying server to stop recording:', recordingSession.id);
        const authToken = localStorage.getItem("weasel.auth.token");
        const headers: Record<string, string> = {};
        if (authToken) {
          headers["X-Weasel-Token"] = authToken;
        }

        const response = await fetch(`/api/vnc/recordings/stop/${recordingSession.id}`, {
          method: "POST",
          headers
        });

        if (response.ok) {
          console.log('[VNC Recording] Recording stopped successfully');
        } else {
          console.error('[VNC Recording] Failed to stop recording on server:', response.statusText);
        }
      }

      setIsRecording(false);
      setRecordingSession(null);
      setMotionDetected(false);
      lastFrameDataRef.current = null;
    } catch (error) {
      console.error("Failed to stop recording:", error);
    }
  }, [recordingSession]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
    };
  }, [isRecording, stopRecording]);

  const handleTakeScreenshot = () => {
    console.log('[VNC] Screenshot button clicked');
    console.log('[VNC] RFB connected:', !!rfbRef.current, 'isConnected:', isConnected, 'has container:', !!containerRef.current);

    if (rfbRef.current && isConnected && containerRef.current) {
      try {
        // Get the canvas element created by noVNC
        const canvas = containerRef.current.querySelector('canvas');
        console.log('[VNC] Canvas found:', !!canvas);

        if (canvas instanceof HTMLCanvasElement) {
          // Convert canvas to data URL (PNG format)
          const dataUrl = canvas.toDataURL('image/png');
          console.log('[VNC] Screenshot captured, size:', dataUrl.length);

          // Call the callback if provided
          if (onScreenshot) {
            console.log('[VNC] Calling onScreenshot callback');
            onScreenshot(dataUrl);
          } else {
            // Fallback: download directly
            console.log('[VNC] No callback, downloading directly');
            const link = document.createElement('a');
            link.download = `vnc-screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            link.href = dataUrl;
            link.click();
          }
        } else {
          console.error('[VNC] Canvas element not found in VNC container');
        }
      } catch (error) {
        console.error('[VNC] Failed to take screenshot:', error);
      }
    } else {
      console.warn('[VNC] Screenshot not available - not connected or container not ready');
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-black">
      <div className="bg-slate-900/90 text-white p-2 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm">{connectionStatus}</span>
          {isRecording && (
            <div className="flex items-center gap-1.5 ml-2 px-2 py-1 bg-red-900/30 border border-red-500/50 rounded">
              <Circle size={10} className={`fill-red-500 ${motionDetected ? "animate-pulse" : ""}`} />
              <span className="text-xs text-red-400">REC</span>
              {recordingOptions?.enableMotionDetection && (
                <span className="text-xs text-gray-400">
                  {motionDetected ? "Motion" : "Paused"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {enableRecording && profileId && profileName && (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!isConnected}
              className={`px-3 py-1 rounded text-sm flex items-center gap-1.5 transition-colors disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed ${
                isRecording
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
              title={isRecording ? "Stop Recording" : "Start Recording"}
            >
              {isRecording ? <Square size={14} /> : <Circle size={14} />}
              {isRecording ? "Stop" : "Record"}
            </button>
          )}
          <button
            type="button"
            onClick={handleCtrlAltDelete}
            disabled={!isConnected}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded text-sm flex items-center gap-1.5 transition-colors"
            title="Send Ctrl+Alt+Delete"
          >
            <Send size={14} />
            Ctrl+Alt+Del
          </button>
          <button
            type="button"
            onClick={handleTakeScreenshot}
            disabled={!isConnected}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded text-sm flex items-center gap-1.5 transition-colors"
            title="Take Screenshot"
          >
            <Camera size={14} />
            Screenshot
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
          >
            Disconnect
          </button>
        </div>
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

