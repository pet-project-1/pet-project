import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Play } from "lucide-react";
import PageHeader, { LiveBadge } from "@/components/PageHeader";
import CameraBox from "@/components/CameraBox";
import StatusPill from "@/components/StatusPill";
import { useAlertsQuery, useDogsQuery, useFeedingsQuery } from "@/hooks/queries";
import {
  deviceIdToApiUrl,
  getFeedingStatus,
  parseUnregisteredAccessMessage,
  startFeeding,
  type FeedingStatus,
} from "@/lib/feederApi";

const FEEDER_1_ID = import.meta.env.VITE_FEEDER_1_DEVICE_ID;
const FEEDER_2_ID = import.meta.env.VITE_FEEDER_2_DEVICE_ID;

function FeederCard({
  index,
  deviceId,
}: {
  index: number;
  deviceId?: string;
}) {
  const apiUrl = deviceIdToApiUrl(deviceId);
  const { data: dogs = [] } = useDogsQuery();
  const { data: alerts = [] } = useAlertsQuery();

  const [selectedDogId, setSelectedDogId] = useState<string>("");
  const [feeding, setFeeding] = useState<FeedingStatus | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 마운트 시 Pi 의 현재 세션 상태 동기화 (페이지 리로드 대응).
  useEffect(() => {
    if (!apiUrl) return;
    let cancelled = false;
    getFeedingStatus(apiUrl)
      .then((s) => {
        if (!cancelled) setFeeding(s);
      })
      .catch(() => {
        /* Pi unreachable — silent */
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  // 진행 중일 때만 1 초 카운트다운.
  useEffect(() => {
    if (!feeding) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [feeding]);

  // 세션 만료 자동 정리.
  useEffect(() => {
    if (feeding && now >= feeding.ends_at * 1000) {
      setFeeding(null);
    }
  }, [feeding, now]);

  const onStart = async () => {
    if (!selectedDogId || !apiUrl) return;
    const dog = dogs.find((d) => d.id === selectedDogId);
    if (!dog) return;
    setStarting(true);
    setError(null);
    try {
      const status = await startFeeding(apiUrl, {
        dog_id: dog.id,
        name: dog.name,
        duration_sec: 60,
        dispensed_g: dog.recommended_g ?? 60,
      });
      setFeeding(status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  // 진행 중 발생한 급식 차단 alert (세션 시작 시각 이후, 같은 device).
  const blockedAlert = useMemo(() => {
    if (!feeding) return null;
    const startMs = feeding.started_at * 1000;
    return alerts.find((a) => {
      if (a.type !== "unregistered_access") return false;
      const meta = parseUnregisteredAccessMessage(a.message);
      if (!meta || meta.kind !== "feeding_blocked") return false;
      if (meta.device_id !== deviceId) return false;
      return new Date(a.created_at).getTime() >= startMs;
    });
  }, [alerts, feeding, deviceId]);

  const remaining = feeding
    ? Math.max(0, Math.ceil((feeding.ends_at * 1000 - now) / 1000))
    : 0;

  const activeDogs = dogs.filter((d) => d.status === "active");

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-bold text-ink-body">
          <span
            className={`h-2 w-2 rounded-full ${
              feeding ? "bg-accent-warn animate-pulse" : "bg-brand-dark"
            }`}
          />
          급식기 {index}번
        </div>
        <span
          className={`pill ${
            feeding
              ? "bg-accent-warn/15 text-accent-warn"
              : "bg-brand/20 text-brand-dark"
          }`}
        >
          {feeding ? `급식 중 · ${remaining}s` : "정상"}
        </span>
      </div>

      <CameraBox
        label={`급식기 ${index}번 실시간 영상`}
        deviceId={deviceId}
        height={400}
      />

      {blockedAlert && (
        <div className="mt-3 rounded-lg border border-accent-danger/30 bg-accent-danger/5 px-3 py-2 text-[12px] font-semibold text-accent-danger">
          ⚠ 급식 차단 — 미등록 개체 접근 감지. 경고음 재생됨.
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <select
          className="input h-9 flex-1 text-[12px]"
          value={selectedDogId}
          onChange={(e) => setSelectedDogId(e.target.value)}
          disabled={!!feeding || starting}
        >
          <option value="">강아지 선택…</option>
          {activeDogs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.breed_name_ko}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-primary"
          disabled={!selectedDogId || !apiUrl || starting || !!feeding}
          onClick={onStart}
        >
          <Play size={14} />
          {feeding ? `${remaining}s` : starting ? "시작 중…" : "급식 시작"}
        </button>
      </div>

      {!apiUrl && deviceId && (
        <div className="mt-2 text-[11px] text-accent-danger">
          '{deviceId}' API URL 미설정 — web/.env 의 VITE_FEEDER_*_API_URL 확인.
        </div>
      )}
      {error && (
        <div className="mt-2 text-[11px] font-semibold text-accent-danger">
          {error}
        </div>
      )}
    </div>
  );
}

export default function Monitoring() {
  const { data: feedings = [], isLoading } = useFeedingsQuery();

  return (
    <>
      <PageHeader
        title="실시간 모니터링"
        subtitle="급식기 카메라 실시간 영상 및 인식 결과"
        right={<LiveBadge />}
      />

      <div className="mb-5 grid grid-cols-2 gap-5">
        <FeederCard index={1} deviceId={FEEDER_1_ID} />
        <FeederCard index={2} deviceId={FEEDER_2_ID} />
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2 text-[14px] font-bold text-ink-body">
          <span className="h-2 w-2 rounded-full bg-brand-dark" />
          실시간 급식 로그
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-ink-faint">
            <Loader2 className="mr-2 animate-spin" size={16} /> 로딩 중…
          </div>
        ) : feedings.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-ink-mute">
            급식 기록이 없습니다.
          </div>
        ) : (
          <div className="space-y-1.5">
            {feedings.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-4 rounded-lg bg-surface px-3 py-3 text-[12px]"
              >
                <span className="w-12 text-ink-faint">
                  {format(new Date(f.scheduled_at), "HH:mm")}
                </span>
                <span className="w-40 font-bold text-ink-body">
                  {f.dog_name} {f.breed_name_ko !== "-" && `· ${f.breed_name_ko}`}
                </span>
                <span className="flex-1 text-ink-mute">
                  {f.status === "blocked"
                    ? `${f.device_name} 접근`
                    : `${f.consumed_g}g / ${f.dispensed_g}g 섭취`}
                </span>
                <StatusPill status={f.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
