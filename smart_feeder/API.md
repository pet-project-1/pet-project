# Pi Feeder HTTP API 명세

라즈베리파이의 `smart_feeder/feeder_api.py` 가 노출하는 로컬 HTTP API.
미등록 개체 등록 모달, 갤러리 디버깅, 헬스체크 용도.

## Base URL & 환경변수

각 Pi 가 자체적으로 Flask 서버를 띄우므로 디바이스마다 URL 이 다르다.

| Web 측 env (`web/.env`) | Pi 측 env | 비고 |
|---|---|---|
| `VITE_FEEDER_1_DEVICE_ID` | `FEEDER_DEVICE_ID` | 두 값이 동일해야 broadcast 토픽 / alert 식별자가 맞음 |
| `VITE_FEEDER_1_API_URL` | (Pi 가 듣는 포트, 기본 `8765`) | 예: `http://192.168.0.10:8765` |
| `VITE_FEEDER_API_TOKEN` | `FEEDER_API_TOKEN` | 둘 다 비우면 인증 끔. 설정 시 모든 요청에 `Authorization` 필요 |

`deviceId → apiUrl` 매핑은 `web/src/lib/feederApi.ts` 의 `deviceIdToApiUrl()` 사용.

## 인증

`FEEDER_API_TOKEN` 이 Pi 에 설정돼 있으면, 모든 요청 (CORS preflight `OPTIONS` 제외) 에
다음 헤더가 있어야 함:

```
Authorization: Bearer <FEEDER_API_TOKEN>
```

불일치 / 누락 시 `401 {"ok": false, "error": "unauthorized"}`.

토큰이 비어있으면 인증 검사 자체를 건너뜀 (로컬 개발 / 사내 망 가정).

## CORS

모든 응답에 다음 헤더 부여 (preflight 도 동일):

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```

## 공통 응답 모양

성공: 엔드포인트마다 다름 (아래 참조).

실패: 4xx / 5xx 와 함께
```json
{"ok": false, "error": "<short message>"}
```

`/pending/<tid>/thumbnail` 만 예외 — 성공 시 `image/jpeg` raw bytes.

---

## 엔드포인트

### `GET /healthz`

헬스체크 + 간단한 런타임 상태.

**응답 200**
```json
{
  "ok": true,
  "supabase_configured": true,
  "gallery_size": 4,
  "pending_count": 1
}
```

- `supabase_configured`: Pi 가 `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` 둘 다 들고 있는지.
  `false` 면 `/register` 가 503/500 류로 실패하고, 미등록 접근 alert 도 발행 못 함.
- 가벼운 ping 용. UI 가 주기적으로 폴링해서 Pi-online 여부 표시 가능.

---

### `GET /pending`

현재 Unknown 상태의 추적 객체 목록 — 등록 모달의 후보.

**응답 200**
```json
{
  "pending": [
    {
      "track_id": 7,
      "expires_in_sec": 42,
      "has_thumbnail": true,
      "predicted_breed_code": "SHIBA_DOG"
    },
    {
      "track_id": 12,
      "expires_in_sec": 8,
      "has_thumbnail": true,
      "predicted_breed_code": null
    }
  ]
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `track_id` | int | ByteTrack 이 부여한 식별자. `POST /register` 의 body 키와 동일. alert message 의 `track_id` 와도 동일 |
| `expires_in_sec` | int | 마지막 갱신 후 남은 TTL. 카메라에 다시 잡히면 리셋. 0 이 되면 다음 cleanup 사이클에서 entry 가 사라짐 (`PENDING_TTL_SEC` 참조) |
| `has_thumbnail` | bool | `true` 면 `GET /pending/<tid>/thumbnail` 호출 가능 |
| `predicted_breed_code` | string \| null | OSNet classifier head 의 vote 기반 다수결 결과. `breeds.code` FK 와 매칭됨 (예: `SHIBA_DOG`, `MALTESE_DOG`, `PAPILLON`). vote buffer 가 비어있거나 라벨 파일 미적재면 `null` |

**호출 시점 권장**
- 등록 모달이 열릴 때 1회 (썸네일 / 예측 품종 prefill).
- 백그라운드 폴링은 권장 안 함 — 알람이 그 역할.

---

### `GET /pending/<int:tid>/thumbnail`

해당 pending 의 마지막 crop. JPEG (200px 단변 / quality 80).

**응답 200** — `Content-Type: image/jpeg` 의 raw bytes.

**응답 404** — `{"ok": false, "error": "not found"}` (TTL 만료 / 매칭 전이 / 애초에 없음).

```tsx
// img src 로 바로 사용 (TOKEN 사용 시엔 fetch + blob 으로)
<img src={`${apiUrl}/pending/${trackId}/thumbnail`} />
```

> 토큰 인증이 켜진 환경에서는 `<img src>` 가 Authorization 헤더를 못 붙이므로
> `fetch` 로 blob 받아서 `URL.createObjectURL` 로 띄워야 함.

---

### `POST /register`

pending 항목을 supabase `dogs` 테이블 행으로 commit + 로컬 갤러리에 등록.

**Body** (`application/json`)
```json
{
  "track_id": 7,
  "name": "초코",
  "breed_code": "SHIBA_DOG",
  "weight_kg": 8.2,
  "photo_url": "https://...",       // optional
  "shelter_id": "uuid",              // optional
  "food_type": "소형견용 일반사료",  // optional
  "recommended_g": 60,               // optional
  "vet_note": "알레르기 없음"        // optional
}
```

필수: `track_id` (int), `name` (non-empty string), `breed_code` (string, `breeds.code` FK), `weight_kg` (number > 0).

**응답 201**
```json
{
  "ok": true,
  "dog_id": "8c4f...",
  "name": "초코",
  "track_id": 7
}
```

**에러**

| HTTP | 의미 |
|---|---|
| `400` | 필수 필드 누락 / 타입 오류 |
| `404` | `track_id` 에 해당하는 pending feature 가 없음 (TTL 만료 / 이미 등록) |
| `409` | `breed_code` FK 위배 또는 동일 보호소 내 이름 중복 (Supabase 에서 거부) |
| `500` | Pi 측 supabase 설정 누락 |
| `502` | Supabase 요청 자체 실패 (네트워크 / 알 수 없는 응답) |

**사이드 이펙트** (Pi 가 자동 처리, 웹은 추가 호출 불필요)
1. Supabase `dogs` 테이블에 행 insert — `embedding` (vector(512)) 포함.
2. 해당 `track_id` 의 미등록 접근 alert 가 떠 있었으면 `resolved_at` 으로 PATCH.
3. 새로 등록된 feature 와 거리가 `PENDING_DEDUP_DIST` (= 0.6) 미만인 다른 pending tid 들을
   "같은 개체로 추정" 하고 같이 정리 (entry 삭제 + 각각의 alert resolve).
4. 로컬 갤러리 (in-memory) 에 추가 — 이후 같은 개체가 다시 잡히면 Unknown 안 뜸.

---

### `POST /feeding/start`

급식 세션 시작 — 일정 시간 동안 'feeding active' 상태. Pi 가 호명 WAV 재생하고,
세션 진행 중 Unknown 감지되면 경고 WAV + `kind=feeding_blocked` alert 발행.

**Body** (`application/json`)
```json
{
  "dog_id": "8c4f-...",
  "name": "초코",
  "duration_sec": 60
}
```

필수: `dog_id` (string). `name` 은 로깅용 (없어도 OK). `duration_sec` 기본 60, 범위 1..600.

**응답 201**
```json
{
  "ok": true,
  "status": {
    "dog_id": "8c4f-...",
    "name": "초코",
    "started_at": 1748000000.0,
    "ends_at": 1748000060.0,
    "remaining_sec": 60,
    "blocked_count": 0
  }
}
```

**에러**

| HTTP | 의미 |
|---|---|
| `400` | `dog_id` 누락 / 타입 오류 / `duration_sec` 범위 밖 |
| `409` | 이미 다른 세션 진행 중 (`error` 에 잔여 시간 표시) |
| `503` | Pi 가 feeding 미구성 — 일반적으로는 안 떠야 함 |

**사이드 이펙트**
1. `sounds/dogs/<dog_id>.wav` 가 있으면 즉시 재생 (없으면 silent skip).
2. infer_loop 이 매 cycle 마다 Unknown 감지 → `feeding.on_unknown_detected()`:
   - 5 초 debounce 후 `sounds/warning.wav` 재생
   - `unregistered_access` alert 1 건 insert — `severity='danger'`, `title='급식 차단 — 미등록 개체 #N 접근'`, `message=JSON({device_id, track_id, kind:'feeding_blocked'})`
3. `duration_sec` 경과 후 세션 자동 종료 (서버 측 lazy).

---

### `GET /feeding/status`

현재 세션 정보. 진행 중 아니면 `status: null`.

**응답 200**
```json
{ "status": null }
```
또는
```json
{
  "status": {
    "dog_id": "8c4f-...",
    "name": "초코",
    "started_at": 1748000000.0,
    "ends_at": 1748000060.0,
    "remaining_sec": 42,
    "blocked_count": 2
  }
}
```

페이지 리로드 후 UI 동기화용으로 마운트 시 1 회 호출 권장. 폴링은 1 초 간격 카운트다운만 클라이언트에서 처리.

---

### `GET /gallery`

로컬 (in-memory) 갤러리. 디버깅용.

**응답 200**
```json
{
  "dogs": [
    { "name": "초코", "dog_id": "8c4f..." },
    { "name": "두부", "dog_id": "1a2e..." }
  ]
}
```

Pi 가 부팅 시 Supabase `dogs` 에서 `embedding is not null` 인 행들을 끌어와서 채움.
운영 중에는 `/register` 성공 시마다 추가됨.

---

### `DELETE /gallery/<name>`

로컬 갤러리에서만 제거. Supabase `dogs` 행은 그대로 둔다 (그쪽은 UI 에서 직접 처리).

**응답 200**
```json
{"ok": true, "name": "초코"}
```

**응답 404** — `{"ok": false, "error": "'<name>' not in local gallery"}`.

> 보통 안 씀. 일반적인 "개체 삭제" 흐름은 웹에서 supabase `dogs.status = archived` 처리.

---

## Pi 가 Supabase 에 직접 쓰는 것들

웹 개발자가 의도치 않게 중복 처리하지 않도록 명시:

| 시점 | 테이블 | 동작 |
|---|---|---|
| 새 pending 생성 | `alerts` | `type='unregistered_access'`, `severity='warn'`, `title='미등록 개체 #N 접근'`, `message=JSON({device_id, track_id})` 로 1 건 insert. daemon thread async. |
| `/register` 성공 | `dogs` | embedding 포함 1 건 insert. 그리고 해당 alert resolve. |
| TTL 만료 (60s 시야 밖) | `alerts` | 해당 pending 의 alert 가 있었으면 resolve. |
| pending dedup (`/register` 후) | `alerts` | 함께 정리된 pending tid 들의 alert 도 resolve. |
| Unknown → 갤러리 매칭 전이 | `alerts` | (드물지만) 해당 alert 가 있었으면 resolve. |
| 급식 세션 중 Unknown 감지 | `alerts` | `severity='danger'`, `title='급식 차단 — 미등록 개체 #N 접근'`, `message` 에 `kind='feeding_blocked'` 추가. 같은 세션에서 5 초 debounce. |

**즉, 웹은 `alerts` 테이블에 `unregistered_access` 행을 _쓰지_ 않는다.** 읽기만 + 클릭 시 라우팅.
resolve 도 Pi 가 알아서 함.

## 동작 상수 (Pi 측)

웹이 알아두면 좋은 값:

| 상수 | 값 | 위치 | 의미 |
|---|---|---|---|
| `PENDING_TTL_SEC` | 60 | `main_v3.py` | 카메라에서 사라진 채 이만큼 지나면 pending 자동 만료 + alert resolve |
| `PENDING_DEDUP_DIST` | 0.6 | `main_v3.py` | 새로 등록된 feature 와 거리 < 이 값이면 같은 개체로 보고 다른 pending 정리 |
| `VOTE_WINDOW` | 15 | `main_v3.py` | breed 예측 / 매칭 vote buffer 길이 |
| `DIST_THRESHOLD` | 0.6 | `main_v3.py` | 갤러리 매칭 임계값 |
| `WARMUP_FRAMES` | 3 | `main_v3.py` | 첫 stable_id 결정 전 모으는 프레임 수 |

상수 변경 시 이 문서도 같이 업데이트.

## Alert message 포맷

`type === 'unregistered_access'` 인 alert 의 `message` 컬럼은 다음 JSON 문자열:

```json
{"device_id": "feeder-1", "track_id": 7}
```

웹은 `JSON.parse(message)` 로 풀어서 `/dogs?registerPendingTid=<track_id>&deviceId=<device_id>` 로 라우팅.

다른 `type` 의 alert 들은 평범한 텍스트 message — `JSON.parse` 가 실패해도 정상.
`lib/feederApi.ts` 의 `parseUnregisteredAccessMessage()` 가 이걸 안전하게 처리.

## 표준 사용 시퀀스

```
1. Pi 가 미등록 개체 감지
   → /pending 에 entry 생성
   → supabase alerts insert (async)

2. 웹 (Dashboard / Alerts) 가 alerts realtime 구독으로 새 알람 표시
   → 사용자가 알람 클릭
   → navigate('/dogs?registerPendingTid=...&deviceId=...')

3. Dogs 페이지가 URL param 감지
   → DogFormDialog 를 pending 모드로 open
   → 모달 마운트 시 GET /pending → 매칭 tid 의 predicted_breed_code 로 select prefill
   → <img src> 로 GET /pending/<tid>/thumbnail 표시

4. 사용자가 이름 / 체중 입력 후 등록 클릭
   → POST /register
   → Pi 가 supabase dogs insert + alert resolve
   → 모달 닫기, 갤러리 갱신
```

## 에러 처리 권장 사항

- **`/pending` 실패** (네트워크 오류 등): 모달은 prefill 없이 열어두기. 사용자가 수동 입력.
- **썸네일 404**: "썸네일 없음" placeholder 표시. 등록 자체는 가능.
- **`/register` 4xx**: `error` 메시지 그대로 모달에 노출 — Pi 가 사용자 친화적으로 적어둠.
- **`/register` 502/500**: "Pi 또는 Supabase 통신 실패" 라고 보여주고 재시도 버튼.
- **예측 품종이 supabase `breeds` 마스터에 없음**: prefill 스킵하고 기본값 유지 (`DogFormDialog` 가 이미 그렇게 동작).

## TypeScript 타입 (`web/src/lib/feederApi.ts`)

```ts
interface PendingItem {
  track_id: number;
  expires_in_sec: number;
  has_thumbnail: boolean;
  predicted_breed_code: string | null;
}

interface RegisterPayload {
  track_id: number;
  name: string;
  breed_code: string;
  weight_kg: number;
  photo_url?: string;
  shelter_id?: string;
  food_type?: string;
  recommended_g?: number;
  vet_note?: string;
}

interface UnregisteredAccessMeta {
  device_id: string;
  track_id: number;
}
```

응답이 위 인터페이스와 어긋나면 Pi 코드 (`feeder_api.py` / `main_v3.py`) 가 단일 진실원본.
