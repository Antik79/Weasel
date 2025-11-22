import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  variant = "info"
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: "bg-red-900/20 border-red-500/50 text-red-200",
    warning: "bg-amber-900/20 border-amber-500/50 text-amber-200",
    info: "bg-sky-900/20 border-sky-500/50 text-sky-200"
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${variantStyles[variant]}`}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={onCancel}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p className="text-slate-300">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-outline" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`btn-primary ${variant === "danger" ? "bg-red-600 hover:bg-red-700" : ""}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

