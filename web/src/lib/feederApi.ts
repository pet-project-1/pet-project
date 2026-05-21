// Pi 로컬 HTTP API (smart_feeder/feeder_api.py) 어댑터.
//   /pending                       : 등록 대기 (Unknown) track 목록
//   /pending/<tid>/thumbnail       : 마지막 crop JPEG
//   /register                      : pending → supabase dogs 행 commit + alert resolve
//
// 디바이스 ID (예: "feeder-1") → API URL 매핑은 VITE_FEEDER_N_DEVICE_ID 와
// VITE_FEEDER_N_API_URL 의 동일 N 번 쌍에서 가져온다.

export interface PendingItem {
  track_id: number;
  expires_in_sec: number;
  has_thumbnail: boolean;
  predicted_breed_code: string | null;
}

export interface RegisterPayload {
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

export interface UnregisteredAccessMeta {
  device_id: string;
  track_id: number;
  // 급식 세션 중 차단 케이스 — alert 표시 / 처리 분기에 사용.
  kind?: "feeding_blocked";
}

export interface FeedingStatus {
  dog_id: string;
  name: string;
  started_at: number;
  ends_at: number;
  remaining_sec: number;
  blocked_count: number;
}

export interface FeedingStartPayload {
  dog_id: string;
  name?: string;
  duration_sec?: number;
}

const FEEDERS: { deviceId?: string; apiUrl?: string }[] = [
  {
    deviceId: import.meta.env.VITE_FEEDER_1_DEVICE_ID,
    apiUrl: import.meta.env.VITE_FEEDER_1_API_URL,
  },
  {
    deviceId: import.meta.env.VITE_FEEDER_2_DEVICE_ID,
    apiUrl: import.meta.env.VITE_FEEDER_2_API_URL,
  },
];

const TOKEN = import.meta.env.VITE_FEEDER_API_TOKEN;

function authHeaders(): Record<string, string> {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

export function deviceIdToApiUrl(deviceId: string | null | undefined): string | undefined {
  if (!deviceId) return undefined;
  return FEEDERS.find((f) => f.deviceId === deviceId)?.apiUrl;
}

// Pi 가 alerts.message 에 JSON.stringify({device_id, track_id, kind?}) 로 임베드한
// 식별자를 추출. 옛 포맷(text)이거나 다른 alert type 이면 null.
// kind === 'feeding_blocked' 면 급식 세션 중 차단 케이스.
export function parseUnregisteredAccessMessage(message: string): UnregisteredAccessMeta | null {
  try {
    const parsed = JSON.parse(message);
    if (
      parsed &&
      typeof parsed.device_id === "string" &&
      typeof parsed.track_id === "number"
    ) {
      const out: UnregisteredAccessMeta = {
        device_id: parsed.device_id,
        track_id: parsed.track_id,
      };
      if (parsed.kind === "feeding_blocked") out.kind = "feeding_blocked";
      return out;
    }
  } catch {
    /* JSON 아님 — null */
  }
  return null;
}

export async function fetchPending(apiUrl: string): Promise<PendingItem[]> {
  const resp = await fetch(`${apiUrl}/pending`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`pending 조회 실패 (HTTP ${resp.status})`);
  const json = await resp.json();
  return (json.pending ?? []) as PendingItem[];
}

export function pendingThumbnailUrl(apiUrl: string, trackId: number): string {
  return `${apiUrl}/pending/${trackId}/thumbnail`;
}

export async function registerPendingDog(
  apiUrl: string,
  payload: RegisterPayload,
): Promise<{ dog_id: string; name: string; track_id: number }> {
  const resp = await fetch(`${apiUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => ({} as any));
  if (!resp.ok || json.ok === false) {
    throw new Error(json.error || `등록 실패 (HTTP ${resp.status})`);
  }
  return { dog_id: json.dog_id, name: json.name, track_id: json.track_id };
}

export async function startFeeding(
  apiUrl: string,
  payload: FeedingStartPayload,
): Promise<FeedingStatus> {
  const resp = await fetch(`${apiUrl}/feeding/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => ({} as any));
  if (!resp.ok || json.ok === false) {
    throw new Error(json.error || `급식 시작 실패 (HTTP ${resp.status})`);
  }
  return json.status as FeedingStatus;
}

export async function getFeedingStatus(apiUrl: string): Promise<FeedingStatus | null> {
  const resp = await fetch(`${apiUrl}/feeding/status`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`급식 상태 조회 실패 (HTTP ${resp.status})`);
  const json = await resp.json();
  return (json.status as FeedingStatus | null) ?? null;
}
