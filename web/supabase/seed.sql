-- ============================================================
-- 시드 데이터 — 로컬 개발 / 데모용
-- 실 운영에서는 실행하지 않음.
-- ============================================================

-- 1) breeds 마스터 (YOLOv8 클래스 매핑)
-- daily_g_per_kg = 체중 1kg당 1일 권장 급여량 (소형견 ≈ 20~25g/kg)
insert into public.breeds (code, name_ko, name_en, daily_g_per_kg) values
  ('MALTESE',     '몰티즈',       'Maltese',          22),
  ('POODLE',      '푸들',         'Poodle',           20),
  ('POMERANIAN',  '포메라니안',   'Pomeranian',       24),
  ('BICHON',      '비숑프리제',   'Bichon Frise',     21),
  ('SHIHTZU',     '시츄',         'Shih Tzu',         18),
  ('YORKIE',      '요크셔테리어', 'Yorkshire Terrier',23),
  ('CHIHUAHUA',   '치와와',       'Chihuahua',        25),
  ('BEAGLE',      '비글',         'Beagle',           17),
  ('JINDO',       '진돗개',       'Jindo',            16),
  ('GOLDEN',      '골든리트리버', 'Golden Retriever', 14),
  ('LABRADOR',    '래브라도',     'Labrador',         15),
  ('MIXED',       '믹스견',       'Mixed',            20)
on conflict (code) do update
   set name_ko = excluded.name_ko,
       name_en = excluded.name_en,
       daily_g_per_kg = excluded.daily_g_per_kg;

-- 2) 디바이스 (라즈베리파이 2대)
insert into public.devices (id, name, location, status, food_remaining_pct)
values
  ('11111111-1111-1111-1111-111111111111', '급식기 1번', '메인 견사 A', 'online', 78),
  ('22222222-2222-2222-2222-222222222222', '급식기 2번', '메인 견사 B', 'online', 45)
on conflict (id) do nothing;

-- 3) 데모용 개체 7마리
insert into public.dogs (id, name, breed_code, weight_kg, status, food_type, recommended_g, vet_note)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '1번 개체', 'MALTESE',    3.2, 'active', '소형견용 일반사료', 60, '알레르기 없음. 체중 유지 중.'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '2번 개체', 'POODLE',     5.1, 'active', '소형견용 일반사료', 75, null),
  ('aaaaaaaa-0000-0000-0000-000000000003', '3번 개체', 'POMERANIAN', 2.8, 'active', '소형견용 일반사료', 50, null),
  ('aaaaaaaa-0000-0000-0000-000000000004', '4번 개체', 'BICHON',     4.5, 'active', '소형견용 일반사료', 55, null),
  ('aaaaaaaa-0000-0000-0000-000000000005', '5번 개체', 'SHIHTZU',    5.8, 'active', '중형견용 일반사료', 55, null),
  ('aaaaaaaa-0000-0000-0000-000000000006', '6번 개체', 'MIXED',      7.2, 'active', '중형견용 일반사료', 70, null),
  ('aaaaaaaa-0000-0000-0000-000000000007', '7번 개체', 'SHIHTZU',    6.1, 'active', '처방식',           60, '비만 관리 중. 권장량 5g 감량.')
on conflict (id) do nothing;

-- 4) 데모 급식 이력 (오늘)
insert into public.feeding_records (dog_id, device_id, scheduled_at, dispensed_at, dispensed_g, consumed_g, status, confidence)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   now() - interval '30 minutes', now() - interval '29 minutes', 60, 60, 'completed', 0.942),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   now() - interval '60 minutes', now() - interval '59 minutes', 50, 48, 'completed', 0.913),
  ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
   now() - interval '90 minutes', now() - interval '89 minutes', 55, 55, 'completed', 0.881),
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   now() - interval '45 minutes', now() - interval '44 minutes', 55, 45, 'incomplete', 0.901),
  ('aaaaaaaa-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222',
   now() - interval '120 minutes', now() - interval '119 minutes', 60, 38, 'incomplete', 0.872),
  -- 미등록 개체 차단 (dog_id=null)
  (null, '22222222-2222-2222-2222-222222222222',
   now() - interval '32 minutes', null, 0, 0, 'blocked', null);

-- 5) 데모 알림
insert into public.alerts (dog_id, type, title, message, severity, resolved_at)
values
  (null, 'unregistered_access', '미등록 개체 접근',
   '급식기 2번에 미등록 개체가 접근하여 배식이 자동 중단되었습니다.', 'danger', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'missed_feeding', '2번 개체 미섭취',
   '2번 개체(푸들)가 오전 급식 시간에 섭취하지 않았습니다.', 'warn', null),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'abnormal_intake', '7번 섭취량 감소',
   '7번 개체(시츄)의 최근 3일 평균 섭취량이 30% 감소했습니다.', 'warn', null),
  (null, 'system', '시스템 업데이트',
   'YOLO v8 모델이 최신 버전으로 업데이트되었습니다.', 'info', now() - interval '1 day');

-- 참고:
-- 데모 사용자 계정은 Supabase Studio > Authentication > Users 에서 직접 생성하거나,
-- supabase auth admin API로 생성한 후 raw_user_meta_data에
--   { "role": "admin", "display_name": "박관리자" }
-- 형태로 메타를 넣으면 트리거가 자동으로 public.users에 행을 만듭니다.
