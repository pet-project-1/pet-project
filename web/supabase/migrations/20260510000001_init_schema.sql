-- ============================================================
-- 품종 맞춤형 자동 배급 시스템 — 초기 스키마
-- 시스템구조설계 §3 데이터 설계 (ERD)
--   테이블: users, breeds, dogs, devices, feeding_records,
--          vet_recommendations, alerts (총 7개)
-- 작성: 박상우 · 2026-05-10
-- ============================================================

-- 0) 확장
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";     -- OSNet 임베딩 vector(512)

-- 1) ENUM 타입 정의
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'vet', 'manager');
  end if;
  if not exists (select 1 from pg_type where typname = 'dog_status') then
    create type public.dog_status as enum ('active', 'pending', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'feeding_status') then
    create type public.feeding_status as enum ('completed', 'pending', 'incomplete', 'blocked');
  end if;
  if not exists (select 1 from pg_type where typname = 'alert_severity') then
    create type public.alert_severity as enum ('danger', 'warn', 'info');
  end if;
  if not exists (select 1 from pg_type where typname = 'alert_type') then
    create type public.alert_type as enum (
      'missed_feeding', 'abnormal_intake', 'unregistered_access',
      'system', 'vet_change', 'new_dog'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'device_status') then
    create type public.device_status as enum ('online', 'offline');
  end if;
end $$;

-- 2) users — Supabase auth.users 확장 (1:1)
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  role          public.user_role not null default 'admin',
  display_name  text not null,
  shelter_id    uuid,                          -- 멀티 보호소 대비. 단일 보호소면 null 허용
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists users_role_idx        on public.users(role);
create index if not exists users_shelter_id_idx  on public.users(shelter_id);

-- 3) breeds — YOLOv8 클래스 ↔ 품종 마스터
create table if not exists public.breeds (
  code            text primary key,            -- 예: 'BEAGLE'
  name_ko         text not null,
  name_en         text not null,
  daily_g_per_kg  integer not null check (daily_g_per_kg > 0),
  created_at      timestamptz not null default now()
);

-- 4) devices — 엣지 디바이스(라즈베리파이) 등록
create table if not exists public.devices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  location     text,
  mac_address  text unique,
  status       public.device_status not null default 'offline',
  food_remaining_pct  integer not null default 100 check (food_remaining_pct between 0 and 100),
  last_seen    timestamptz,
  shelter_id   uuid,
  created_at   timestamptz not null default now()
);

create index if not exists devices_status_idx     on public.devices(status);
create index if not exists devices_shelter_id_idx on public.devices(shelter_id);

-- 5) dogs — 개체 마스터
create table if not exists public.dogs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  breed_code      text not null references public.breeds(code) on update cascade,
  weight_kg       numeric(5,2) not null check (weight_kg > 0),
  photo_url       text,
  embedding       vector(512),                  -- OSNet 임베딩 (Sprint 2)
  shelter_id      uuid,
  status          public.dog_status not null default 'active',
  food_type       text,
  recommended_g   integer check (recommended_g is null or recommended_g >= 0),
  vet_note        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 동일 보호소 내 활성 개체 이름 중복 방지 (US-03 AC: 중복 등록 불가)
create unique index if not exists dogs_unique_active_name_idx
  on public.dogs (coalesce(shelter_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where status <> 'archived';

create index if not exists dogs_breed_code_idx  on public.dogs(breed_code);
create index if not exists dogs_status_idx      on public.dogs(status);
create index if not exists dogs_shelter_id_idx  on public.dogs(shelter_id);
create index if not exists dogs_created_at_idx  on public.dogs(created_at desc);

-- 6) feeding_records — 급식 이력 (실시간 구독 대상)
create table if not exists public.feeding_records (
  id            uuid primary key default gen_random_uuid(),
  dog_id        uuid references public.dogs(id) on delete restrict,    -- US-06: 이력 있으면 삭제 차단
  device_id     uuid not null references public.devices(id) on delete restrict,
  scheduled_at  timestamptz not null,
  dispensed_at  timestamptz,
  dispensed_g   numeric(6,2) not null default 0 check (dispensed_g >= 0),
  consumed_g    numeric(6,2) not null default 0 check (consumed_g >= 0),
  status        public.feeding_status not null default 'pending',
  confidence    numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at    timestamptz not null default now()
);

-- 동일 디바이스에서 동일 시각에 동일 개체 중복 배식 방지
-- (NULL dog_id == 미등록 개체이므로 NULL은 unique 제외하지 않음)
create unique index if not exists feeding_records_unique_idx
  on public.feeding_records(device_id, scheduled_at, dog_id)
  where dog_id is not null;

create index if not exists feeding_records_dog_id_idx        on public.feeding_records(dog_id);
create index if not exists feeding_records_device_id_idx     on public.feeding_records(device_id);
create index if not exists feeding_records_scheduled_at_idx  on public.feeding_records(scheduled_at desc);
create index if not exists feeding_records_status_idx        on public.feeding_records(status);

-- 7) vet_recommendations — 수의사 처방
create table if not exists public.vet_recommendations (
  id                 uuid primary key default gen_random_uuid(),
  dog_id             uuid not null references public.dogs(id) on delete cascade,
  vet_id             uuid not null references public.users(id) on delete restrict,
  food_type          text,
  daily_g            integer not null check (daily_g > 0),
  frequency_per_day  integer not null default 2 check (frequency_per_day between 1 and 6),
  note               text,
  created_at         timestamptz not null default now()
);

create index if not exists vet_rec_dog_id_idx      on public.vet_recommendations(dog_id);
create index if not exists vet_rec_vet_id_idx      on public.vet_recommendations(vet_id);
create index if not exists vet_rec_dog_created_idx on public.vet_recommendations(dog_id, created_at desc);

-- 8) alerts — 시스템 알림
create table if not exists public.alerts (
  id           uuid primary key default gen_random_uuid(),
  dog_id       uuid references public.dogs(id) on delete cascade,   -- NULL 허용 (시스템 알림)
  type         public.alert_type not null,
  title        text not null,
  message      text not null,
  severity     public.alert_severity not null default 'info',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists alerts_dog_id_idx        on public.alerts(dog_id);
create index if not exists alerts_unresolved_idx    on public.alerts(created_at desc) where resolved_at is null;
create index if not exists alerts_type_idx          on public.alerts(type);

-- 9) updated_at 자동 갱신 트리거 함수
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.tg_set_updated_at();

create trigger dogs_set_updated_at
  before update on public.dogs
  for each row execute function public.tg_set_updated_at();
