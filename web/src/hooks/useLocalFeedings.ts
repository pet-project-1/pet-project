// 로컬(클라이언트) 급식 로그 — Pi/DB 와 무관하게 "급식 시작" 동작을 기록.
// 실시간 모니터링의 급식 로그와 급식 일지가 공통으로 읽어, 버튼을 누르면 바로
// 항목이 추가되고 지정 시간이 지나면 자동으로 '완료(먹음)' 로 전환된다.
// localStorage 에 저장 + 커스텀 이벤트로 같은 탭 내 컴포넌트 동기화.
import { useEffect, useState } from "react";
import type { FeedingRecord } from "@/types";

const KEY = "pawfeeder.local-feedings.v1";
const EVT = "pawfeeder:local-feedings";
const MAX_KEEP = 200;

type LocalFeeding = FeedingRecord & { ends_at: number };

function readRaw(): LocalFeeding[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalFeeding[]) : [];
  } catch {
    return [];
  }
}

function writeRaw(list: LocalFeeding[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_KEEP)));
  window.dispatchEvent(new Event(EVT));
}

// 종료 시각이 지난 진행중(pending) 기록을 완료(먹음)로 전환.
function finalize(list: LocalFeeding[]): LocalFeeding[] {
  const now = Date.now();
  return list.map((r) =>
    r.status === "pending" && now >= r.ends_at
      ? {
          ...r,
          status: "completed" as const,
          consumed_g: r.dispensed_g, // 무게센서 없음 — 배급량 전부 먹은 것으로 가정
          dispensed_at: new Date(r.ends_at).toISOString(),
        }
      : r
  );
}

export function addLocalFeeding(entry: {
  dog_id: string;
  dog_name: string;
  breed_name_ko?: string;
  device_name: string;
  dispensed_g: number;
  duration_sec: number;
}) {
  const now = Date.now();
  const rec: LocalFeeding = {
    id: `local-${now}`,
    dog_id: entry.dog_id,
    dog_name: entry.dog_name,
    breed_name_ko: entry.breed_name_ko,
    device_id: "",
    device_name: entry.device_name,
    scheduled_at: new Date(now).toISOString(),
    dispensed_g: entry.dispensed_g,
    consumed_g: 0,
    status: "pending", // 진행중 — duration 경과 시 finalize 가 completed 로
    ends_at: now + entry.duration_sec * 1000,
  };
  writeRaw([rec, ...readRaw()]);
}

// 모니터링/이력 공통 훅 — 1초마다 갱신하며 종료된 기록을 먹음으로 전환해 반환.
export function useLocalFeedings(): FeedingRecord[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    const id = setInterval(() => {
      const cur = readRaw();
      const next = finalize(cur);
      // 종료 전환이 생기면 localStorage 에도 반영(다른 페이지/탭 동기화), 아니면 tick.
      if (JSON.stringify(next) !== JSON.stringify(cur)) writeRaw(next);
      else setTick((n) => n + 1);
    }, 1000);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
      clearInterval(id);
    };
  }, []);
  return finalize(readRaw());
}
