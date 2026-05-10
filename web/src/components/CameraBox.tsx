import clsx from "clsx";

export default function CameraBox({
  label,
  detection,
  blocked,
  height = 280,
  status,
  time,
}: {
  label: string;
  detection?: { name: string; confidence: number; pos: { left: string; top: string } };
  blocked?: { pos: { left: string; top: string } };
  height?: number;
  status?: string;
  time?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[10px] border border-sidebar-border bg-sidebar"
      style={{ height }}
    >
      <div className="absolute inset-0 flex items-center justify-center text-[14px] font-medium text-brand-muted">
        {label}
      </div>

      {detection && (
        <div
          className="absolute h-[110px] w-[150px] rounded-lg border-2 border-brand"
          style={detection.pos}
        >
          <div className="absolute -top-5 left-0 rounded bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
            {detection.name} {Math.round(detection.confidence * 1000) / 10}%
          </div>
        </div>
      )}

      {blocked && (
        <div
          className="absolute h-[110px] w-[120px] rounded-lg border-2 border-dashed border-accent-danger"
          style={blocked.pos}
        >
          <div className="absolute -top-5 left-0 rounded bg-accent-danger px-2 py-0.5 text-[10px] font-bold text-white">
            미등록 개체
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-sidebar/90 px-4 py-2.5 backdrop-blur">
        <div
          className={clsx(
            "flex items-center gap-1.5 text-[11px] font-semibold",
            blocked ? "text-accent-danger" : "text-brand"
          )}
        >
          <span
            className={clsx(
              "h-1.5 w-1.5 rounded-full",
              blocked ? "bg-accent-danger" : "bg-brand"
            )}
          />
          {status ?? (blocked ? "배식 중단" : "급식 진행 중")}
        </div>
        <div className="text-[10px] text-ink-faint">{time ?? "09:32:15"}</div>
      </div>
    </div>
  );
}
