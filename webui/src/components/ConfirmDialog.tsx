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
      <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${variantStyles[variant]}`}>
              <AlertTriangle size={16} />
            </div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
          </div>
          <button
            className="icon-btn flex-shrink-0"
            onClick={onCancel}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-slate-300 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button className="btn-outline text-sm" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={`btn-primary text-sm ${variant === "danger" ? "bg-red-600 hover:bg-red-700" : ""}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

