-- breeds 마스터(품종 참조 데이터)를 비로그인(anon) 사용자도 조회 가능하도록 공개.
-- 이유: 개체 등록 폼(특히 /dogs?registerPendingTid=… 딥링크)이 세션 없이 열리면
--       기존 정책 breeds_authenticated_read (auth.role() = 'authenticated') 때문에
--       품종 드롭다운이 빈 상태로 보였다. breeds 는 민감하지 않은 마스터 데이터라 공개 읽기 허용.
-- 변경(admin only) 정책 breeds_admin_write 는 그대로 유지.

drop policy if exists breeds_authenticated_read on public.breeds;
drop policy if exists breeds_public_read on public.breeds;

create policy breeds_public_read on public.breeds
  for select using (true);
