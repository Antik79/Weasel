import { useEffect, useState, Suspense, lazy } from "react";

// Lazy load TerminalViewer
const TerminalViewer = lazy(() => import("../components/TerminalViewer"));

export default function TerminalPopupPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Get session ID from URL query params
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (id) {
      setSessionId(id);
      console.log("Terminal popup opened with session ID:", id);
    } else {
      console.error("No terminal session ID provided");
    }
  }, []);

  const handleClose = () => {
    window.close();
  };

  if (!sessionId) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-red-400">No terminal session ID provided</p>
          <button
            onClick={handleClose}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2 border-b border-slate-800">
        <h1 className="text-lg font-semibold text-white">Terminal - {sessionId}</h1>
        <button
          onClick={handleClose}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm text-white"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm text-slate-400">Loading terminal...</p>
            </div>
          </div>
        }>
          <TerminalViewer sessionId={sessionId} />
        </Suspense>
      </div>
    </div>
  );
}
