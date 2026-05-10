# Supabase Migrations — 품종 맞춤형 자동 배급 시스템

시스템구조설계 §3 (ERD) + §3 Integrity Rules + §3 API 설계 매핑.

## 파일 구성

| 파일 | 역할 |
|---|---|
| `migrations/20260510000001_init_schema.sql` | 7개 테이블 + ENUM + 인덱스 + UNIQUE/CHECK 제약 |
| `migrations/20260510000002_functions_triggers.sql` | auth 동기화, US-06 삭제 가드, identify_dog RPC, active 처방 뷰 |
| `migrations/20260510000003_rls_policies.sql` | RLS 정책 (admin/manager/vet 역할별) |
| `migrations/20260510000004_realtime.sql` | Realtime publication (feeding_records, alerts, dogs, devices) |
| `seed.sql` | 데모용 시드 (breeds 마스터 + 개체 7마리 + 디바이스 + 급식 이력 + 알림) |

## 적용 방법

### 옵션 A — Supabase 호스팅 프로젝트 (운영)
```bash
# Supabase CLI 설치 (최초 1회)
npm install -g supabase

# 프로젝트 연결
cd /root/si/pet-project/web
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

# 마이그레이션 푸시
supabase db push

# (선택) 시드
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

### 옵션 B — 로컬 Docker (개발)
```bash
# 도커 데몬 필요
supabase start             # PostgreSQL + Studio + Realtime + Storage 실행
supabase db reset          # 마이그레이션 + seed.sql 모두 실행
# Studio: http://localhost:54323
# DB:    postgresql://postgres:postgres@localhost:54322/postgres
# API:   http://localhost:54321
```

### 옵션 C — psql로 직접 실행
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260510000001_init_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/20260510000002_functions_triggers.sql
psql "$DATABASE_URL" -f supabase/migrations/20260510000003_rls_policies.sql
psql "$DATABASE_URL" -f supabase/migrations/20260510000004_realtime.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

## ERD 요약

```
breeds (1) ─< dogs (N)
                 │
                 ├──< feeding_records (N) >── devices (1)
                 ├──< vet_recommendations (N) >── users[role=vet] (1)
                 └──< alerts (N)
```

## 주요 제약 (시스템구조설계 §3 매핑)

| 규칙 | 구현 |
|---|---|
| `dogs.id` UNIQUE | PRIMARY KEY |
| `breeds.code` PK ↔ YOLO 클래스 1:1 | PRIMARY KEY |
| 동일 디바이스/시각/개체 중복 배식 방지 | `feeding_records_unique_idx` (dog_id IS NOT NULL 부분 인덱스) |
| `dogs.weight_kg > 0` | CHECK |
| `feeding_records.dispensed_g >= 0` | CHECK |
| US-06 삭제 가드 (이력 있으면 차단) | `prevent_dog_hard_delete()` BEFORE DELETE 트리거 + `dog_id ON DELETE RESTRICT` |
| 활성 처방 (가장 최근 created_at) | `active_vet_recommendations` 뷰 |
| 동일 보호소 내 활성 개체 이름 중복 방지 (US-03 AC) | 부분 UNIQUE 인덱스 (status<>'archived') |

## API 매핑 (자동 생성)

PostgREST가 모든 테이블에 대해 REST API를 자동 생성합니다.

| US | 메소드 | 엔드포인트 |
|---|---|---|
| US-01 | POST | `/auth/v1/token?grant_type=password` |
| US-04 | GET  | `/rest/v1/dogs?select=*` |
| US-03 | POST | `/rest/v1/dogs` |
| US-05 | PATCH | `/rest/v1/dogs?id=eq.{id}` |
| US-06 | DELETE | `/rest/v1/dogs?id=eq.{id}` (이력 있으면 트리거가 차단) |
| US-13/17 | POST | `/rest/v1/feeding_records` (라즈베리파이, service_role 키) |
| US-15/16 | GET | `/rest/v1/feeding_records?dog_id=eq.{id}&order=scheduled_at.desc` |
| US-11 | POST | `/rest/v1/rpc/identify_dog` |
| US-18 | POST | `/rest/v1/vet_recommendations` |
| US-12 보강 | GET | `/rest/v1/active_vet_recommendations?dog_id=eq.{id}` |
| US-19/20 | GET | `/rest/v1/alerts?resolved_at=is.null` |
| US-15 | WS | `/realtime/v1/websocket?topic=feeding_records` |

## 데모 사용자 만들기

마이그레이션 후 Supabase Studio → Authentication → Users → "Add user" 로 생성하고
**Raw user metadata**에 다음을 넣으면 트리거가 자동으로 `public.users`에 매핑합니다.

```json
{ "role": "admin", "display_name": "박관리자" }
```

```json
{ "role": "vet", "display_name": "김수의사" }
```
