-- ============================================================
-- Realtime 구독 — 시스템구조설계 흐름 2 (US-15)
--   "PostgreSQL WAL → 실시간 모듈: 논리 복제 변경 이벤트 발행"
-- supabase_realtime publication에 변경 알림이 필요한 테이블 추가.
-- ============================================================

-- publication이 없으면 생성 (Supabase 호스팅에서는 이미 존재)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.feeding_records;
alter publication supabase_realtime add table public.alerts;
alter publication supabase_realtime add table public.dogs;
alter publication supabase_realtime add table public.devices;

-- 이미 추가된 테이블에 대한 add는 에러를 발생시키므로
-- 서버에서 실행할 때는 다음 형식으로도 가능:
--   alter publication supabase_realtime add table if not exists public.feeding_records;
-- (Supabase는 IF NOT EXISTS를 지원)
