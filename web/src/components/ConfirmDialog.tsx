import { AlertTriangle } from "lucide-react";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "삭제",
  cancelLabel = "취소",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-danger/10 text-accent-danger">
            <AlertTriangle size={20} />
          </div>
          <h3 className="text-[15px] font-bold text-ink">{title}</h3>
        </div>
        <p className="mb-5 whitespace-pre-line text-[13px] leading-relaxed text-ink-mute">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
