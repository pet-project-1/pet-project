// US-15 AC#3 — Supabase Realtime 으로 실시간 데이터 반영
//
// 시스템구조설계 §2 흐름2:
//   PostgreSQL WAL → 실시간 모듈: 논리 복제 변경 이벤트 발행
//   실시간 모듈 → 브라우저: 웹소켓으로 INSERT 페이로드 푸시
//   브라우저: TanStack Query 캐시 무효화 → UI 자동 리렌더 (별도 새로고침 불필요)
//
// 사용처: <Layout> 안에서 한 번 호출. 인증된 모든 페이지에서 자동 활성화.
// Supabase 가 비활성(.env 미설정)이면 no-op.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isSupabaseEnabled, supabase } from "@/lib/supabase";

const TABLES = ["feeding_records", "alerts", "dogs", "devices"] as const;

export function useRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isSupabaseEnabled || !supabase) return;

    const channels = TABLES.map((table) =>
      supabase!
        .channel(`rt-${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            qc.invalidateQueries({ queryKey: [table] });
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((ch) => supabase!.removeChannel(ch));
    };
  }, [qc]);
}
