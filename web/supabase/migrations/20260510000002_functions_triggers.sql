-- ============================================================
-- 함수 / 트리거 / 뷰 / RPC
-- 시스템구조설계 §3 Integrity Rules + API 설계
-- ============================================================

-- 1) auth.users → public.users 자동 생성
-- Supabase가 회원가입 시 auth.users에 행을 만들면, public.users에도 동일 ID로 동기화.
-- raw_user_meta_data에 role / display_name이 있으면 그대로 사용.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'admin'),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email,'관리자'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 2) 현재 사용자 역할 조회 헬퍼 (RLS 정책에서 사용)
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_user_shelter()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select shelter_id from public.users where id = auth.uid();
$$;

-- 3) US-06 가드: dogs 삭제 시 급식 이력이 있으면 차단
-- 인수 기준: "급식 이력이 있는 개체는 삭제 불가 또는 경고 표시"
-- → 하드 삭제 시도 시 RAISE EXCEPTION. 클라이언트에서 archive로 우회.
create or replace function public.prevent_dog_hard_delete()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.feeding_records where dog_id = old.id) then
    raise exception 'DOG_HAS_FEEDING_HISTORY: 급식 이력이 있는 개체는 삭제할 수 없습니다. status=archived 로 보관 처리하세요.'
      using errcode = 'P0001',
            hint = 'UPDATE dogs SET status = ''archived'' WHERE id = ' || old.id::text;
  end if;
  return old;
end;
$$;

drop trigger if exists dogs_prevent_hard_delete on public.dogs;
create trigger dogs_prevent_hard_delete
  before delete on public.dogs
  for each row execute function public.prevent_dog_hard_delete();

-- 4) 활성 처방 뷰 (개체별 가장 최근 created_at 처방만)
create or replace view public.active_vet_recommendations as
select distinct on (dog_id)
  id, dog_id, vet_id, food_type, daily_g, frequency_per_day, note, created_at
from public.vet_recommendations
order by dog_id, created_at desc;

comment on view public.active_vet_recommendations is
  '개체별 가장 최근 수의사 처방 (US-12 보강용)';

-- 5) RPC: identify_dog (US-11 — 임베딩 기반 개체 매칭)
-- 입력: query_embedding (vector(512)), threshold (cosine 유사도 임곗값, 기본 0.75)
-- 출력: 가장 가까운 dog_id + 유사도 (없으면 NULL)
-- 코사인 유사도 = 1 - cosine_distance, pgvector는 <=> 연산자가 cosine distance.
create or replace function public.identify_dog(
  query_embedding vector(512),
  threshold       numeric default 0.75,
  shelter_filter  uuid    default null
)
returns table (dog_id uuid, similarity numeric)
language sql
stable
security definer
set search_path = public
as $$
  select d.id as dog_id,
         (1 - (d.embedding <=> query_embedding))::numeric as similarity
  from public.dogs d
  where d.embedding is not null
    and d.status = 'active'
    and (shelter_filter is null or d.shelter_id = shelter_filter)
    and (1 - (d.embedding <=> query_embedding)) >= threshold
  order by d.embedding <=> query_embedding
  limit 1;
$$;

comment on function public.identify_dog is
  '512차원 OSNet 임베딩으로 등록 개체 매칭 (US-11). threshold 미만이면 빈 결과.';

-- 6) 디바이스 하트비트 RPC — last_seen 갱신
create or replace function public.device_heartbeat(p_device_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.devices
     set last_seen = now(),
         status    = 'online'
   where id = p_device_id;
$$;
