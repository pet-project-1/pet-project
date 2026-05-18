// feeding_records 를 개체별 일자 버킷으로 집계 — 섭취량 차트용.
import type { FeedingRecord } from "@/types";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export interface IntakePoint {
  day: string;
  consumed_g: number;
}

/** 최근 `days` 일간, 특정 개체의 일자별 섭취량 합계. dogId 가 없으면 0 으로 채운다. */
export function buildIntakeSeries(
  feedings: FeedingRecord[],
  dogId: string | null,
  days: number
): IntakePoint[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() - (days - 1 - i));
    return { time: d.getTime(), date: d, consumed_g: 0 };
  });

  if (dogId) {
    for (const f of feedings) {
      if (f.dog_id !== dogId) continue;
      const fd = new Date(f.dispensed_at ?? f.scheduled_at);
      fd.setHours(0, 0, 0, 0);
      const bucket = buckets.find((b) => b.time === fd.getTime());
      if (bucket) bucket.consumed_g += f.consumed_g;
    }
  }

  return buckets.map((b) => ({
    day: days <= 7 ? WEEKDAY[b.date.getDay()] : String(b.date.getDate()),
    consumed_g: Math.round(b.consumed_g),
  }));
}
