import clsx from "clsx";
import { useFeederStream } from "@/hooks/useFeederStream";

export default function CameraBox({
  label,
  deviceId,
  blocked,
  height = 280,
  status,
  time,
}: {
  label: string;
  deviceId?: string;          // Supabase Realtime 토픽 — feeder:<deviceId>
  blocked?: { pos: { left: string; top: string } };
  height?: number;
  status?: string;
  time?: string;
}) {
  const stream = useFeederStream(deviceId);

  const liveStatus =
    status ??
    (blocked
      ? "배식 중단"
      : stream.frameUrl
      ? stream.status ?? "급식 진행 중"
      : stream.connected
      ? "프레임 수신 대기"
      : "스트림 연결 대기");

  const isLive = !blocked && stream.frameUrl !== undefined;

  return (
    <div
      className="relative overflow-hidden rounded-[10px] border border-sidebar-border bg-sidebar"
      style={{ height }}
    >
      {stream.frameUrl ? (
        <img
          src={stream.frameUrl}
          alt={label}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[14px] font-medium text-brand-muted">
          {label}
        </div>
      )}

      {!blocked &&
        stream.detections.map((d, i) => (
          <div
            key={d.track_id ?? i}
            className={clsx(
              "absolute rounded-md border-2",
              d.stale ? "border-brand/60" : "border-brand"
            )}
            style={{
              left: `${d.x * 100}%`,
              top: `${d.y * 100}%`,
              width: `${d.w * 100}%`,
              height: `${d.h * 100}%`,
            }}
          >
            <div className="absolute -top-5 left-0 rounded bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-ink">
              {d.track_id != null ? `${d.class} #${d.track_id}` : d.class}{" "}
              {Math.round(d.conf * 1000) / 10}%
            </div>
          </div>
        ))}

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
            blocked
              ? "text-accent-danger"
              : isLive
              ? "text-brand"
              : "text-ink-faint"
          )}
        >
          <span
            className={clsx(
              "h-1.5 w-1.5 rounded-full",
              blocked
                ? "bg-accent-danger"
                : isLive
                ? "bg-brand animate-pulse"
                : "bg-ink-faint"
            )}
          />
          {liveStatus}
        </div>
        <div className="text-[10px] text-ink-faint">
          {time ??
            (stream.lastTs
              ? new Date(stream.lastTs).toLocaleTimeString()
              : "—")}
        </div>
      </div>
    </div>
  );
}
