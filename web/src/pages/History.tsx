import { useMemo, useState } from "react";
import { format, startOfDay, startOfWeek, startOfMonth, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useDogsQuery, useFeedingsQuery } from "@/hooks/queries";
import type { Dog, FeedingRecord } from "@/types";

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

type DogDay = {
  dog: Dog;
  consumed: number;
  dispensed: number;
  count: number;
  ate: boolean; // consumed_g > 0
};

type DayEntry = {
  dayKey: string;
  date: Date;
  dispenseCount: number; // 그날 배급된 기록 수
  ateCount: number;
  perDog: DogDay[];
};

export default function History() {
  const [range, setRange] = useState<RangeKey>("week");
  const { data: feedings = [], isLoading } = useFeedingsQuery();
  const { data: dogs = [] } = useDogsQuery();

  const activeDogs = useMemo(
    () => dogs.filter((d) => d.status === "active"),
    [dogs]
  );

  // 기간 내 급식 기록을 날짜별로 묶고, 각 날짜마다 활성 개체 전부의 섭취 여부를 집계.
  const days: DayEntry[] = useMemo(() => {
    const [from, to] = rangeBounds(range);
    const inRange = feedings.filter((f) => {
      const t = new Date(f.scheduled_at).getTime();
      return t >= from && t <= to;
    });

    const byDay = new Map<string, FeedingRecord[]>();
    for (const f of inRange) {
      const key = format(new Date(f.scheduled_at), "yyyy-MM-dd");
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(f);
    }

    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // 최신 날짜 먼저
      .map(([dayKey, recs]) => {
        const perDog: DogDay[] = activeDogs
          .map((dog) => {
            const dr = recs.filter((r) => r.dog_id === dog.id);
            const consumed = dr.reduce((s, r) => s + r.consumed_g, 0);
            const dispensed = dr.reduce((s, r) => s + r.dispensed_g, 0);
            return { dog, consumed, dispensed, count: dr.length, ate: consumed > 0 };
          })
          // 안 먹은 개체를 위로 — 점검이 쉽도록
          .sort((a, b) => {
            if (a.ate !== b.ate) return a.ate ? 1 : -1;
            return a.dog.name.localeCompare(b.dog.name, "ko");
          });
        return {
          dayKey,
          date: new Date(dayKey),
          dispenseCount: recs.filter((r) => r.dispensed_g > 0).length,
          ateCount: perDog.filter((p) => p.ate).length,
          perDog,
        };
      });
  }, [feedings, activeDogs, range]);

  return (
    <>
      <PageHeader title="급식 일지" subtitle="날짜별 개체 급식 기록" />

      <div className="mb-4 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
              range === r.key
                ? "border-brand-dark bg-brand/15 text-brand-dark"
                : "border-ink-strong bg-white text-ink-body hover:bg-surface"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-ink-faint">
          <Loader2 className="mr-2 animate-spin" size={16} /> 로딩 중…
        </div>
      ) : days.length === 0 ? (
        <div className="card p-5 py-10 text-center text-[12px] text-ink-mute">
          해당 기간의 급식 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <div key={day.dayKey} className="card p-5">
              <div className="mb-3 flex items-center justify-between border-b border-ink-line pb-3">
                <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
                  <span className="h-2 w-2 rounded-full bg-brand-dark" />
                  {format(day.date, "M월 d일 (EEE)", { locale: ko })}
                </div>
                <div className="flex items-center gap-3 text-[12px] text-ink-mute">
                  <span>
                    배급 <b className="text-ink-body">{day.dispenseCount}</b>회
                  </span>
                  <span>
                    섭취 <b className="text-brand-dark">{day.ateCount}</b>/
                    {day.perDog.length}마리
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {day.perDog.map((p) => (
                  <div
                    key={p.dog.id}
                    className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-avatar text-[14px]">
                      🐶
                    </div>
                    <div className="w-32 shrink-0">
                      <div className="text-[12px] font-bold text-ink-body">
                        {p.dog.name}
                      </div>
                      <div className="truncate text-[10px] text-ink-faint">
                        {p.dog.breed_name_ko}
                      </div>
                    </div>
                    <span
                      className={`pill shrink-0 ${
                        p.ate
                          ? "bg-brand/20 text-brand-dark"
                          : "bg-accent-danger/15 text-accent-danger"
                      }`}
                    >
                      {p.ate ? "먹음" : "안먹음"}
                    </span>
                    <div className="flex-1 text-right text-[11px] text-ink-mute">
                      {p.count === 0 ? (
                        <span className="text-ink-faint">급식 기록 없음</span>
                      ) : (
                        <>
                          섭취 <b className="text-ink-body">{p.consumed}g</b>
                          {` / 배급 ${p.dispensed}g`}
                          {p.count > 1 && (
                            <span className="text-ink-faint"> · {p.count}회</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
