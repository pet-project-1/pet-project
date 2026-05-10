-- ============================================================
-- 행 단위 보안 (Row Level Security) 정책
-- 시스템구조설계 §3 Integrity Rules:
--   - dogs: 일반관리자=자신의 shelter_id 행만 / 수의사=배정된 개체만
--   - vet_recommendations: 수의사 본인(auth.uid()=vet_id)만 INSERT/UPDATE
--   - 관리자(admin)는 모든 행 접근 가능
-- ============================================================

-- 모든 테이블 RLS 활성화
alter table public.users                enable row level security;
alter table public.breeds               enable row level security;
alter table public.devices              enable row level security;
alter table public.dogs                 enable row level security;
alter table public.feeding_records      enable row level security;
alter table public.vet_recommendations  enable row level security;
alter table public.alerts               enable row level security;

-- ----------------------------------------------------------------
-- users — 본인 행만 조회·수정 가능. 관리자(admin)는 전체.
-- ----------------------------------------------------------------
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select using (
    id = auth.uid()
    or public.current_user_role() = 'admin'
  );

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ----------------------------------------------------------------
-- breeds — 마스터 데이터. 인증된 사용자 모두 조회. admin만 변경.
-- ----------------------------------------------------------------
drop policy if exists breeds_authenticated_read on public.breeds;
create policy breeds_authenticated_read on public.breeds
  for select using (auth.role() = 'authenticated');

drop policy if exists breeds_admin_write on public.breeds;
create policy breeds_admin_write on public.breeds
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ----------------------------------------------------------------
-- devices — admin/manager는 자신의 보호소만, 수의사는 조회만
-- ----------------------------------------------------------------
drop policy if exists devices_shelter_select on public.devices;
create policy devices_shelter_select on public.devices
  for select using (
    public.current_user_role() = 'admin'
    or shelter_id is null
    or shelter_id = public.current_user_shelter()
  );

drop policy if exists devices_admin_write on public.devices;
create policy devices_admin_write on public.devices
  for all using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

-- ----------------------------------------------------------------
-- dogs — 보호소 단위 격리. 수의사는 처방을 등록한 개체만 조회.
-- ----------------------------------------------------------------
drop policy if exists dogs_select on public.dogs;
create policy dogs_select on public.dogs
  for select using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'manager'
        and (shelter_id is null or shelter_id = public.current_user_shelter()))
    or (public.current_user_role() = 'vet'
        and exists (
          select 1 from public.vet_recommendations vr
          where vr.dog_id = dogs.id and vr.vet_id = auth.uid()
        ))
  );

drop policy if exists dogs_manager_write on public.dogs;
create policy dogs_manager_write on public.dogs
  for all using (
    public.current_user_role() in ('admin', 'manager')
    and (shelter_id is null or shelter_id = public.current_user_shelter()
         or public.current_user_role() = 'admin')
  )
  with check (
    public.current_user_role() in ('admin', 'manager')
  );

-- ----------------------------------------------------------------
-- feeding_records — 본인 보호소 개체의 이력만. 엣지 디바이스는 service_role 키로 우회.
-- ----------------------------------------------------------------
drop policy if exists feeding_select on public.feeding_records;
create policy feeding_select on public.feeding_records
  for select using (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.dogs d
      where d.id = feeding_records.dog_id
        and (
          (public.current_user_role() = 'manager'
            and (d.shelter_id is null or d.shelter_id = public.current_user_shelter()))
          or (public.current_user_role() = 'vet'
            and exists (
              select 1 from public.vet_recommendations vr
              where vr.dog_id = d.id and vr.vet_id = auth.uid()
            ))
        )
    )
  );

-- 사용자(프론트엔드)가 직접 INSERT 할 일은 없음. 라즈베리파이가 service_role 키로 INSERT.
-- 관리자는 수동 보정용 INSERT/UPDATE 허용.
drop policy if exists feeding_admin_write on public.feeding_records;
create policy feeding_admin_write on public.feeding_records
  for all using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

-- ----------------------------------------------------------------
-- vet_recommendations — 수의사 본인(auth.uid()=vet_id) 행만 INSERT/UPDATE.
-- 보호소 관리자(admin/manager)는 본인 보호소 개체의 처방을 조회 가능.
-- ----------------------------------------------------------------
drop policy if exists vet_rec_select on public.vet_recommendations;
create policy vet_rec_select on public.vet_recommendations
  for select using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'vet' and vet_id = auth.uid())
    or (public.current_user_role() = 'manager'
        and exists (
          select 1 from public.dogs d
          where d.id = vet_recommendations.dog_id
            and (d.shelter_id is null or d.shelter_id = public.current_user_shelter())
        ))
  );

drop policy if exists vet_rec_insert on public.vet_recommendations;
create policy vet_rec_insert on public.vet_recommendations
  for insert with check (
    public.current_user_role() = 'vet'
    and vet_id = auth.uid()
  );

drop policy if exists vet_rec_update on public.vet_recommendations;
create policy vet_rec_update on public.vet_recommendations
  for update using (
    public.current_user_role() = 'vet' and vet_id = auth.uid()
  ) with check (
    public.current_user_role() = 'vet' and vet_id = auth.uid()
  );

drop policy if exists vet_rec_delete on public.vet_recommendations;
create policy vet_rec_delete on public.vet_recommendations
  for delete using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'vet' and vet_id = auth.uid())
  );

-- ----------------------------------------------------------------
-- alerts — 본인 보호소 개체의 알림 + 시스템 알림(dog_id IS NULL).
-- 관리자/매니저는 resolved_at 갱신 가능. 디바이스가 service_role로 INSERT.
-- ----------------------------------------------------------------
drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
  for select using (
    public.current_user_role() = 'admin'
    or dog_id is null   -- 시스템 알림은 모든 인증 사용자에게 노출
    or exists (
      select 1 from public.dogs d
      where d.id = alerts.dog_id
        and (d.shelter_id is null or d.shelter_id = public.current_user_shelter())
    )
  );

drop policy if exists alerts_resolve on public.alerts;
create policy alerts_resolve on public.alerts
  for update using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));
