-- ============================================================
-- RLS 상호 재귀 차단
-- 문제: dogs_select 의 vet 체크가 vet_recommendations 를 EXISTS 로 조회 →
--       vet_rec_select 정책이 다시 dogs 를 EXISTS 로 조회 → 42P17 무한 재귀.
-- 해결: 정책 간 직접 SELECT 대신 SECURITY DEFINER 헬퍼 함수로 우회.
--       postgres 롤(BYPASSRLS) 권한으로 실행되므로 정책 평가가 일어나지 않음.
-- ============================================================

create or replace function public.is_vet_of_dog(p_dog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vet_recommendations
    where dog_id = p_dog_id and vet_id = auth.uid()
  );
$$;

create or replace function public.dog_in_my_shelter(p_dog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dogs d
    where d.id = p_dog_id
      and (d.shelter_id is null or d.shelter_id = public.current_user_shelter())
  );
$$;

-- dogs ─ 헬퍼로 단순화
drop policy if exists dogs_select on public.dogs;
create policy dogs_select on public.dogs
  for select using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'manager'
        and (shelter_id is null or shelter_id = public.current_user_shelter()))
    or (public.current_user_role() = 'vet' and public.is_vet_of_dog(id))
  );

-- vet_recommendations ─ manager 분기를 헬퍼로
drop policy if exists vet_rec_select on public.vet_recommendations;
create policy vet_rec_select on public.vet_recommendations
  for select using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'vet' and vet_id = auth.uid())
    or (public.current_user_role() = 'manager' and public.dog_in_my_shelter(dog_id))
  );

-- feeding_records ─ 동일하게 헬퍼로
drop policy if exists feeding_select on public.feeding_records;
create policy feeding_select on public.feeding_records
  for select using (
    public.current_user_role() = 'admin'
    or (
      public.current_user_role() = 'manager'
      and dog_id is not null
      and public.dog_in_my_shelter(dog_id)
    )
    or (
      public.current_user_role() = 'manager' and dog_id is null   -- 미등록 개체 차단 로그
    )
    or (
      public.current_user_role() = 'vet'
      and dog_id is not null
      and public.is_vet_of_dog(dog_id)
    )
  );

-- alerts ─ 동일
drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
  for select using (
    public.current_user_role() = 'admin'
    or dog_id is null
    or (public.current_user_role() = 'manager' and public.dog_in_my_shelter(dog_id))
    or (public.current_user_role() = 'vet' and public.is_vet_of_dog(dog_id))
  );
