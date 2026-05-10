import { useMemo, useState } from "react";
import { format } from "date-fns";
import PageHeader from "@/components/PageHeader";
import { alerts } from "@/lib/mockData";
import type { AlertSeverity } from "@/types";

const filters: { key: "all" | AlertSeverity; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "danger", label: "긴급" },
  { key: "warn", label: "경고" },
  { key: "info", label: "정보" },
];

export default function Alerts() {
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("all");

  const today = useMemo(
    () =>
      alerts.filter(
        (a) =>
          !a.resolved_at &&
          (filter === "all" || a.severity === filter)
      ),
    [filter]
  );
  const past = useMemo(
    () =>
      alerts.filter(
        (a) =>
          a.resolved_at &&
          (filter === "all" || a.severity === filter)
      ),
    [filter]
  );

  return (
    <>
      <PageHeader title="알림" subtitle="시스템 알림 및 이벤트 기록" />

      <div className="mb-4 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
              filter === f.key
                ? "border-brand bg-brand/10 text-brand"
                : "border-ink-strong bg-white text-ink-body hover:bg-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <AlertColumn title="오늘" badgeTone="danger" items={today} />
        <AlertColumn title="이전" badgeTone="info" items={past} />
      </div>
    </>
  );
}

function AlertColumn({
  title,
  items,
  badgeTone,
}: {
  title: string;
  items: typeof alerts;
  badgeTone: AlertSeverity;
}) {
  const tone = {
    danger: "bg-accent-danger/15 text-accent-danger",
    warn: "bg-accent-warn/15 text-accent-warn",
    info: "bg-brand/15 text-brand",
  }[badgeTone];

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
          <span className="h-2 w-2 rounded-full bg-accent-danger" /> {title}
        </div>
        <span className={`pill ${tone}`}>{items.length}건</span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-ink-mute">
          알림이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div
              key={a.id}
              className="rounded-lg bg-surface p-3"
              style={{
                borderLeft: `3px solid ${
                  a.severity === "danger"
                    ? "#E76F51"
                    : a.severity === "warn"
                    ? "#F4A261"
                    : "#1A82E2"
                }`,
              }}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      a.severity === "danger"
                        ? "#E76F51"
                        : a.severity === "warn"
                        ? "#F4A261"
                        : "#1A82E2",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-ink-body">{a.title}</div>
                  <div className="text-[11px] text-ink-mute">{a.message}</div>
                  <div className="mt-0.5 text-[10px] text-ink-faint">
                    {format(new Date(a.created_at), "MM.dd HH:mm")}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
