import { useMemo, useState } from "react";
import { format, startOfDay, startOfWeek, startOfMonth, subDays } from "date-fns";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import { useFeedingsQuery } from "@/hooks/queries";

const RANGES = [
  { key: "today", label: "오늘" },
  { key: "yesterday", label: "어제" },
  { key: "week", label: "이번 주" },
  { key: "month", label: "이번 달" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

// 선택한 기간의 [시작, 끝) 경계를 반환.
function rangeBounds(key: RangeKey): [number, number] {
  const now = new Date();
  switch (key) {
    case "today":
      return [startOfDay(now).getTime(), now.getTime()];
    case "yesterday": {
      const start = startOfDay(subDays(now, 1));
      return [start.getTime(), startOfDay(now).getTime()];
    }
    case "week":
      return [startOfWeek(now, { weekStartsOn: 1 }).getTime(), now.getTime()];
    case "month":
      return [startOfMonth(now).getTime(), now.getTime()];
  }
}

export default function History() {
  const [range, setRange] = useState<RangeKey>("today");
  const { data: feedings = [], isLoading } = useFeedingsQuery();

  const rows = useMemo(() => {
    const [from, to] = rangeBounds(range);
    return feedings.filter((f) => {
      const t = new Date(f.scheduled_at).getTime();
      return t >= from && t <= to;
    });
  }, [feedings, range]);

  return (
    <>
      <PageHeader title="급식 이력" subtitle="전체 급식 기록 조회" />

      <div className="mb-4 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
              range === r.key
                ? "border-brand bg-brand/10 text-brand"
                : "border-ink-strong bg-white text-ink-body hover:bg-surface"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="card p-5">
        <table>
          <thead>
            <tr className="border-b border-ink-line">
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">시간</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">개체</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">품종</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">급식기</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">권장량</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">섭취량</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">섭취율</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-ink-faint">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const pct =
                f.dispensed_g > 0 ? Math.round((f.consumed_g / f.dispensed_g) * 100) : 0;
              return (
                <tr key={f.id} className="border-b border-ink-softline">
                  <td className="px-3 py-3 text-[12px] text-ink-faint">
                    {format(new Date(f.scheduled_at), "MM.dd HH:mm")}
                  </td>
                  <td className="px-3 py-3 text-[12px] font-bold text-ink-body">{f.dog_name}</td>
                  <td className="px-3 py-3 text-[12px] text-ink-mute">{f.breed_name_ko}</td>
                  <td className="px-3 py-3 text-[12px] text-ink-mute">{f.device_name}</td>
                  <td className="px-3 py-3 text-[12px] text-ink-mute">
                    {f.dispensed_g > 0 ? `${f.dispensed_g}g` : "-"}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-ink-mute">
                    {f.consumed_g > 0 ? `${f.consumed_g}g` : "-"}
                  </td>
                  <td className="px-3 py-3">
                    {f.dispensed_g > 0 ? (
                      <div className="h-1.5 w-[100px] overflow-hidden rounded-full bg-ink-line">
                        <div
                          className={`h-full rounded-full ${
                            pct < 60 ? "bg-accent-warn" : "bg-brand"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : (
                      <span className="text-[12px] text-ink-faint">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={f.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-ink-faint">
            <Loader2 className="mr-2 animate-spin" size={16} /> 로딩 중…
          </div>
        ) : (
          rows.length === 0 && (
            <div className="py-10 text-center text-[12px] text-ink-mute">
              해당 기간의 급식 기록이 없습니다.
            </div>
          )
        )}
      </div>
    </>
  );
}
