import { useState } from "react";
import { Power, Shield, Lock } from "lucide-react";
import { api } from "../api/client";

export default function PowerControls() {
  const [isBusy, setIsBusy] = useState(false);

  const invoke = async (endpoint: string, payload?: unknown) => {
    if (!window.confirm("Are you sure?")) return;
    setIsBusy(true);
    try {
      await api(endpoint, {
        method: "POST",
        body: JSON.stringify(payload ?? {})
      });
      alert("Command sent.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="panel space-y-3">
      <h3 className="panel-title">Power</h3>
      <div className="grid grid-cols-3 gap-3">
        <button
          className="btn-primary flex items-center justify-center gap-2"
          onClick={() => invoke("/api/power/restart", { force: true })}
          disabled={isBusy}
        >
          <Power size={16} /> Restart
        </button>
        <button
          className="btn-outline flex items-center justify-center gap-2"
          onClick={() => invoke("/api/power/shutdown", { force: true })}
          disabled={isBusy}
        >
          <Shield size={16} /> Shutdown
        </button>
        <button
          className="btn-outline flex items-center justify-center gap-2"
          onClick={() => invoke("/api/power/lock")}
          disabled={isBusy}
        >
          <Lock size={16} /> Lock
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Commands execute immediately on the local device.
      </p>
    </section>
  );
}

