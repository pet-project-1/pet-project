-- ============================================================
-- RLS 무한 재귀 해결
-- 문제: current_user_role() 가 public.users 를 SELECT 하는데,
--       public.users 의 RLS 정책이 다시 current_user_role() 를 호출해
--       무한 루프가 발생함. (Postgres 42P17)
-- 해결: 헬퍼 함수가 DB 조회 대신 JWT claims 의 user_metadata 에서 직접 role 을 읽도록 변경.
--       이는 Supabase 권장 패턴이며, 추가 쿼리도 없어 더 빠름.
-- ============================================================

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'user_metadata' ->> 'role',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'role',
    'manager'   -- JWT 없거나 메타데이터 비었으면 가장 제한적인 역할로 fallback
  )::public.user_role;
$$;

create or replace function public.current_user_shelter()
returns uuid
language sql
stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'user_metadata' ->> 'shelter_id',
    ''
  )::uuid;
$$;

-- users 테이블의 admin 정책도 helper 호출이지만, 이제는 JWT 만 보므로 안전.
-- 추가로 anon 사용자에게는 절대 노출되지 않도록 명시적으로 인증 체크 강화.
drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users
  for all
  using (auth.role() = 'authenticated' and public.current_user_role() = 'admin')
  with check (auth.role() = 'authenticated' and public.current_user_role() = 'admin');
