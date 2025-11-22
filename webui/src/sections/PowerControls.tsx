import { useState } from "react";
import { Power, Shield, Lock } from "lucide-react";
import { api } from "../api/client";
import { showToast } from "../App";
import ConfirmDialog from "../components/ConfirmDialog";

export default function PowerControls() {
  const [isBusy, setIsBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    variant: "info"
  });
  const [pendingAction, setPendingAction] = useState<{ endpoint: string; payload?: unknown } | null>(null);

  const invoke = async (endpoint: string, payload?: unknown) => {
    setPendingAction({ endpoint, payload });
    setConfirmDialog({
      isOpen: true,
      title: "Confirm Action",
      message: "Are you sure?",
      onConfirm: async () => {
        if (!pendingAction) return;
        setIsBusy(true);
        try {
          await api(pendingAction.endpoint, {
            method: "POST",
            body: JSON.stringify(pendingAction.payload ?? {})
          });
          showToast("Command sent.", "success");
          setPendingAction(null);
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        } catch (error) {
          showToast(`Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        } finally {
          setIsBusy(false);
        }
      },
      variant: "warning"
    });
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

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => {
          setConfirmDialog({ ...confirmDialog, isOpen: false });
          setPendingAction(null);
        }}
        variant={confirmDialog.variant}
      />
    </section>
  );
}

