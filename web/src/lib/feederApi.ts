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

// Pi 가 alerts.message 에 JSON.stringify({device_id, track_id}) 로 임베드한 식별자를 추출.
// 옛 포맷(text)이거나 다른 alert type 이면 null.
export function parseUnregisteredAccessMessage(message: string): UnregisteredAccessMeta | null {
  try {
    const parsed = JSON.parse(message);
    if (
      parsed &&
      typeof parsed.device_id === "string" &&
      typeof parsed.track_id === "number"
    ) {
      return parsed as UnregisteredAccessMeta;
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
